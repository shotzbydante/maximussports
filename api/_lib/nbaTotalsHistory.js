/**
 * nbaTotalsHistory — historical totals analytics for NBA picks.
 *
 * Two complementary signals:
 *
 *   1. recentScoringTrend({awaySlug, homeSlug, windowGames})
 *      Pulls each team's most recent finals from `windowGames` (ESPN
 *      scoreboard data already loaded by `nbaPicksBuilder`) and computes:
 *        - average combined-score per team
 *        - blended pace (mean of the two team averages)
 *        - sample size and a [0..1] confidence value
 *
 *   2. closingTotalDeviationTrend({awaySlug, homeSlug, history})
 *      Optional historical Odds-API record where each entry has
 *        { teamSlug, opponentSlug, closingTotal, finalCombined, isOver }
 *      Computes:
 *        - average miss/beat vs the closing total per team
 *        - over hit-rate per team
 *        - blended adjustment in points (capped)
 *
 * Combined entry point:
 *
 *   adjustFairTotal({ baseFairTotal, baseSource, baseConfidence,
 *                     awaySlug, homeSlug, windowGames, closingHistory })
 *
 * Returns `{ fairTotal, source, adjustment, confidence, components }`
 * with `adjustment` capped to ±3.0 points so a single noisy slate can't
 * swing the model. When neither signal is available the input is passed
 * through unchanged.
 *
 * Limitations
 *   - `windowGames` only carries the past-7-day window today (per
 *     nbaPicksBuilder). Larger backfills require a new fetch.
 *   - `closingHistory` is not currently populated in the in-process
 *     pipeline; tests pass it explicitly. Falls back to scoring-trend-only.
 */

const TREND_ADJUSTMENT_CAP = 3.0;
const SCORING_TREND_WEIGHT = 0.6;
const CLOSING_TREND_WEIGHT = 0.4;

function isNum(v) { return v != null && Number.isFinite(v); }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function round1(v) { return isNum(v) ? Math.round(v * 10) / 10 : null; }
function round2(v) { return isNum(v) ? Math.round(v * 100) / 100 : null; }

/**
 * Walk `windowGames` (final-only) and pull each team's most recent
 * combined scores. Returns `null` when neither team has any priors.
 */
export function recentScoringTrend({ awaySlug, homeSlug, windowGames, sampleCap = 8 } = {}) {
  if (!awaySlug || !homeSlug || !Array.isArray(windowGames)) {
    return { combinedAvg: null, awayAvg: null, homeAvg: null, sample: 0, confidence: 0 };
  }

  function avgFor(slug) {
    const totals = [];
    const sorted = [...windowGames].sort((a, b) => {
      const at = a?.startTime ? new Date(a.startTime).getTime() : 0;
      const bt = b?.startTime ? new Date(b.startTime).getTime() : 0;
      return bt - at;
    });
    for (const g of sorted) {
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
      if (totals.length >= sampleCap) break;
    }
    if (totals.length === 0) return { avg: null, sample: 0 };
    return {
      avg: totals.reduce((s, x) => s + x, 0) / totals.length,
      sample: totals.length,
    };
  }

  const a = avgFor(awaySlug);
  const h = avgFor(homeSlug);
  const totalSample = a.sample + h.sample;
  if (totalSample === 0) {
    return { combinedAvg: null, awayAvg: null, homeAvg: null, sample: 0, confidence: 0 };
  }
  const sides = [a, h].filter(s => s.avg != null);
  const blended = sides.length > 0
    ? sides.reduce((s, x) => s + x.avg, 0) / sides.length
    : null;
  return {
    combinedAvg: round1(blended),
    awayAvg: round1(a.avg),
    homeAvg: round1(h.avg),
    sample: totalSample,
    confidence: clamp(totalSample / 8, 0, 1),
  };
}

/**
 * Closing-total deviation: how the team's recent finals scored relative
 * to the bookmaker closing total. Positive `deviation` means the games
 * went OVER on average; negative means UNDER.
 *
 * @param {object} args
 * @param {string} args.awaySlug
 * @param {string} args.homeSlug
 * @param {Array<{teamSlug, closingTotal, finalCombined}>} args.history
 *   Game-level rows that include the closing total and the actual
 *   combined score. Order doesn't matter; we compute mean deviation.
 */
