/**
 * nbaModelEdge — pure NBA market math used by buildNbaPicksV2.
 *
 * The v8 builder synthesized `homeWinProb` from `pregameEdge`, which was
 * itself derived from the SAME moneyline odds that the engine then used
 * as the implied probability. That closed loop, combined with an
 * incorrect 16.67 points-per-prob constant in `_odds.js`, made every
 * underdog look like value (see docs/nba-model-underdog-bias-and-auto-
 * tuning-audit-v9.md).
 *
 * v9 replaces that with three honest, decoupled steps:
 *
 *   1. `noVigImplied()` — de-vig the bookmaker American odds so the
 *      implied probabilities sum to 1.
 *   2. `winProbFromSpread()` — derive an INDEPENDENT model probability
 *      from the spread line. The two markets cross-check each other
 *      instead of colluding.
 *   3. `pickMoneylineSide()` / `pickSpreadSide()` — compare model vs
 *      implied to produce a signed rawEdge per side, return the side
 *      with the stronger positive edge, and tag a `lowSignal` when the
 *      sources are absent or the spread is too large to trust the
 *      linear conversion.
 *
 * No artificial favorite/underdog priors. If both edges are negative the
 * least-bad side is still returned for full-slate / tracking mode, with
 * `isLowConviction: true`.
 */

const POINTS_PER_PROB = 28;             // ~3.6%/point — NBA-calibrated
const LARGE_SPREAD_GUARD_ABS = 12;      // above this, blend toward no-vig
const RAW_EDGE_CAP = 0.20;              // never report > ±20% rawEdge
// v11: ML/spread markets that disagree by more than this absolute
// probability gap are treated as a data anomaly (stale ML, illiquid book,
// or one market reflecting a star injury the other hasn't priced in).
// MIN @ SAS shipped a 27-point gap (ML implied MIN ~81%, spread implied
// MIN ~54%) — the model has no way to know which side is right, so it
// must NOT use either side's edge to promote a hero pick.
const ML_SPREAD_DIVERGENCE_FLAG = 0.15;
const ANOMALY_RAW_EDGE_CAP = 0.04;       // collapse to noise floor when flagged

function isNum(v) { return v != null && Number.isFinite(v); }
function clamp01(v) { return Math.max(0, Math.min(1, v)); }
function clampSym(v, max) { return Math.max(-max, Math.min(max, v)); }

/**
 * American odds → raw implied probability (with vig).
 * Negative odds: |odds| / (|odds| + 100)
 * Positive odds: 100 / (odds + 100)
 */
export function americanToImplied(american) {
  if (!isNum(american)) return null;
  if (american > 0) return 100 / (american + 100);
  if (american < 0) return -american / (-american + 100);
  return 0.5;
}

/**
 * Two-sided no-vig de-vigging. When both sides are present we normalize
 * so probabilities sum to 1.0; otherwise we return raw single-side
 * implied with `vigPct: null`.
 */
export function noVigImplied({ awayMl, homeMl } = {}) {
  const rawA = americanToImplied(awayMl);
  const rawH = americanToImplied(homeMl);
  if (rawA != null && rawH != null) {
    const overround = rawA + rawH;
    if (overround > 0) {
      return {
        away: rawA / overround,
        home: rawH / overround,
        vigPct: Math.max(0, overround - 1),
        source: 'two_sided',
      };
    }
  }
  if (rawA != null) return { away: rawA, home: 1 - rawA, vigPct: null, source: 'one_sided_away' };
  if (rawH != null) return { away: 1 - rawH, home: rawH, vigPct: null, source: 'one_sided_home' };
  return { away: null, home: null, vigPct: null, source: null };
}

/**
 * Map a signed home-side spread line to an independent home win
 * probability using the NBA-calibrated points-per-prob constant.
 *
 *   homeLine = -7   →  home favored by 7   →  home win prob ≈ 0.625
 *   homeLine = +5   →  home dog by 5       →  home win prob ≈ 0.411
 *
 * For huge spreads (|line| > LARGE_SPREAD_GUARD_ABS) the linear
 * conversion is unreliable (backdoor cover, garbage time), so we cap
 * the contribution and tag `lowSignal: true` so callers can label it.
 */
