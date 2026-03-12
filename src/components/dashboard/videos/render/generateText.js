/**
 * Structured text generation for reel overlays.
 *
 * Generates marketing copy from three structured inputs:
 *   1. Feature Type  — what the video demonstrates
 *   2. Hook Style    — how the hook is phrased
 *   3. Prompt Context — optional free-text for extra flavor
 *
 * Designed to be swappable with a real LLM endpoint later.
 * The function signatures stay the same.
 */

import {
  FEATURE_TYPES,
  HOOK_STYLES,
  CTA_TYPES,
  VARIANT_COMBOS,
} from '../templates/featureSpotlight';

// ─── Auto-detect feature type from prompt context ────────────────

export function detectFeatureType(promptContext) {
  if (!promptContext) return 'generalDemo';
  const lower = promptContext.toLowerCase();
  const scored = Object.entries(FEATURE_TYPES).map(([id, ft]) => {
    const hits = ft.keywords.filter(kw => lower.includes(kw)).length;
    return { id, hits };
  });
  scored.sort((a, b) => b.hits - a.hits);
  return scored[0].hits > 0 ? scored[0].id : 'generalDemo';
}

// ─── Core generation ─────────────────────────────────────────────

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickDeterministic(arr, seed) {
  return arr[seed % arr.length];
}

function generateHeadline(featureType, hookStyle, seed = 0) {
  const ft = FEATURE_TYPES[featureType] || FEATURE_TYPES.generalDemo;
  const hs = HOOK_STYLES[hookStyle] || HOOK_STYLES.product;
  const action = ft.actions[0];
  const object = ft.objects[0];
  const template = pickDeterministic(hs.headlineTemplates, seed);
  return template(action, object);
}

function generateSubhead(featureType) {
  const ft = FEATURE_TYPES[featureType] || FEATURE_TYPES.generalDemo;
  return pick(ft.subheads);
}

function generateBeats(featureType) {
  const ft = FEATURE_TYPES[featureType] || FEATURE_TYPES.generalDemo;
  return [...ft.beats];
}

function generateCta(ctaType, featureType) {
  const ct = CTA_TYPES[ctaType];
  if (!ct || ctaType === 'custom') return '';

  if (ct.templates && ct.templates.length > 0) {
    const ft = FEATURE_TYPES[featureType] || FEATURE_TYPES.generalDemo;

    if (ctaType === 'intel' && featureType !== 'generalDemo') {
      return `Get ${ft.objects[0]} intel at maximussports.ai`;
    }
    return pick(ct.templates);
  }

  return ct.defaultText || '';
}

// ─── Main generation: returns all fields ─────────────────────────

export function generateReelText(promptContext, ctaType = 'website', featureType = null, hookStyle = 'product') {
  const resolvedFeature = featureType || detectFeatureType(promptContext);
  const resolvedHook = hookStyle || 'product';

  const headline = generateHeadline(resolvedFeature, resolvedHook, 0);
  const subhead = generateSubhead(resolvedFeature);
  const overlayBeats = generateBeats(resolvedFeature);
  const cta = generateCta(ctaType, resolvedFeature);

  const combos = VARIANT_COMBOS[resolvedHook] || VARIANT_COMBOS.product;
  const variantHooks = combos.map((style, i) => ({
    id: style,
    tone: style,
    headline: generateHeadline(resolvedFeature, style, i),
  }));

  return {
    headline,
    subhead,
    overlayBeats,
    cta,
    variantHooks,
    detectedFeatureType: resolvedFeature,
  };
}

// ─── Variant-specific generation ─────────────────────────────────

export function generateVariantText(promptContext, hookStyle = 'product', featureType = null) {
  const resolvedFeature = featureType || detectFeatureType(promptContext);
  const resolvedHook = hookStyle || 'product';

  const headline = generateHeadline(resolvedFeature, resolvedHook, Math.floor(Math.random() * 3));
  const subhead = generateSubhead(resolvedFeature);
  const overlayBeats = generateBeats(resolvedFeature);

  return { headline, subhead, overlayBeats };
}
