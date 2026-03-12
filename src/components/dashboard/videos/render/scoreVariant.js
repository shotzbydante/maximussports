/**
 * Variant recommendation scoring + posting package.
 *
 * Scores each reel variant on readability, brevity, CTA quality,
 * and feature-type relevance. Adds lightweight explainability
 * labels to help users understand why a variant was recommended.
 */

import { FEATURE_TYPES } from '../templates/featureSpotlight';

const IDEAL_HEADLINE_WORDS = { min: 3, max: 7 };
const SPAMMY_PATTERNS = /!{2,}|ALL CAPS|FREE FREE/i;

function wordCount(text) {
  return (text || '').trim().split(/\s+/).filter(Boolean).length;
}

function scoreBrevity(headline) {
  const wc = wordCount(headline);
  if (wc >= IDEAL_HEADLINE_WORDS.min && wc <= IDEAL_HEADLINE_WORDS.max) return 1;
  if (wc < IDEAL_HEADLINE_WORDS.min) return 0.6;
  if (wc <= 10) return 0.7;
  return 0.4;
}

function scoreClarity(headline) {
  if (!headline || headline.length === 0) return 0;
  if (SPAMMY_PATTERNS.test(headline)) return 0.3;
  const hasCapStart = /^[A-Z]/.test(headline);
  const hasCleanEnd = /[a-zA-Z.!?]$/.test(headline);
  return (hasCapStart ? 0.5 : 0.3) + (hasCleanEnd ? 0.5 : 0.3);
}

function scoreCtaQuality(cta) {
  if (!cta) return 0.2;
  const hasUrl = /maximussports/i.test(cta);
  const hasHandle = /@maximussports/i.test(cta);
  const hasAction = /get|follow|explore|try|create|start/i.test(cta);
  let score = 0.3;
  if (hasUrl || hasHandle) score += 0.4;
  if (hasAction) score += 0.3;
  return Math.min(1, score);
}

function scoreRelevance(headline, featureType) {
  const ft = FEATURE_TYPES[featureType];
  if (!ft) return 0.5;
  const lower = headline.toLowerCase();
  const keywordHits = ft.keywords.filter(kw => lower.includes(kw)).length;
  const actionHits = ft.actions.filter(a => lower.includes(a.toLowerCase())).length;
  const objectHits = ft.objects.filter(o => lower.includes(o.toLowerCase().split(' ')[0])).length;
  return Math.min(1, 0.3 + keywordHits * 0.15 + actionHits * 0.2 + objectHits * 0.15);
}

function scoreReadability(headline) {
  if (!headline) return 0;
  const charLen = headline.length;
  if (charLen <= 35) return 1;
  if (charLen <= 50) return 0.8;
  return 0.5;
}

function explainScore(breakdown) {
  const strengths = [];

  if (breakdown.brevity >= 0.9) strengths.push('ideal headline length');
  else if (breakdown.brevity >= 0.7) strengths.push('good headline length');

  if (breakdown.clarity >= 0.9) strengths.push('strong hook clarity');
  if (breakdown.readability >= 0.9) strengths.push('best mobile readability');
  if (breakdown.relevance >= 0.8) strengths.push('high feature relevance');
  if (breakdown.ctaQ >= 0.8) strengths.push('strong CTA');

  if (strengths.length === 0) strengths.push('balanced quality');
  return strengths.slice(0, 2).join(' + ');
}

export function scoreVariants(variants, { cta = '', featureType = 'generalDemo' } = {}) {
  const scored = variants.map((v) => {
    const brevity = scoreBrevity(v.headline);
    const clarity = scoreClarity(v.headline);
    const ctaQ = scoreCtaQuality(cta);
    const relevance = scoreRelevance(v.headline, featureType);
    const readability = scoreReadability(v.headline);

    const total = brevity * 0.2 + clarity * 0.2 + ctaQ * 0.15 + relevance * 0.25 + readability * 0.2;
    const breakdown = { brevity, clarity, ctaQ, relevance, readability };

    return {
      ...v,
      score: parseFloat(total.toFixed(3)),
      scoreBreakdown: breakdown,
      explanation: explainScore(breakdown),
    };
  });

  const maxScore = Math.max(...scored.map(s => s.score));
  return scored.map(v => ({
    ...v,
    recommended: v.score === maxScore,
  }));
}

/**
 * Explain why a cover type was recommended.
 */
function explainCover(type) {
  if (type === 'frame') return 'Strongest footage frame — highest visual engagement';
  return 'Clearest headline readability';
}

/**
 * Build posting package recommendation from scored variants.
 */
export function buildPostingPackage(variants, { caption = '', featureType = '', hookStyle = '' } = {}) {
  const recommended = variants.find(v => v.recommended) || variants[0];

  const recommendedCoverType = recommended?.coverBlob ? 'frame' : 'intro';

  return {
    recommendedVariant: recommended ? {
      id: recommended.id,
      tone: recommended.tone,
      headline: recommended.headline,
      score: recommended.score,
      explanation: recommended.explanation || 'Best overall quality',
    } : null,
    recommendedCover: recommendedCoverType,
    coverExplanation: explainCover(recommendedCoverType),
    caption,
    hookStyleSummary: hookStyle
      ? `${hookStyle.charAt(0).toUpperCase() + hookStyle.slice(1)} hook`
      : null,
    featureType,
    variantCount: variants.length,
    allScores: variants.map(v => ({
      id: v.id,
      score: v.score,
      explanation: v.explanation,
      recommended: v.recommended,
    })),
  };
}