export function winProbFromSpread(homeLine, ptsPerProb = POINTS_PER_PROB) {
  if (!isNum(homeLine)) return { away: null, home: null, lowSignal: true };
  const lineAbs = Math.abs(homeLine);
  // Linear conversion at moderate spreads, soft-saturation beyond
  // LARGE_SPREAD_GUARD_ABS so 18-point favorites don't get reported as
  // 82% home win prob.
  let homeProb;
  if (lineAbs <= LARGE_SPREAD_GUARD_ABS) {
    homeProb = clamp01(0.5 + (-homeLine / ptsPerProb) * 0.5);
  } else {
    const linearAt = 0.5 + (-Math.sign(homeLine) * LARGE_SPREAD_GUARD_ABS / ptsPerProb) * 0.5;
    const extra = (lineAbs - LARGE_SPREAD_GUARD_ABS) / ptsPerProb;
    homeProb = clamp01(linearAt + (-Math.sign(homeLine) * extra * 0.15));
  }
  return {
    away: 1 - homeProb,
    home: homeProb,
    lowSignal: lineAbs > LARGE_SPREAD_GUARD_ABS,
  };
}

/**
 * Projected home margin (in points) derived from the de-vigged
 * moneyline. This is INDEPENDENT of the spread line, so the spread can
 * legitimately be compared against it for ATS edge.
 *
 *   homeNoVig = 0.625  →  projectedHomeMargin = +7
 *   homeNoVig = 0.345  →  projectedHomeMargin = -4.34
 */
export function projectedHomeMarginFromMl({ awayMl, homeMl, ptsPerProb = POINTS_PER_PROB } = {}) {
  const nv = noVigImplied({ awayMl, homeMl });
  if (nv.home == null) return null;
  // Cap probability extremes so a -1500 favorite doesn't yield a 28-point
  // projected margin (the linear formula breaks down at extremes).
  const homeNoVig = clamp01(nv.home);
  const probDelta = homeNoVig - 0.5;
  const margin = probDelta * ptsPerProb;
  return Math.round(margin * 10) / 10;
}

/**
 * Pick the moneyline side with the strongest positive edge.
 *
 * @param {object} args
 * @param {number} args.awayMl  American odds for away (raw, with vig)
 * @param {number} args.homeMl  American odds for home (raw, with vig)
 * @param {number} args.homeLine  Signed home-side spread line
 * @returns {object} {
 *   side: 'away'|'home',
 *   awayModelProb, homeModelProb,
 *   awayImplied, homeImplied, vigPct,
 *   awayEdge, homeEdge,
 *   rawEdge, modelProb, impliedProb,
 *   priceAmerican,
 *   impliedSource: 'odds_no_vig'|'odds_raw'|'spread'|null,
 *   modelSource:  'spread'|'no_vig_blend'|null,
 *   isLowConviction: boolean,
 *   lowSignalReason: string|null,
 * }
 */
