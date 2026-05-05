/**
 * nbaAudit — NBA-aware analyzer for the daily run-audit cron.
 *
 * MLB's `analyzePicks` is a pure pattern-recognition + rule-of-thumb
 * proposer that knows nothing about favorite/underdog regimes or NBA
 * spread buckets. The v9 audit adds the slices the underdog-bias bug
 * exposed:
 *
 *   - byFavoriteSide:  fav vs dog hit rate, per market
 *   - bySpreadBucket:  fav by spread band, dog by spread band
 *   - byTotalsSource:  series_pace_v1 / team_recent_v1 /
 *                      slate_baseline_v1 / +trend_v1 hit rate
 *   - byTotalsSide:    over vs under hit rate
 *   - regimeFlags:     all_underdog / all_under / fav_fade /
 *                      slate_baseline_dominant
 *
 * Like MLB the proposer ONLY suggests bounded shadow deltas; the
 * cron's validator + manual `is_active` flip remain the only path to
 * production.
 */

const EDGE_BANDS = [
  { label: 'lt1', min: -Infinity, max: 0.01 },
  { label: '1to2', min: 0.01, max: 0.02 },
  { label: '2to5', min: 0.02, max: 0.05 },
  { label: 'gte5', min: 0.05, max: Infinity },
];

const SPREAD_BUCKETS = [
  { label: 'fav_-0.5_-4.5', min: -4.5, max: -0.5 },
  { label: 'fav_-5_-9.5',   min: -9.5, max: -5 },
  { label: 'fav_-10_plus',  min: -Infinity, max: -10 },
  { label: 'dog_+0.5_+4.5', min: 0.5, max: 4.5 },
  { label: 'dog_+5_+9.5',   min: 5,   max: 9.5 },
  { label: 'dog_+10_plus',  min: 10,  max: Infinity },
];

function emptyRecord() { return { won: 0, lost: 0, push: 0, pending: 0 }; }
function hitRate(rec) { const n = rec.won + rec.lost; return n > 0 ? rec.won / n : null; }
function incr(rec, status) { if (rec && status in rec) rec[status] += 1; }
function getStatus(p) {
  const res = Array.isArray(p?.pick_results) ? p.pick_results[0] : p?.pick_results;
  return res?.status || 'pending';
}

function favOrDog(p) {
  // moneyline: priceAmerican < 0 → favorite
  // spread:    line_value < 0 → favorite
  if (p.market_type === 'moneyline') {
    return (p.price_american ?? 0) < 0 ? 'favorite' : 'underdog';
  }
  if (p.market_type === 'runline') {
    return (p.line_value ?? 0) < 0 ? 'favorite' : 'underdog';
  }
  return null;
}

function spreadBucket(line) {
  if (line == null || !Number.isFinite(line)) return null;
  for (const b of SPREAD_BUCKETS) {
    if (line >= b.min && line <= b.max) return b.label;
  }
  return null;
}

