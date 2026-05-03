/**
 * seriesPaceFairTotal — minimum-viable fair-total signal for NBA totals.
 *
 * The v4 audit concluded that mirroring the bookmaker total into
 * `model.fairTotal` (the pre-fix behavior) was dishonest — it produced a
 * 0-edge totals candidate every game. The truthful alternative is to
 * derive `fairTotal` from a real signal. This module provides the
 * minimum honest one: the average combined score of prior finals between
 * the SAME two teams in the available game window.
 *
 * Inputs
 *   awaySlug, homeSlug — pick matchup
 *   windowGames        — flat array of normalized games (final + upcoming),
 *                        already deduped, with `gameState.isFinal` set
 *   minSample          — minimum number of prior finals required before
 *                        we publish a totals candidate (default 2)
 *
 * Output
 *   {
 *     fairTotal:       number | null   // average prior total
 *     priorGamesUsed:  number          // sample size
 *     scoreRange:      { min, max } | null
 *     confidence:      number          // 0..1 — bounded by sample size
 *   }
 *
 * When `priorGamesUsed < minSample`, returns `fairTotal: null`. Caller
 * should treat null as "no totals candidate" so the totals gate fails for
 * the right reason and `ByMarketSummary` keeps its honest empty-state.
 *
 * Limitations (named in docs/nba-home-picks-badge-logos-ml-totals-conviction-audit-v5.md):
 *   - No injury-driven adjustment.
 *   - No regular-season vs. playoff baseline reweight.
 *   - No pace/efficiency model — that's the v6 hook.
 */

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function pairKey(a, b) {
  const ax = String(a || '').toLowerCase();
  const bx = String(b || '').toLowerCase();
  return ax < bx ? `${ax}|${bx}` : `${bx}|${ax}`;
}

/**
 * Filter `windowGames` to the prior finals between awaySlug and homeSlug
 * (in either home/away order — matchups flip in playoff series).
 */
function priorFinalsBetween(awaySlug, homeSlug, windowGames) {
  if (!Array.isArray(windowGames)) return [];
  const target = pairKey(awaySlug, homeSlug);
  if (target === '|') return [];
  return windowGames.filter(g => {
    const isFinal = !!(g?.gameState?.isFinal || g?.status === 'final');
    if (!isFinal) return false;
    const a = g?.teams?.away?.slug;
    const h = g?.teams?.home?.slug;
    if (!a || !h) return false;
    return pairKey(a, h) === target;
  });
}

export function seriesPaceFairTotal({
  awaySlug,
  homeSlug,
  windowGames,
  minSample = 2,
} = {}) {
  const out = {
    fairTotal: null,
    priorGamesUsed: 0,
    scoreRange: null,
    confidence: 0,
  };
  if (!awaySlug || !homeSlug) return out;

  const priors = priorFinalsBetween(awaySlug, homeSlug, windowGames);
  const totals = [];
  for (const g of priors) {
    const a = num(g?.teams?.away?.score);
    const h = num(g?.teams?.home?.score);
    if (a == null || h == null) continue;
    const t = a + h;
    if (t > 0) totals.push(t);
  }
  out.priorGamesUsed = totals.length;
  if (totals.length === 0) return out;

  const sum = totals.reduce((s, x) => s + x, 0);
  const fairTotal = Math.round((sum / totals.length) * 10) / 10;
  out.scoreRange = {
    min: Math.min(...totals),
    max: Math.max(...totals),
  };

  // Honest small-sample guard. Below the floor → no signal.
  if (totals.length < minSample) return out;

  out.fairTotal = fairTotal;
  // Confidence saturates at 4 prior finals (the playoff series sweet
  // spot). 2 priors → 0.50, 3 → 0.75, 4+ → 1.0. Clamped 0..1.
  out.confidence = Math.max(0, Math.min(1, totals.length / 4));
  return out;
}

export { priorFinalsBetween, pairKey };
