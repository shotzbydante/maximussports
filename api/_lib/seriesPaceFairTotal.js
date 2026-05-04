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

/**
 * teamRecentTotalAverage — fallback fair-total signal when no prior
 * finals exist between the SAME two teams.
 *
 * Computes each team's average combined-score across its last finals in
 * the window (regardless of opponent), then blends them. This is a
 * pace/scoring-environment proxy — the team has been playing in higher-
 * total games lately → fair total tilts up; lower → tilts down.
 *
 * Returns null when neither team has ≥ minSample priors.
 *
 * Caller should treat low `confidence` as "tracking pick" (keep the
 * pick, mark conviction Low).
 */
export function teamRecentTotalAverage({
  awaySlug,
  homeSlug,
  windowGames,
  minSample = 2,
} = {}) {
  const out = { fairTotal: null, awayPriors: 0, homePriors: 0, confidence: 0 };
  if (!awaySlug || !homeSlug || !Array.isArray(windowGames)) return out;

  function avgFor(slug) {
    const totals = [];
    for (const g of windowGames) {
      const isFinal = !!(g?.gameState?.isFinal || g?.status === 'final');
      if (!isFinal) continue;
      const a = g?.teams?.away?.slug;
      const h = g?.teams?.home?.slug;
      if (a !== slug && h !== slug) continue;
      const aScore = Number(g?.teams?.away?.score);
      const hScore = Number(g?.teams?.home?.score);
      if (!Number.isFinite(aScore) || !Number.isFinite(hScore)) continue;
      const t = aScore + hScore;
      if (t > 0) totals.push(t);
    }
    if (totals.length === 0) return { avg: null, sample: 0 };
    return {
      avg: totals.reduce((s, x) => s + x, 0) / totals.length,
      sample: totals.length,
    };
  }

  const a = avgFor(awaySlug);
  const h = avgFor(homeSlug);
  out.awayPriors = a.sample;
  out.homePriors = h.sample;

  // Need either side to clear the floor; blend whatever's available.
  const sides = [a, h].filter(s => s.avg != null);
  if (sides.length === 0) return out;
  const totalSamples = a.sample + h.sample;
  if (totalSamples < minSample) return out;

  const blend = sides.reduce((s, x) => s + x.avg, 0) / sides.length;
  out.fairTotal = Math.round(blend * 10) / 10;
  // Less reliable than series-pace — saturates at 6 combined samples.
  out.confidence = Math.min(1, totalSamples / 6) * 0.7;
  return out;
}

/**
 * slatePaceBaseline — last-resort fair-total when neither series-pace
 * nor team-recent has signal. Returns the mean total of the last N
 * finals in the window. Confidence intentionally LOW — this is not a
 * real prediction, just a directional prior so a totals pick can be
 * generated honestly with a "Low Conviction" flag.
 */
export function slatePaceBaseline({ windowGames, sampleCap = 12 } = {}) {
  const totals = [];
  if (!Array.isArray(windowGames)) return { fairTotal: null, sample: 0, confidence: 0 };
  // Walk newest→oldest if startTimes exist.
  const sorted = [...windowGames].sort((a, b) => {
    const at = a?.startTime ? new Date(a.startTime).getTime() : 0;
    const bt = b?.startTime ? new Date(b.startTime).getTime() : 0;
    return bt - at;
  });
  for (const g of sorted) {
    const isFinal = !!(g?.gameState?.isFinal || g?.status === 'final');
    if (!isFinal) continue;
    const a = Number(g?.teams?.away?.score);
    const h = Number(g?.teams?.home?.score);
    if (!Number.isFinite(a) || !Number.isFinite(h)) continue;
    const t = a + h;
    if (t > 0) totals.push(t);
    if (totals.length >= sampleCap) break;
  }
  if (totals.length < 3) return { fairTotal: null, sample: totals.length, confidence: 0 };
  const mean = totals.reduce((s, x) => s + x, 0) / totals.length;
  return {
    fairTotal: Math.round(mean * 10) / 10,
    sample: totals.length,
    // Cap at 0.30 — explicitly low. The pick will be tracked, not hyped.
    confidence: Math.min(0.30, totals.length / 30),
  };
}

/**
 * resolveFairTotalForGame — composed chain:
 *   series-pace (≥2 prior finals between same teams) → teamRecentTotalAverage
 *   (≥2 priors across either team) → slatePaceBaseline (last resort).
 *
 * Returns `{ fairTotal, source, confidence, lowSignal }`. `fairTotal` is
 * always non-null when ANY signal is available; callers should treat
 * `lowSignal: true` as "tracking pick, low conviction".
 */
export function resolveFairTotalForGame({ awaySlug, homeSlug, windowGames } = {}) {
  // Tier 1 — series-pace
  const sp = seriesPaceFairTotal({ awaySlug, homeSlug, windowGames });
  if (sp.fairTotal != null) {
    return {
      fairTotal: sp.fairTotal,
      source: 'series_pace_v1',
      confidence: sp.confidence,
      lowSignal: false,
      sample: sp.priorGamesUsed,
    };
  }
  // Tier 2 — team-recent average
  const tr = teamRecentTotalAverage({ awaySlug, homeSlug, windowGames });
  if (tr.fairTotal != null) {
    return {
      fairTotal: tr.fairTotal,
      source: 'team_recent_v1',
      confidence: tr.confidence,
      lowSignal: tr.confidence < 0.4,
      sample: tr.awayPriors + tr.homePriors,
    };
  }
  // Tier 3 — slate baseline (always tracking-quality)
  const sb = slatePaceBaseline({ windowGames });
  if (sb.fairTotal != null) {
    return {
      fairTotal: sb.fairTotal,
      source: 'slate_baseline_v1',
      confidence: sb.confidence,
      lowSignal: true,
      sample: sb.sample,
    };
  }
  return { fairTotal: null, source: null, confidence: 0, lowSignal: true, sample: 0 };
}