export function analyzeNbaPicks({ sport = 'nba', slateDate, picks = [] } = {}) {
  const summary = {
    date: slateDate,
    sport,
    sampleSize: picks.length,
    overall: emptyRecord(),
    byMarket: { moneyline: emptyRecord(), runline: emptyRecord(), total: emptyRecord() },
    byTier:   { tier1: emptyRecord(), tier2: emptyRecord(), tier3: emptyRecord(), tracking: emptyRecord() },
    byEdgeBand: Object.fromEntries(EDGE_BANDS.map(b => [b.label, emptyRecord()])),
    byHomeAway: { home: emptyRecord(), away: emptyRecord() },
    byFavoriteSide: {
      favorite: emptyRecord(),
      underdog: emptyRecord(),
      ml_favorite: emptyRecord(), ml_underdog: emptyRecord(),
      ats_favorite: emptyRecord(), ats_underdog: emptyRecord(),
    },
    bySpreadBucket: Object.fromEntries(SPREAD_BUCKETS.map(b => [b.label, emptyRecord()])),
    byTotalsSource: {},  // populated as we encounter sources
    byTotalsSide: { over: emptyRecord(), under: emptyRecord() },
    byPickRole: { hero: emptyRecord(), tracking: emptyRecord() },
    // v12 slices
    byLongShotDog: emptyRecord(),
    byLongShotDogUnsupported: emptyRecord(),
    byLargeFavoriteSpread: emptyRecord(),
    byLargeFavoriteSpreadUnsupported: emptyRecord(),
    byTotalsTrendAgreement: { agree: emptyRecord(), mixed: emptyRecord(), unknown: emptyRecord() },
    regimeFlags: [],
    topHits: [],
    topMisses: [],
  };

  const signalAttribution = {};

  // Counters for regime detection
  let mlPicks = 0, mlUnderdogPicks = 0;
  let atsPicks = 0, atsUnderdogPicks = 0;
  let totalPicks = 0, overPicks = 0, underPicks = 0;
  let slateBaselineCount = 0;

  for (const p of picks) {
    const status = getStatus(p);
    incr(summary.overall, status);
    if (summary.byMarket[p.market_type]) incr(summary.byMarket[p.market_type], status);
    if (summary.byTier[p.tier]) incr(summary.byTier[p.tier], status);

    if (p.raw_edge != null) {
      const band = EDGE_BANDS.find(b => p.raw_edge >= b.min && p.raw_edge < b.max);
      if (band) incr(summary.byEdgeBand[band.label], status);
    }
    if (p.selection_side === 'home' || p.selection_side === 'away') {
      incr(summary.byHomeAway[p.selection_side], status);
    }

    const role = p.pick_role || (p.tier === 'tracking' ? 'tracking' : 'hero');
    if (summary.byPickRole[role]) incr(summary.byPickRole[role], status);

    // Favorite-vs-underdog slicing
    const fd = favOrDog(p);
    if (fd) {
      incr(summary.byFavoriteSide[fd], status);
      if (p.market_type === 'moneyline') {
        incr(summary.byFavoriteSide[`ml_${fd}`], status);
        mlPicks += 1;
        if (fd === 'underdog') mlUnderdogPicks += 1;
      } else if (p.market_type === 'runline') {
        incr(summary.byFavoriteSide[`ats_${fd}`], status);
        atsPicks += 1;
        if (fd === 'underdog') atsUnderdogPicks += 1;
      }
    }

    // Spread bucket
    if (p.market_type === 'runline') {
      const bk = spreadBucket(p.line_value);
      if (bk) incr(summary.bySpreadBucket[bk], status);
      // v12: large favorite tracking
      if ((p.line_value ?? 0) <= -10) {
        incr(summary.byLargeFavoriteSpread, status);
        if (p.large_favorite_spread_risk_supported === false) {
          incr(summary.byLargeFavoriteSpreadUnsupported, status);
        }
      }
    }

    // v12: long-shot ML dog tracking
    if (p.market_type === 'moneyline' && (p.price_american ?? 0) >= 200) {
      incr(summary.byLongShotDog, status);
      if (p.long_shot_dog_risk_supported === false) {
        incr(summary.byLongShotDogUnsupported, status);
      }
    }

    // v12: totals trend agreement
    if (p.market_type === 'total') {
      const ag = p.totals_trend_agreement || 'unknown';
      if (summary.byTotalsTrendAgreement[ag]) {
        incr(summary.byTotalsTrendAgreement[ag], status);
      }
    }

    // Totals sourcing
    if (p.market_type === 'total') {
      totalPicks += 1;
      if (p.selection_side === 'over') overPicks += 1;
      if (p.selection_side === 'under') underPicks += 1;
      if (p.selection_side === 'over' || p.selection_side === 'under') {
        incr(summary.byTotalsSide[p.selection_side], status);
      }
      const src = p.model_source || p.totals_source || 'unknown';
      summary.byTotalsSource[src] = summary.byTotalsSource[src] || emptyRecord();
      incr(summary.byTotalsSource[src], status);
      if (src === 'slate_baseline_v1') slateBaselineCount += 1;
    }

    // Signals
    const signals = Array.isArray(p.top_signals) ? p.top_signals : (p.top_signals?.signals || []);
    for (const s of signals.slice(0, 3)) {
      const key = String(s).split(' (')[0];
      signalAttribution[key] = signalAttribution[key] || emptyRecord();
      incr(signalAttribution[key], status);
    }

    const score = Number(p.bet_score || 0);
    if (status === 'won') summary.topHits.push({ pick_key: p.pick_key, bet_score: score });
    if (status === 'lost') summary.topMisses.push({ pick_key: p.pick_key, bet_score: score });
  }

  summary.topHits.sort((a, b) => b.bet_score - a.bet_score);
  summary.topMisses.sort((a, b) => b.bet_score - a.bet_score);
  summary.topHits = summary.topHits.slice(0, 3);
  summary.topMisses = summary.topMisses.slice(0, 3);

  // ── Regime detection ──
  if (mlPicks >= 3 && mlUnderdogPicks === mlPicks) {
    summary.regimeFlags.push({ kind: 'all_underdog_ml', sampleSize: mlPicks });
  }
  if (atsPicks >= 3 && atsUnderdogPicks === atsPicks) {
    summary.regimeFlags.push({ kind: 'all_underdog_ats', sampleSize: atsPicks });
  }
  if (totalPicks >= 3 && overPicks === totalPicks) {
    summary.regimeFlags.push({ kind: 'all_over', sampleSize: totalPicks });
  }
  if (totalPicks >= 3 && underPicks === totalPicks) {
    summary.regimeFlags.push({ kind: 'all_under', sampleSize: totalPicks });
  }
  if (totalPicks >= 3 && slateBaselineCount === totalPicks) {
    summary.regimeFlags.push({ kind: 'totals_slate_baseline_dominant', sampleSize: totalPicks });
  }

  // v12 regime flags
  const lsd = summary.byLongShotDog;
  const lsdN = lsd.won + lsd.lost;
  if (lsdN >= 2 && lsd.won === 0) {
    summary.regimeFlags.push({ kind: 'long_shot_dog_miss_streak', sampleSize: lsdN });
  }
  const lfs = summary.byLargeFavoriteSpread;
  const lfsN = lfs.won + lfs.lost;
  if (lfsN >= 2 && lfs.won === 0) {
    summary.regimeFlags.push({ kind: 'large_favorite_spread_miss_streak', sampleSize: lfsN });
  }
  const ttAgree = summary.byTotalsTrendAgreement.agree;
  const ttAgreeN = ttAgree.won + ttAgree.lost;
  if (ttAgreeN >= 3 && hitRate(ttAgree) != null && hitRate(ttAgree) >= 0.65) {
    summary.regimeFlags.push({ kind: 'totals_trend_agreement_winning', sampleSize: ttAgreeN });
  }

  const recommendedDeltas = proposeDeltas(summary);
  return { summary, signalAttribution, recommendedDeltas };
}

