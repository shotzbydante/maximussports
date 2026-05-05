/**
 * selectBriefingPicks — editorial-safe subset of fullSlatePicks.
 *
 * Daily Briefing slide 1 (and any caller that needs "the picks Maximus
 * actually stands behind today") consumes this list. It is STRICTER than
 * `heroPicks` and refuses any candidate whose only signal is cross-market
 * arbitrage on the underdog side.
 *
 * The v11 audit (docs/nba-model-realism-odds-mapping-and-briefing-picks-
 * audit-v11.md) traced the SAS +405 anomaly in production to a slide
 * pulling from `categories.pickEms` regardless of pickRole. v11 routes
 * the slide through this resolver instead, so editorial output is
 * decoupled from the full-slate tracking surface.
 *
 * Returns:
 *   {
 *     briefingPicks:              [pick, ...],
 *     rejectedBriefingCandidates: [{ pick, rejectReason }, ...],
 *   }
 */

const CROSS_MARKET_SOURCES = new Set([
  'spread', 'devigged_ml', 'no_vig_blend',
]);
const ANOMALY_SOURCES = new Set([
  'ml_spread_anomaly',
]);
const STRONG_TOTAL_SOURCES_PREFIX = ['series_pace_v1', 'team_recent_v1'];

const DEFAULT_THRESHOLDS = Object.freeze({
  longShotMlAbs:     300,    // |+300| or worse → require non-cross-market source
  largeAtsLineAbs:    7,    // |line| ≥ 7 → reject cross-market dog
  crossMarketEdgeMl:  0.12, // ≥ 0.12 raw edge required for ML cross-market hero
  crossMarketEdgeAts: 0.16, // ATS bar slightly higher because tanh inflates points
});

function isCrossMarketOnly(pick) {
  return CROSS_MARKET_SOURCES.has(pick?.modelSource);
}
function isAnomaly(pick) {
  return ANOMALY_SOURCES.has(pick?.modelSource);
}
function isUnderdog(pick) {
  if (pick?.market?.type === 'moneyline') return (pick?.market?.priceAmerican ?? 0) > 0;
  if (pick?.market?.type === 'runline')  return (pick?.market?.line ?? 0) > 0;
  return false;
}
function multiFactorOk(pick, thresholds) {
  const c = pick?.betScore?.components || {};
  const supports = [
    (c.modelConfidence ?? 0) >= (thresholds.confFloor ?? 0.50),
    (c.situationalEdge ?? 0) >= (thresholds.sitFloor  ?? 0.62),
    (c.marketQuality   ?? 0) >= (thresholds.mktFloor  ?? 0.85),
  ];
  return supports.filter(Boolean).length >= 2;
}

function classifyPick(pick, thresholds) {
  if (!pick) return { ok: false, reason: 'null_pick' };
  // Anomalies are auto-rejected regardless of pickRole.
  if (isAnomaly(pick)) return { ok: false, reason: 'ml_spread_divergence' };

  // Briefing requires hero status as the entry point.
  if (pick.pickRole !== 'hero') return { ok: false, reason: 'not_hero' };

  const market = pick.market?.type;

  // Total picks: source quality is the gate.
  if (market === 'total') {
    const src = pick.modelSource || '';
    const isStrong = STRONG_TOTAL_SOURCES_PREFIX.some(p => src === p || src.startsWith(`${p}+`));
    if (!isStrong) return { ok: false, reason: 'weak_total_source' };
    return { ok: true };
  }

  // ML/ATS: long-shot + cross-market gates.
  if (market === 'moneyline') {
    const price = pick.market?.priceAmerican ?? 0;
    if (price >= thresholds.longShotMlAbs && isCrossMarketOnly(pick)) {
      return { ok: false, reason: 'long_shot_ml_cross_market' };
    }
    if (isCrossMarketOnly(pick)) {
      if (Math.abs(pick.rawEdge ?? 0) < thresholds.crossMarketEdgeMl) {
        return { ok: false, reason: 'ml_cross_market_low_edge' };
      }
      if (!multiFactorOk(pick, {})) return { ok: false, reason: 'ml_cross_market_no_multi_factor' };
      if (isUnderdog(pick))         return { ok: false, reason: 'ml_cross_market_underdog' };
    }
    return { ok: true };
  }

  if (market === 'runline') {
    const line = pick.market?.line ?? 0;
    if (line >= thresholds.largeAtsLineAbs && isCrossMarketOnly(pick) && isUnderdog(pick)) {
      return { ok: false, reason: 'large_ats_dog_cross_market' };
    }
    if (isCrossMarketOnly(pick)) {
      if (Math.abs(pick.rawEdge ?? 0) < thresholds.crossMarketEdgeAts) {
        return { ok: false, reason: 'ats_cross_market_low_edge' };
      }
      if (!multiFactorOk(pick, {})) return { ok: false, reason: 'ats_cross_market_no_multi_factor' };
    }
    return { ok: true };
  }

  return { ok: false, reason: 'unknown_market' };
}

export function selectBriefingPicks(fullSlatePicks = [], thresholds = {}) {
  const t = { ...DEFAULT_THRESHOLDS, ...thresholds };
  const accepted = [];
  const rejected = [];
  for (const p of fullSlatePicks) {
    const cls = classifyPick(p, t);
    if (cls.ok) accepted.push(p);
    else rejected.push({
      id: p?.id, label: p?.selection?.label, market: p?.market?.type,
      modelSource: p?.modelSource, rejectReason: cls.reason,
    });
  }
  // Sort by betScore desc so the slide gets the best ones first.
  accepted.sort((a, b) => (b?.betScore?.total ?? 0) - (a?.betScore?.total ?? 0));
  return { briefingPicks: accepted, rejectedBriefingCandidates: rejected };
}

export const BRIEFING_THRESHOLDS = DEFAULT_THRESHOLDS;
