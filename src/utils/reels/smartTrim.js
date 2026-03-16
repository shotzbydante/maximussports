/**
 * Proportional Smart Trim
 *
 * Replaces the fixed 10–15s trim window with a proportional calculation
 * based on source video duration. Longer source → longer reel.
 *
 * Formula: trimLength = clamp(videoDuration × 0.18, 8s, 24s)
 *
 * Examples:
 *   30s source  → ~8–10s
 *   60s source  → ~11s
 *   90s source  → ~16s
 *   102s source → ~18s
 *   120s source → ~21–22s
 */

const TRIM_RATIO = 0.18;
const MIN_TRIM_S = 8;
const MAX_TRIM_S = 24;

export function computeProportionalTrimLength(videoDuration) {
  if (!videoDuration || videoDuration <= 0) return MIN_TRIM_S;
  return clamp(videoDuration * TRIM_RATIO, MIN_TRIM_S, MAX_TRIM_S);
}

export function computeTrimWindow(videoDuration) {
  const minWindow = computeProportionalTrimLength(videoDuration);
  const maxWindow = clamp(minWindow * 1.25, minWindow, MAX_TRIM_S);
  return { minWindow, maxWindow };
}

export function computeBeatCount(trimLength) {
  if (trimLength <= 10) return 4;
  if (trimLength <= 16) return 5;
  return 6;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Compute proportional target duration for the edit plan builder.
 * Returns { targetDuration, maxDuration, beatCount }.
 */
export function getEditPlanTargets(videoDuration) {
  const targetDuration = computeProportionalTrimLength(videoDuration);
  const { maxWindow } = computeTrimWindow(videoDuration);
  const beatCount = computeBeatCount(targetDuration);
  return { targetDuration, maxDuration: maxWindow, beatCount };
}
