/**
 * Generation adapter layer.
 *
 * Calls the OpenAI server route first. If it fails or is unavailable,
 * falls back to the local heuristic copy bank. The interface is the
 * same regardless of backend — callers never need to know which
 * engine produced the copy.
 */

import {
  generateReelText,
  generateVariantText,
  detectFeatureType,
  generateCaption,
} from './generateText';

export const GENERATION_MODES = {
  heuristic: 'heuristic',
  llm: 'llm',
};

function normalizeInput(raw) {
  return {
    promptContext: raw.promptContext || '',
    featureType: raw.featureType || null,
    hookStyle: raw.hookStyle || 'product',
    templateId: raw.templateId || 'feature-spotlight',
    ctaDestination: raw.ctaDestination || 'website',
    messageAngle: raw.messageAngle || 'demo',
    copyIntensity: raw.copyIntensity || 'balanced',
    captionTone: raw.captionTone || 'instagram',
    clipDuration: raw.clipDuration ?? null,
    segmentCount: raw.segmentCount ?? null,
    analysisAvailable: raw.analysisAvailable ?? false,
    analysisSummary: raw.analysisSummary ?? null,
    editPlanSummary: raw.editPlanSummary ?? null,
  };
}

/**
 * Generate all reel copy from structured inputs.
 * Tries OpenAI first, falls back to heuristic on any error.
 *
 * @returns {Promise<{ headline, subhead, overlayBeats, cta, variantHooks, caption,
 *   coverTitle, detectedFeatureType, generationMode, input }>}
 */
export async function generate(rawInput) {
  const input = normalizeInput(rawInput);

  const featureType =
    input.featureType && input.featureType !== 'generalDemo'
      ? input.featureType
      : detectFeatureType(input.promptContext) || 'generalDemo';

  const inputWithFeature = { ...input, featureType };

  try {
    const llmResult = await callLLM(inputWithFeature);
    if (llmResult) {
      return {
        headline: llmResult.headline || '',
        subhead: llmResult.subhead || '',
        overlayBeats: llmResult.overlayBeats || [],
        cta: llmResult.cta || '',
        variantHooks: (llmResult.variants || []).map(v => ({
          id: v.id || v.tone,
          tone: v.tone || v.id,
          headline: v.headline || '',
          subhead: v.subhead || '',
          overlayBeats: v.overlayBeats || [],
          cta: v.cta || '',
        })),
        caption: llmResult.caption || '',
        coverTitle: llmResult.headline || '',
        detectedFeatureType: featureType,
        generationMode: GENERATION_MODES.llm,
        input: inputWithFeature,
      };
    }
  } catch {
    // fall through to heuristic
  }

  return generateHeuristic(inputWithFeature, featureType);
}

/**
 * Generate copy for a single variant (always heuristic for speed).
 */
export async function generateVariant(rawInput, hookStyle) {
  const input = normalizeInput(rawInput);
  const featureType =
    input.featureType || detectFeatureType(input.promptContext) || 'generalDemo';

  return generateVariantText(
    input.promptContext,
    hookStyle,
    featureType,
    input.messageAngle,
    input.copyIntensity,
  );
}

/**
 * Check if LLM generation is likely available (server route exists).
 */
export function isLLMAvailable() {
  return true;
}

// ─── LLM path ────────────────────────────────────────────────────

async function callLLM(input) {
  const res = await fetch('/api/reels/generateCopy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      promptContext: input.promptContext,
      featureType: input.featureType,
      templateType: input.templateId,
      hookStyle: input.hookStyle,
      ctaType: input.ctaDestination,
      messageAngle: input.messageAngle,
      copyIntensity: input.copyIntensity,
      captionTone: input.captionTone,
      analysisSummary: input.analysisSummary,
      editPlanSummary: input.editPlanSummary,
    }),
  });

  if (!res.ok) return null;

  const data = await res.json();
  if (data.error || !data.headline) return null;
  return data;
}

// ─── Heuristic fallback ──────────────────────────────────────────

function generateHeuristic(input, featureType) {
  const result = generateReelText(
    input.promptContext,
    input.ctaDestination,
    featureType,
    input.hookStyle,
    input.messageAngle,
    input.copyIntensity,
  );

  const caption = generateCaption(
    featureType,
    input.hookStyle,
    result.headline,
    input.ctaDestination,
  );

  return {
    headline: result.headline,
    subhead: result.subhead,
    overlayBeats: result.overlayBeats,
    cta: result.cta,
    variantHooks: result.variantHooks,
    caption,
    coverTitle: result.headline,
    detectedFeatureType: featureType,
    generationMode: GENERATION_MODES.heuristic,
    input,
  };
}
