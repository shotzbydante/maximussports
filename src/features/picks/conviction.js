/**
 * Conviction resolution — a single, sport-agnostic helper that returns the
 * displayable 0–100 conviction score for a pick, or `null` when the pick
 * carries no usable score.
 *
 * Before this helper, surfaces fell back to `0` when both `pick.conviction`
 * and `pick.betScore` were missing (v1 legacy payloads, pre-v2 NBA picks, or
 * partial snapshots). That rendered a "0" pill which was a bug.
 *
 *   resolveConviction(pick) → integer 0–100, or null if no source present.
 *
 * Sources, in priority order:
 *   1. pick.conviction.score        — v2 canonical
 *   2. pick.betScore.total × 100    — v2 raw (pre-rounding)
 *   3. pick.confidenceScore × 100   — v1 back-compat mirror (0–1 float)
 *
 * Null is meaningful: UI should HIDE the conviction badge rather than show 0.
 */

export function resolveConviction(pick) {
  if (!pick) return null;

  // 1. v2 canonical
  const convScore = pick.conviction?.score;
  if (typeof convScore === 'number' && Number.isFinite(convScore)) {
    return Math.max(0, Math.min(100, Math.round(convScore)));
  }

  // 2. v2 raw bet-score (0–1)
  const bs = pick.betScore?.total;
  if (typeof bs === 'number' && Number.isFinite(bs) && bs > 0) {
    return Math.max(0, Math.min(100, Math.round(bs * 100)));
  }

  // 3. v1 legacy mirror (0–1)
  const cs = pick.confidenceScore;
  if (typeof cs === 'number' && Number.isFinite(cs) && cs > 0) {
    return Math.max(0, Math.min(100, Math.round(cs * 100)));
  }

  return null;
}

/**
 * Equivalent for the raw 0–1 bet score. Returns null when absent so the
 * caller can hide the Bet Score metric rather than show 0.
 */
export function resolveBetScoreTotal(pick) {
  if (!pick) return null;
  const bs = pick.betScore?.total;
  if (typeof bs === 'number' && Number.isFinite(bs) && bs > 0) return bs;
  const cs = pick.confidenceScore;
  if (typeof cs === 'number' && Number.isFinite(cs) && cs > 0) return cs;
  return null;
}

/**
 * Returns the 0–100 Bet Score if available, else null. Callers should hide
 * the Bet Score chip entirely when this returns null.
 */
export function resolveBetScoreDisplay(pick) {
  const t = resolveBetScoreTotal(pick);
  return t == null ? null : Math.round(t * 100);
}