export function pickMoneylineSide({ awayMl, homeMl, homeLine } = {}) {
  // 1. Implied probabilities (de-vigged when both sides present)
  const nv = noVigImplied({ awayMl, homeMl });
  const hasOdds = nv.away != null && nv.home != null;
  const oddsTwoSided = nv.source === 'two_sided';

  // 2. Spread-derived independent model probability
  const sp = winProbFromSpread(homeLine);
  const hasSpread = sp.home != null;

  // 3. Choose model probabilities
  // - Both sources present, moderate spread → spread-derived model
  // - Large spread (|line|>guard) → blend 50/50 toward no-vig (less aggressive edge)
  // - No spread → use no-vig as model (zero edge → tracking pick on the favorite)
  // - No odds → use spread-derived; impliedSource=spread; effectively zero edge
  let homeModel, awayModel, modelSource;
  if (hasSpread && hasOdds && sp.lowSignal) {
    homeModel = clamp01((sp.home * 0.5) + (nv.home * 0.5));
    awayModel = 1 - homeModel;
    modelSource = 'no_vig_blend';
  } else if (hasSpread) {
    homeModel = sp.home;
    awayModel = sp.away;
    modelSource = 'spread';
  } else if (hasOdds) {
    homeModel = nv.home;
    awayModel = nv.away;
    modelSource = null; // pure no-vig → zero edge by construction
  } else {
    return {
      side: null, awayModelProb: null, homeModelProb: null,
      awayImplied: null, homeImplied: null, vigPct: null,
      awayEdge: null, homeEdge: null,
      rawEdge: null, modelProb: null, impliedProb: null,
      priceAmerican: null,
      impliedSource: null, modelSource: null,
      isLowConviction: true, lowSignalReason: 'no_inputs',
    };
  }

  // 4. Compute implied (no-vig if available, else from spread)
  let awayImplied, homeImplied, impliedSource;
  if (hasOdds) {
    awayImplied = nv.away;
    homeImplied = nv.home;
    impliedSource = oddsTwoSided ? 'odds_no_vig' : 'odds_raw';
  } else if (hasSpread) {
    // No moneyline odds — use spread-derived prob as the implied. This
    // produces zero rawEdge but preserves a per-side selection so every
    // game still gets a tracking ML pick.
    awayImplied = sp.away;
    homeImplied = sp.home;
    impliedSource = 'spread';
  } else {
    awayImplied = 0.5;
    homeImplied = 0.5;
    impliedSource = null;
  }

  // v11: detect ML-vs-spread divergence anomaly. When both odds and a
  // spread are present and the no-vig moneyline disagrees with the
  // spread-derived probability by more than ML_SPREAD_DIVERGENCE_FLAG,
  // collapse the rawEdge so neither side can earn a hero promotion.
  let isAnomaly = false;
  let divergence = null;
  if (hasOdds && hasSpread && oddsTwoSided) {
    divergence = Math.abs(nv.home - sp.home);
    if (divergence >= ML_SPREAD_DIVERGENCE_FLAG) {
      isAnomaly = true;
    }
  }

  // 5. Edges per side, capped (collapse to noise floor when anomaly detected)
  const cap = isAnomaly ? ANOMALY_RAW_EDGE_CAP : RAW_EDGE_CAP;
  const awayEdge = clampSym(awayModel - awayImplied, cap);
  const homeEdge = clampSym(homeModel - homeImplied, cap);

  // 6. Pick the better side. Ties → favorite (lower numeric American odds wins).
  let side;
  if (awayEdge === homeEdge) {
    if (isNum(awayMl) && isNum(homeMl)) side = awayMl <= homeMl ? 'away' : 'home';
    else side = 'home';
  } else {
    side = awayEdge > homeEdge ? 'away' : 'home';
  }

  const rawEdge = side === 'away' ? awayEdge : homeEdge;
  const modelProb = side === 'away' ? awayModel : homeModel;
  const impliedProb = side === 'away' ? awayImplied : homeImplied;
  const priceAmerican = side === 'away' ? (awayMl ?? null) : (homeMl ?? null);

  // 7. Conviction. ML edges from cross-market arbitrage saturate quickly
  // — a 0.04 raw-edge from spread-vs-moneyline disagreement is roughly
  // the noise floor. Anything smaller is tracking by definition.
  const isLowConviction =
    !hasOdds || !hasSpread || rawEdge < 0.04 || sp.lowSignal === true || isAnomaly;
  const lowSignalReason = !hasOdds ? 'no_moneyline'
    : !hasSpread ? 'no_spread'
    : isAnomaly ? 'ml_spread_divergence'
    : sp.lowSignal ? 'large_spread_guard'
    : rawEdge < 0.04 ? 'low_edge'
    : null;

  // v11: re-tag modelSource for anomalies so editorial guardrails can
  // refuse the pick by source alone.
  const finalModelSource = isAnomaly ? 'ml_spread_anomaly' : modelSource;

  return {
    side,
    awayModelProb: clamp01(awayModel),
    homeModelProb: clamp01(homeModel),
    awayImplied: clamp01(awayImplied),
    homeImplied: clamp01(homeImplied),
    vigPct: nv.vigPct,
    awayEdge, homeEdge,
    rawEdge, modelProb, impliedProb,
    priceAmerican,
    impliedSource, modelSource: finalModelSource,
    isLowConviction, lowSignalReason,
    divergence,
    isAnomaly,
  };
}

