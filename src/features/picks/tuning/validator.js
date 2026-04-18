/**
 * Tuning validator — bounds & guardrails for every proposed config delta.
 *
 * Sport-agnostic. Every change a proposer wants to apply must pass here.
 * Rules enforce:
 *   - Weights sum to 1.0 (±0.001)
 *   - Max Δweight per cycle: 0.05
 *   - Weight range [0.05, 0.60]
 *   - Tier floor monotonicity tier1 > tier2 > tier3
 *   - Max Δfloor per cycle: 0.05
 *   - maxPerTier caps (tier1≤5, tier2≤10, tier3≤10)
 *
 * Returns { ok, errors, warnings, bounded } where `bounded` is the proposed
 * config CLIPPED to safe ranges (nothing auto-applies; shadow-only by default).
 */

const WEIGHT_STEP_MAX = 0.05;
const WEIGHT_MIN = 0.05;
const WEIGHT_MAX = 0.60;
const FLOOR_STEP_MAX = 0.05;
const TIER_CAP = { tier1: 5, tier2: 10, tier3: 10 };
const MIN_SAMPLE_FOR_AUTO = 75;
const SHADOW_DAYS_MIN = 7;

export const GUARDRAILS = Object.freeze({
  WEIGHT_STEP_MAX,
  WEIGHT_MIN,
  WEIGHT_MAX,
  FLOOR_STEP_MAX,
  TIER_CAP,
  MIN_SAMPLE_FOR_AUTO,
  SHADOW_DAYS_MIN,
});

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function approx(a, b, eps = 0.001) { return Math.abs(a - b) <= eps; }

export function validateTuningDelta(current, proposed, context = {}) {
  const errors = [];
  const warnings = [];
  if (!current || !proposed) {
    return { ok: false, errors: ['missing current or proposed config'], warnings, bounded: null };
  }

  const bounded = JSON.parse(JSON.stringify(proposed));

  // ── Weights ──
  const wCur = current.weights || {};
  const wProp = bounded.weights || {};
  for (const key of ['edge', 'conf', 'sit', 'mkt']) {
    if (wProp[key] == null) { errors.push(`weights.${key} missing`); continue; }
    const curV = wCur[key] ?? 0;
    const propV = wProp[key];
    if (Math.abs(propV - curV) > WEIGHT_STEP_MAX + 1e-9) {
      warnings.push(`weights.${key} moved ${(propV - curV).toFixed(3)} — clipped to ±${WEIGHT_STEP_MAX}`);
      wProp[key] = curV + Math.sign(propV - curV) * WEIGHT_STEP_MAX;
    }
    if (wProp[key] < WEIGHT_MIN) { warnings.push(`weights.${key} below ${WEIGHT_MIN}; clamped`); wProp[key] = WEIGHT_MIN; }
    if (wProp[key] > WEIGHT_MAX) { warnings.push(`weights.${key} above ${WEIGHT_MAX}; clamped`); wProp[key] = WEIGHT_MAX; }
  }
  const wSum = (wProp.edge ?? 0) + (wProp.conf ?? 0) + (wProp.sit ?? 0) + (wProp.mkt ?? 0);
  if (!approx(wSum, 1.0, 0.001)) {
    // Renormalize rather than reject when clips caused drift
    if (wSum > 0.5) {
      for (const k of ['edge', 'conf', 'sit', 'mkt']) wProp[k] = wProp[k] / wSum;
      warnings.push(`weights renormalized after clipping (sum=${wSum.toFixed(3)} → 1.0)`);
    } else {
      errors.push(`weights sum ${wSum.toFixed(3)} not within tolerance of 1.0`);
    }
  }

  // ── Tier cutoffs ──
  const tCur = current.tierCutoffs || {};
  const tProp = bounded.tierCutoffs || {};
  for (const tier of ['tier1', 'tier2', 'tier3']) {
    if (!tProp[tier]) { errors.push(`tierCutoffs.${tier} missing`); continue; }
    const curFloor = tCur[tier]?.floor ?? 0;
    const propFloor = tProp[tier].floor;
    if (typeof propFloor !== 'number') { errors.push(`tierCutoffs.${tier}.floor missing`); continue; }
    if (Math.abs(propFloor - curFloor) > FLOOR_STEP_MAX + 1e-9) {
      warnings.push(`tierCutoffs.${tier}.floor moved ${(propFloor - curFloor).toFixed(3)} — clipped`);
      tProp[tier].floor = curFloor + Math.sign(propFloor - curFloor) * FLOOR_STEP_MAX;
    }
    tProp[tier].floor = clamp(tProp[tier].floor, 0.05, 0.99);
    if (typeof tProp[tier].slatePercentile === 'number') {
      tProp[tier].slatePercentile = clamp(tProp[tier].slatePercentile, 0.0, 1.0);
    }
  }
  if (tProp.tier1 && tProp.tier2 && tProp.tier3) {
    if (!(tProp.tier1.floor > tProp.tier2.floor && tProp.tier2.floor > tProp.tier3.floor)) {
      errors.push('tier floors must satisfy tier1 > tier2 > tier3');
    }
  }

  // ── maxPerTier caps ──
  const mpt = bounded.maxPerTier || {};
  for (const tier of ['tier1', 'tier2', 'tier3']) {
    if (mpt[tier] != null) {
      if (mpt[tier] < 0) errors.push(`maxPerTier.${tier} negative`);
      if (mpt[tier] > TIER_CAP[tier]) {
        warnings.push(`maxPerTier.${tier} capped at ${TIER_CAP[tier]}`);
        mpt[tier] = TIER_CAP[tier];
      }
    }
  }

  // ── Sample size check for ANY auto-apply ──
  const sample = Number(context.sampleSize ?? 0);
  const shadowDays = Number(context.shadowDays ?? 0);
  const mode = context.mode || 'proposed';
  const canAutoApply =
    mode === 'apply' &&
    sample >= MIN_SAMPLE_FOR_AUTO &&
    shadowDays >= SHADOW_DAYS_MIN;

  if (mode === 'apply' && !canAutoApply) {
    errors.push(
      `apply rejected: need sampleSize≥${MIN_SAMPLE_FOR_AUTO} (have ${sample}) ` +
      `and shadowDays≥${SHADOW_DAYS_MIN} (have ${shadowDays})`
    );
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    bounded,
    canAutoApply,
  };
}

/** Utility: diff two configs into a flat { path: { before, after } } object. */
export function diffConfig(before, after) {
  const delta = {};
  const walk = (a, b, prefix = '') => {
    const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
    for (const k of keys) {
      const av = a ? a[k] : undefined;
      const bv = b ? b[k] : undefined;
      const path = prefix ? `${prefix}.${k}` : k;
      if (av && typeof av === 'object' && !Array.isArray(av)) {
        walk(av, bv, path);
      } else if (av !== bv) {
        delta[path] = { before: av ?? null, after: bv ?? null };
      }
    }
  };
  walk(before || {}, after || {});
  return delta;
}
