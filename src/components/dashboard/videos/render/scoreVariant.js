/**
 * Variant recommendation scoring + posting package.
 *
 * Scores each reel variant on readability, brevity, CTA quality,
 * and feature-type relevance to recommend the strongest default.
 * Also generates posting package metadata.
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

export function scoreVariants(variants, { cta = '', featureType = 'generalDemo' } = {}) {
  const scored = variants.map((v) => {
    const brevity = scoreBrevity(v.headline);
    const clarity = scoreClarity(v.headline);
    const ctaQ = scoreCtaQuality(cta);
    const relevance = scoreRelevance(v.headline, featureType);

    const total = brevity * 0.25 + clarity * 0.25 + ctaQ * 0.2 + relevance * 0.3;

    return { ...v, score: parseFloat(total.toFixed(3)) };
  });

  const maxScore = Math.max(...scored.map(s => s.score));
  return scored.map(v => ({
    ...v,
    recommended: v.score === maxScore,
  }));
}

/**
 * Build posting package recommendation from scored variants.
 */
export function buildPostingPackage(variants, { caption = '', featureType = '', hookStyle = '' } = {}) {
  const recommended = variants.find(v => v.recommended) || variants[0];

  return {
    recommendedVariant: recommended ? {
      id: recommended.id,
      tone: recommended.tone,
      headline: recommended.headline,
      score: recommended.score,
    } : null,
    recommendedCover: recommended?.coverBlob ? 'frame' : 'intro',
    caption,
    hookStyleSummary: hookStyle
      ? `${hookStyle.charAt(0).toUpperCase() + hookStyle.slice(1)} hook`
      : null,
    featureType,
    variantCount: variants.length,
  };
}