/**
 * Pick the spread side with the larger projected cover edge (in points).
 *
 * Cover-edge math:
 *   homeCoverEdge = projectedHomeMargin + homeLine
 *     where homeLine is signed (-7 means home favored by 7).
 *
 *   homeLine = -7, projectedHomeMargin = +10 → home covers by 3
 *   homeLine = -7, projectedHomeMargin = +5  → home loses cover by 2
 *
 * The projected margin comes from the de-vigged moneyline (independent
 * of the spread). When ML is missing we fall back to the spread itself,
 * which produces zero cover edge but preserves per-game selection.
 */
export function pickSpreadSide({ awayMl, homeMl, homeLine } = {}) {
  if (!isNum(homeLine)) {
    return {
      side: null, awayLine: null, homeLine: null,
      projectedHomeMargin: null,
      awayCoverEdge: null, homeCoverEdge: null,
      rawEdge: null, lineValue: null,
      isLowConviction: true, lowSignalReason: 'no_spread',
      modelSource: null,
    };
  }

  const projHome = projectedHomeMarginFromMl({ awayMl, homeMl });
  const hasMl = projHome != null;
  // Without ML, the spread is its own model → zero cover edge.
  const projectedHomeMargin = hasMl ? projHome : -homeLine;

  const homeCoverEdge = projectedHomeMargin + homeLine;
  const awayCoverEdge = -homeCoverEdge;

  // Convert points to a probability-style rawEdge so it composes with the
  // shared betScore caps. tanh(x/6) yields ~0.165 at 1pt, ~0.385 at 3pt,
  // ~0.633 at 6pt — saturates fairly fast which is the desired behavior
  // (a 10-point cover edge is not 10x more "edgy" than a 3-point one).
  function pointsToRawEdge(pts) {
    if (!isNum(pts)) return 0;
    const cap = RAW_EDGE_CAP;
    return Math.max(-cap, Math.min(cap, Math.tanh(pts / 6) * 0.5));
  }

  const awayRawEdge = pointsToRawEdge(awayCoverEdge);
  const homeRawEdge = pointsToRawEdge(homeCoverEdge);

  let side;
  if (awayRawEdge === homeRawEdge) {
    // Ties: take the favorite.
    side = homeLine < 0 ? 'home' : (homeLine > 0 ? 'away' : 'home');
  } else {
    side = awayRawEdge > homeRawEdge ? 'away' : 'home';
  }

  const lineValue = side === 'away' ? -homeLine : homeLine;
  const rawEdge = side === 'away' ? awayRawEdge : homeRawEdge;

  // Cover edges below ~1.5 points are noise-floor in cross-market arb.
  const coverPts = Math.abs(side === 'away' ? awayCoverEdge : homeCoverEdge);
  const isLowConviction = !hasMl || coverPts < 1.5;
  const lowSignalReason = !hasMl ? 'no_moneyline_for_projection'
    : coverPts < 1.5 ? 'low_cover_edge'
    : null;

  return {
    side,
    awayLine: -homeLine,
    homeLine,
    projectedHomeMargin,
    awayCoverEdge, homeCoverEdge,
    awayRawEdge, homeRawEdge,
    rawEdge, lineValue,
    isLowConviction, lowSignalReason,
    modelSource: hasMl ? 'devigged_ml' : 'spread_self',
  };
}

export const NBA_MODEL_CONSTANTS = Object.freeze({
  POINTS_PER_PROB,
  LARGE_SPREAD_GUARD_ABS,
  RAW_EDGE_CAP,
  ML_SPREAD_DIVERGENCE_FLAG,
  ANOMALY_RAW_EDGE_CAP,
});
