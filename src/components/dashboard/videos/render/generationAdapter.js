/**
 * Generation adapter layer.
 *
 * Provides a clean abstraction for reel copy generation with
 * structured input/output and pluggable backends. Current backend
 * is heuristic (local copy banks). The interface is designed so
 * an LLM backend can be swapped in with zero UI changes.
 *
 * Usage:
 *   const result = await generate({ promptContext, featureType, ... });
 *   // result.headline, result.subhead, result.overlayBeats, ...
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
    clipDuration: raw.clipDuration ?? null,
    segmentCount: raw.segmentCount ?? null,
    analysisAvailable: raw.analysisAvailable ?? false,
  };
}

/**
 * Generate all reel copy from structured inputs.
 *
 * @param {object} rawInput
 * @returns {Promise<{
 *   headline: string,
 *   subhead: string,
 *   overlayBeats: string[],
 *   cta: string,
 *   variantHooks: Array<{id:string,tone:string,headline:string}>,
 *   caption: string,
 *   coverTitle: string,
 *   detectedFeatureType: string,
 *   generationMode: string,
 *   input: object,
 * }>}
 */
export async function generate(rawInput) {
  const input = normalizeInput(rawInput);

  const featureType =
    input.featureType && input.featureType !== 'generalDemo'
      ? input.featureType
      : detectFeatureType(input.promptContext) || 'generalDemo';

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

/**
 * Generate copy for a single variant.
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
 * Check if LLM generation is available.
 * Returns false until an API key / endpoint is configured.
 */
export function isLLMAvailable() {
  return false;
}
