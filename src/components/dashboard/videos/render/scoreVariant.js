/**
 * Variant recommendation scoring + posting package.
 *
 * Five scoring dimensions:
 *   - hookCuriosity:     does the hook provoke curiosity?
 *   - headlineLength:    ideal 3-7 words for mobile
 *   - mobileReadability: char count for small screens
 *   - ctaClarity:        has clear destination + action verb
 *   - platformFit:       Instagram Reels content patterns
 *
 * Weights: curiosity 0.35, readability 0.25, CTA 0.20, platform 0.20
 */

import { FEATURE_TYPES } from '../templates/featureSpotlight';

const IDEAL_HEADLINE_WORDS = { min: 3, max: 7 };
const SPAMMY_PATTERNS = /!{2,}|ALL CAPS|FREE FREE/i;

const CURIOSITY_SIGNALS = [
  'why', 'how', 'what', 'secret', 'miss', 'before', 'stop', 'most',
  'hidden', 'real', 'actually', 'truth', 'changed', 'discover',
  'nobody', 'overlooked', 'figured', 'smarter', 'better', 'faster',
];

const PLATFORM_SIGNALS = [
  'instantly', 'seconds', 'one tap', 'real-time', 'live',
  'track', 'pin', 'edge', 'signal', 'intel',
];

function wordCount(text) {
  return (text || '').trim().split(/\s+/).filter(Boolean).length;
}

function scoreHookCuriosity(headline) {
  if (!headline) return 0;
  const lower = headline.toLowerCase();
  const isQuestion = /\?/.test(headline);
  const isContrarian = /not|don't|stop|most|miss/i.test(headline);
  const curiosityHits = CURIOSITY_SIGNALS.filter(s => lower.includes(s)).length;

  let score = 0.3;
  if (isQuestion) score += 0.25;
  if (isContrarian) score += 0.2;
  score += Math.min(0.5, curiosityHits * 0.15);
  return Math.min(1, score);
}

function scoreHeadlineLength(headline) {
  const wc = wordCount(headline);
  if (wc >= IDEAL_HEADLINE_WORDS.min && wc <= IDEAL_HEADLINE_WORDS.max) return 1;
  if (wc < IDEAL_HEADLINE_WORDS.min) return 0.6;
  if (wc <= 10) return 0.7;
  return 0.4;
}

function scoreMobileReadability(headline) {
  if (!headline) return 0;
  if (SPAMMY_PATTERNS.test(headline)) return 0.2;
  const charLen = headline.length;
  const hasCapStart = /^[A-Z]/.test(headline);
  const hasCleanEnd = /[a-zA-Z.!?]$/.test(headline);

  let score = 0;
  if (charLen <= 30) score += 0.5;
  else if (charLen <= 45) score += 0.35;
  else score += 0.15;

  if (hasCapStart) score += 0.25;
  if (hasCleanEnd) score += 0.25;
  return Math.min(1, score);
}

function scoreCtaClarity(cta) {
  if (!cta) return 0.2;
  const hasUrl = /maximussports/i.test(cta);
  const hasHandle = /@maximussports/i.test(cta);
  const hasAction = /get|follow|explore|try|create|start|discover|see/i.test(cta);
  let score = 0.2;
  if (hasUrl || hasHandle) score += 0.4;
  if (hasAction) score += 0.3;
  if (cta.length <= 50) score += 0.1;
  return Math.min(1, score);
}

function scorePlatformFit(headline, featureType) {
  if (!headline) return 0.3;
  const lower = headline.toLowerCase();
  const platformHits = PLATFORM_SIGNALS.filter(s => lower.includes(s)).length;

  const ft = FEATURE_TYPES[featureType];
  let relevanceBonus = 0;
  if (ft) {
    const keywordHits = ft.keywords.filter(kw => lower.includes(kw)).length;
    const actionHits = ft.actions.filter(a => lower.includes(a.toLowerCase())).length;
    relevanceBonus = Math.min(0.3, keywordHits * 0.1 + actionHits * 0.15);
  }

  const brevityBonus = wordCount(headline) <= 6 ? 0.15 : 0;

  return Math.min(1, 0.25 + platformHits * 0.12 + relevanceBonus + brevityBonus);
}

function explainScore(breakdown) {
  const strengths = [];

  if (breakdown.hookCuriosity >= 0.7) strengths.push('strong curiosity hook');
  if (breakdown.headlineLength >= 0.9) strengths.push('ideal headline length');
  if (breakdown.mobileReadability >= 0.8) strengths.push('best mobile readability');
  if (breakdown.ctaClarity >= 0.8) strengths.push('clear CTA');
  if (breakdown.platformFit >= 0.7) strengths.push('high platform fit');

  if (strengths.length === 0) {
    if (breakdown.hookCuriosity >= 0.5) strengths.push('good curiosity');
    if (breakdown.mobileReadability >= 0.6) strengths.push('readable');
    if (strengths.length === 0) strengths.push('balanced quality');
  }

  return strengths.slice(0, 3).join(' + ');
}

export function scoreVariants(variants, { cta = '', featureType = 'generalDemo' } = {}) {
  const scored = variants.map((v) => {
    const hookCuriosity = scoreHookCuriosity(v.headline);
    const headlineLength = scoreHeadlineLength(v.headline);
    const mobileReadability = scoreMobileReadability(v.headline);
    const ctaClarity = scoreCtaClarity(cta);
    const platformFit = scorePlatformFit(v.headline, featureType);

    const total =
      hookCuriosity * 0.35 +
      mobileReadability * 0.25 +
      ctaClarity * 0.20 +
      platformFit * 0.20;

    const breakdown = { hookCuriosity, headlineLength, mobileReadability, ctaClarity, platformFit };

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

function explainCover(type) {
  if (type === 'frame') return 'Strongest footage frame — highest visual engagement';
  return 'Clearest headline readability';
}

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