export function closingTotalDeviationTrend({ awaySlug, homeSlug, history } = {}) {
  if (!Array.isArray(history) || history.length === 0) {
    return { awayDeviation: null, homeDeviation: null, blendedDeviation: null,
             awayOverRate: null, homeOverRate: null, sample: 0, confidence: 0 };
  }

  function statsFor(slug) {
    let count = 0, devSum = 0, overs = 0;
    for (const row of history) {
      if (row?.teamSlug !== slug) continue;
      const ct = Number(row.closingTotal);
      const fc = Number(row.finalCombined);
      if (!Number.isFinite(ct) || !Number.isFinite(fc)) continue;
      const dev = fc - ct;
      devSum += dev;
      if (dev > 0) overs += 1;
      count += 1;
    }
    if (count === 0) return { dev: null, overRate: null, sample: 0 };
    return { dev: devSum / count, overRate: overs / count, sample: count };
  }

  const a = statsFor(awaySlug);
  const h = statsFor(homeSlug);
  const totalSample = a.sample + h.sample;
  if (totalSample === 0) {
    return { awayDeviation: null, homeDeviation: null, blendedDeviation: null,
             awayOverRate: null, homeOverRate: null, sample: 0, confidence: 0 };
  }
  const sides = [a.dev, h.dev].filter(v => v != null);
  const blended = sides.length > 0
    ? sides.reduce((s, x) => s + x, 0) / sides.length
    : null;
  return {
    awayDeviation: round1(a.dev),
    homeDeviation: round1(h.dev),
    blendedDeviation: round1(blended),
    awayOverRate: round2(a.overRate),
    homeOverRate: round2(h.overRate),
    sample: totalSample,
    confidence: clamp(totalSample / 10, 0, 1),
  };
}

/**
 * Apply both trend signals on top of an existing fair-total
 * (e.g., series_pace_v1 or team_recent_v1) and return a combined
 * fair total with a richer source tag and capped adjustment.
 *
 * Adjustment is computed as a weighted blend:
 *
 *   adj = SCORING_TREND_WEIGHT * (recentCombined - baseFairTotal)
 *       + CLOSING_TREND_WEIGHT * blendedDeviation
 *
 * Then capped to ±TREND_ADJUSTMENT_CAP. When BOTH inputs are missing
 * the result is the unchanged baseline.
 */
export function adjustFairTotal({
  baseFairTotal,
  baseSource = null,
  baseConfidence = 0,
  awaySlug,
  homeSlug,
  windowGames = [],
  closingHistory = [],
} = {}) {
  if (!isNum(baseFairTotal)) {
    return { fairTotal: null, source: baseSource, adjustment: 0, confidence: baseConfidence,
             components: { scoring: null, closing: null } };
  }

  const scoring = recentScoringTrend({ awaySlug, homeSlug, windowGames });
  const closing = closingTotalDeviationTrend({ awaySlug, homeSlug, history: closingHistory });

  let parts = 0, totalAdj = 0, totalWeight = 0;
  if (scoring.combinedAvg != null && scoring.confidence > 0) {
    const part = (scoring.combinedAvg - baseFairTotal) * SCORING_TREND_WEIGHT * scoring.confidence;
    totalAdj += part; totalWeight += SCORING_TREND_WEIGHT * scoring.confidence;
    parts += 1;
  }
  if (closing.blendedDeviation != null && closing.confidence > 0) {
    const part = closing.blendedDeviation * CLOSING_TREND_WEIGHT * closing.confidence;
    totalAdj += part; totalWeight += CLOSING_TREND_WEIGHT * closing.confidence;
    parts += 1;
  }

  if (parts === 0) {
    return { fairTotal: round1(baseFairTotal), source: baseSource, adjustment: 0,
             confidence: baseConfidence, components: { scoring, closing } };
  }

  const cappedAdj = clamp(totalAdj, -TREND_ADJUSTMENT_CAP, TREND_ADJUSTMENT_CAP);
  const next = round1(baseFairTotal + cappedAdj);
  const sourceTag = baseSource
    ? `${baseSource}+trend_v1`
    : 'trend_v1';
  // Confidence blends in (capped at 1.0) — trend gives a small bump but
  // never overrides the underlying confidence ceiling.
  const trendConfBoost = Math.min(0.2, totalWeight / 2);
  const confidence = clamp((baseConfidence ?? 0) + trendConfBoost, 0, 1);

  return {
    fairTotal: next,
    source: sourceTag,
    adjustment: round1(cappedAdj),
    confidence: round2(confidence),
    components: { scoring, closing },
  };
}

export const NBA_TOTALS_HISTORY_CONSTANTS = Object.freeze({
  TREND_ADJUSTMENT_CAP,
  SCORING_TREND_WEIGHT,
  CLOSING_TREND_WEIGHT,
});