/**
 * Conservative shadow-only proposer. Every delta is bounded such that
 * the validator layer accepts it.
 *
 * Triggers (require sample ≥ 30 unless noted):
 *   - underdog-ML hit rate < 45% → raise marketGates.moneyline.minUnderdogEdge +0.01
 *   - underdog-ATS hit rate < 45% → raise marketGates.spread.minEdge +0.01
 *   - over hit rate < 45% w/ ≥ 30 samples → tighten total.minExpectedDelta +0.05
 *   - under hit rate < 45% → same
 *   - slate_baseline_v1 totals hit rate < 45% with ≥ 20 samples → tighten total.minConfidence +0.05
 *   - tier1 hit rate < 55% w/ ≥ 20 samples → raise tier1.floor +0.02
 *   - 2-5% edge band outperforms < 1% band → shift weights.edge +0.02 / weights.sit -0.02
 *
 * Regime flags themselves don't auto-tune (one-day samples are too
 * small) but they are surfaced in the artifact rationale.
 */
function proposeDeltas(summary) {
  const out = { weights: null, tierCutoffs: null, marketGates: null, rationale: [] };

  // Underdog-ML
  const mlDog = summary.byFavoriteSide.ml_underdog;
  const mlDogN = mlDog.won + mlDog.lost;
  const mlDogRate = hitRate(mlDog);
  if (mlDogRate != null && mlDogN >= 30 && mlDogRate < 0.45) {
    out.marketGates = out.marketGates || {};
    out.marketGates.moneyline = { minUnderdogEdge: { delta: +0.01 } };
    out.rationale.push(`ml underdog hit ${(mlDogRate*100).toFixed(1)}% over ${mlDogN} → tighten +0.01`);
  }

  // Underdog-ATS
  const atsDog = summary.byFavoriteSide.ats_underdog;
  const atsDogN = atsDog.won + atsDog.lost;
  const atsDogRate = hitRate(atsDog);
  if (atsDogRate != null && atsDogN >= 30 && atsDogRate < 0.45) {
    out.marketGates = out.marketGates || {};
    out.marketGates.spread = { minEdge: { delta: +0.01 } };
    out.rationale.push(`ats underdog hit ${(atsDogRate*100).toFixed(1)}% over ${atsDogN} → tighten +0.01`);
  }

  // Totals over/under
  const overR = summary.byTotalsSide.over;
  const overN = overR.won + overR.lost;
  const overRate = hitRate(overR);
  if (overRate != null && overN >= 30 && overRate < 0.45) {
    out.marketGates = out.marketGates || {};
    out.marketGates.total = { minExpectedDelta: { delta: +0.05 } };
    out.rationale.push(`overs hit ${(overRate*100).toFixed(1)}% over ${overN} → tighten total gate +0.05`);
  }
  const underR = summary.byTotalsSide.under;
  const underN = underR.won + underR.lost;
  const underRate = hitRate(underR);
  if (underRate != null && underN >= 30 && underRate < 0.45) {
    out.marketGates = out.marketGates || {};
    out.marketGates.total = out.marketGates.total || {};
    if (out.marketGates.total.minExpectedDelta == null) {
      out.marketGates.total.minExpectedDelta = { delta: +0.05 };
    }
    out.rationale.push(`unders hit ${(underRate*100).toFixed(1)}% over ${underN} → tighten total gate +0.05`);
  }

  // Totals source — slate baseline underperforms
  const sb = summary.byTotalsSource.slate_baseline_v1;
  if (sb) {
    const sbN = sb.won + sb.lost;
    const sbRate = hitRate(sb);
    if (sbRate != null && sbN >= 20 && sbRate < 0.45) {
      out.marketGates = out.marketGates || {};
      out.marketGates.total = out.marketGates.total || {};
      if (out.marketGates.total.minConfidence == null) {
        out.marketGates.total.minConfidence = { delta: +0.05 };
      }
      out.rationale.push(`slate_baseline_v1 totals hit ${(sbRate*100).toFixed(1)}% over ${sbN} → require higher conf +0.05`);
    }
  }

  // Tier1
  const t1 = summary.byTier.tier1;
  const t1N = t1.won + t1.lost;
  const t1Rate = hitRate(t1);
  if (t1Rate != null && t1N >= 20 && t1Rate < 0.55) {
    out.tierCutoffs = { tier1: { floor: { delta: +0.02 } } };
    out.rationale.push(`tier1 hit ${(t1Rate*100).toFixed(1)}% over ${t1N} → raise floor +0.02`);
  }

  // Edge band weights
  const midRate = hitRate(summary.byEdgeBand['2to5']);
  const lowRate = hitRate(summary.byEdgeBand['lt1']);
  if (midRate != null && lowRate != null && midRate > 0.6 && lowRate < 0.48) {
    out.weights = { edge: { delta: +0.02 }, sit: { delta: -0.02 } };
    out.rationale.push(`edge band 2-5% outperforms <1% → shift weights.edge +0.02`);
  }

  // Regime flags get surfaced even when no auto-delta is safe.
  for (const f of summary.regimeFlags || []) {
    out.rationale.push(`REGIME ${f.kind} (n=${f.sampleSize}) — surfaced, no auto-tune (sample too small)`);
  }

  return out;
}
