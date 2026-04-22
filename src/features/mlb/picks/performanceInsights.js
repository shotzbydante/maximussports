/**
 * Performance & audit shaping helpers — pure functions.
 *
 * These consume real rows from picks_daily_scorecards / picks_audit_artifacts
 * and shape them into the minimum structured data the UI needs. No fabricated
 * stats. Every returned value is derivable from inputs.
 *
 * Sparsity rules (minimum samples before we surface anything):
 *   - aggregate record:   any graded row
 *   - by-market insight:  ≥ 5 graded picks per market AND delta ≥ 8 pts
 *   - by-tier insight:    ≥ 5 graded picks per tier  AND delta ≥ 8 pts
 *   - top-play hit rate:  ≥ 7 graded top plays (one per day over ~7d)
 *   - audit "learning" line: ≥ 14 graded picks total in the window
 *
 * Callers get a structured result with {sparse} flags so UI can degrade
 * gracefully instead of rendering 0-0 as a headline.
 */

const MIN_MARKET_SAMPLE = 5;
const MIN_TIER_SAMPLE = 5;
const MIN_TOPPLAY_SAMPLE = 7;
const MIN_WINDOW_SAMPLE = 14;
const MIN_DELTA_PTS = 8;

function emptyRecord() { return { won: 0, lost: 0, push: 0, pending: 0 }; }

function addInto(a, b) {
  a.won     += b?.won     ?? 0;
  a.lost    += b?.lost    ?? 0;
  a.push    += b?.push    ?? 0;
  a.pending += b?.pending ?? 0;
  return a;
}

function hitRate(rec) {
  const n = (rec?.won ?? 0) + (rec?.lost ?? 0);
  return n > 0 ? (rec.won ?? 0) / n : null;
}

function pct(rec) {
  const r = hitRate(rec);
  return r == null ? null : Math.round(r * 100);
}

function sumOver(scorecards, key) {
  const out = emptyRecord();
  for (const sc of scorecards) addInto(out, sc?.[key]);
  return out;
}

/**
 * Roll a flat list of `picks_daily_scorecards` rows into a single aggregate.
 *
 * @param {Array<{record, by_market, by_tier, top_play_result, slate_date}>} scorecards
 * @returns {{
 *   sampleDays: number,
 *   overall: Record,
 *   byMarket: { moneyline, runline, total },
 *   byTier:   { tier1, tier2, tier3 },
 *   topPlay:  { graded: number, won: number, lost: number, hitRate: 0..1|null },
 *   sparse:   boolean,
 * }}
 */
export function aggregateScorecards(scorecards = []) {
  const overall = emptyRecord();
  const byMarket = { moneyline: emptyRecord(), runline: emptyRecord(), total: emptyRecord() };
  const byTier = { tier1: emptyRecord(), tier2: emptyRecord(), tier3: emptyRecord() };
  const topPlay = { graded: 0, won: 0, lost: 0, push: 0 };

  for (const sc of scorecards) {
    addInto(overall, sc?.record || sc?.overall);
    const bm = sc?.by_market || sc?.byMarket || {};
    addInto(byMarket.moneyline, bm.moneyline);
    addInto(byMarket.runline,   bm.runline);
    addInto(byMarket.total,     bm.total);
    const bt = sc?.by_tier || sc?.byTier || {};
    addInto(byTier.tier1, bt.tier1);
    addInto(byTier.tier2, bt.tier2);
    addInto(byTier.tier3, bt.tier3);
    const tp = sc?.top_play_result ?? sc?.topPlayResult;
    if (tp === 'won') { topPlay.graded += 1; topPlay.won += 1; }
    else if (tp === 'lost') { topPlay.graded += 1; topPlay.lost += 1; }
    else if (tp === 'push') { topPlay.graded += 1; topPlay.push += 1; }
  }

  const graded = overall.won + overall.lost;
  return {
    sampleDays: scorecards.length,
    overall,
    byMarket,
    byTier,
    topPlay: {
      ...topPlay,
      hitRate: topPlay.graded > 0 ? topPlay.won / topPlay.graded : null,
    },
    sparse: graded < MIN_WINDOW_SAMPLE,
  };
}

/**
 * Find the strongest market over the aggregated window.
 * Returns null when not enough data.
 */
export function strongestMarket(agg) {
  const bm = agg?.byMarket || {};
  const rates = Object.entries(bm)
    .map(([key, rec]) => ({
      key,
      n: (rec?.won ?? 0) + (rec?.lost ?? 0),
      pct: pct(rec),
    }))
    .filter(x => x.n >= MIN_MARKET_SAMPLE && x.pct != null)
    .sort((a, b) => b.pct - a.pct);
  if (rates.length === 0) return null;
  const top = rates[0];
  const next = rates[1];
  const delta = next ? top.pct - next.pct : Infinity;
  if (next && delta < MIN_DELTA_PTS) return null; // not decisive enough
  return { key: top.key, winRate: top.pct, sample: top.n };
}

/**
 * Find the strongest tier over the aggregated window.
 */
export function strongestTier(agg) {
  const bt = agg?.byTier || {};
  const rates = Object.entries(bt)
    .map(([key, rec]) => ({
      key,
      n: (rec?.won ?? 0) + (rec?.lost ?? 0),
      pct: pct(rec),
    }))
    .filter(x => x.n >= MIN_TIER_SAMPLE && x.pct != null)
    .sort((a, b) => b.pct - a.pct);
  if (rates.length === 0) return null;
  const top = rates[0];
  const next = rates[1];
  const delta = next ? top.pct - next.pct : Infinity;
  if (next && delta < MIN_DELTA_PTS) return null;
  return { key: top.key, winRate: top.pct, sample: top.n, delta };
}

const MARKET_HUMAN = { moneyline: 'Moneyline', runline: 'Spreads', total: 'Game Totals' };
const TIER_HUMAN = { tier1: 'Tier 1', tier2: 'Tier 2', tier3: 'Tier 3' };

/**
 * Build 0–3 short editorial insight strings from an aggregate. Only surfaces
 * when data is meaningful; returns an empty array when sparse.
 *
 * Tone is calm, transparent, evidence-backed. No fake certainty.
 */
export function summarizeInsights(agg) {
  if (!agg || agg.sparse) return [];
  const out = [];

  const market = strongestMarket(agg);
  if (market) {
    out.push({
      key: `market_${market.key}`,
      text: `${MARKET_HUMAN[market.key] || market.key} has been the strongest market — ${market.winRate}% over ${market.sample} graded picks.`,
      tone: 'positive',
    });
  }

  const tier = strongestTier(agg);
  if (tier) {
    out.push({
      key: `tier_${tier.key}`,
      text: tier.key === 'tier1'
        ? `${TIER_HUMAN[tier.key]} picks are leading the board at ${tier.winRate}% (${tier.sample} graded).`
        : `${TIER_HUMAN[tier.key]} is outperforming the board at ${tier.winRate}% (${tier.sample} graded).`,
      tone: 'positive',
    });
  }

  // Top Play consistency line — only when we have enough graded top plays.
  if (agg.topPlay?.graded >= MIN_TOPPLAY_SAMPLE && agg.topPlay?.hitRate != null) {
    const tpPct = Math.round(agg.topPlay.hitRate * 100);
    out.push({
      key: 'top_play_rate',
      text: `Top Plays are holding up at ${tpPct}% over ${agg.topPlay.graded} graded days.`,
      tone: tpPct >= 55 ? 'positive' : tpPct >= 45 ? 'neutral' : 'negative',
    });
  }

  return out.slice(0, 3);
}

/**
 * Shape a single performance-window summary the UI can render directly.
 *
 *   { label, record, winRate, units, sample, sparse, insights[] }
 */
/**
 * State machine for display copy:
 *   'full'    — graded >= MIN_WINDOW_SAMPLE; confident window
 *   'partial' — 1..MIN_WINDOW_SAMPLE-1 graded; show record with "partial" note
 *   'pending' — scorecards exist but nothing graded yet (all pending)
 *   'none'    — no scorecards in window at all
 */
export function classifyWindow(agg) {
  const graded = (agg?.overall?.won ?? 0) + (agg?.overall?.lost ?? 0);
  const pending = agg?.overall?.pending ?? 0;
  const days = agg?.sampleDays ?? 0;
  if (graded >= MIN_WINDOW_SAMPLE) return 'full';
  if (graded > 0) return 'partial';
  if (days > 0 && pending > 0) return 'pending';
  return 'none';
}

export function shapeWindow(scorecards, label = 'Last 7 days') {
  const agg = aggregateScorecards(scorecards);
  const graded = agg.overall.won + agg.overall.lost;
  const pending = agg.overall.pending ?? 0;
  const record = graded > 0
    ? `${agg.overall.won}–${agg.overall.lost}${agg.overall.push ? `–${agg.overall.push}` : ''}`
    : null;
  const winRate = pct(agg.overall);
  const state = classifyWindow(agg);
  return {
    label,
    record,
    winRate,
    sample: graded,
    pending,
    days: agg.sampleDays,
    sparse: agg.sparse || graded < 5,
    state, // 'full' | 'partial' | 'pending' | 'none'
    insights: summarizeInsights(agg),
    agg,
  };
}

/**
 * Take a list of audit artifact rows (summary + signal_attribution) and
 * produce 0–2 short editorial "learning" insights. No overclaiming.
 */
export function summarizeAuditInsights(artifacts = []) {
  if (!artifacts?.length) return [];
  const out = [];

  // Roll up sampleSize + byMarket from every artifact's summary
  const overall = emptyRecord();
  const byMarket = { moneyline: emptyRecord(), runline: emptyRecord(), total: emptyRecord() };
  for (const a of artifacts) {
    const s = a?.summary || {};
    addInto(overall, s.overall);
    const bm = s.byMarket || {};
    addInto(byMarket.moneyline, bm.moneyline);
    addInto(byMarket.runline,   bm.runline);
    addInto(byMarket.total,     bm.total);
  }
  const totalSample = overall.won + overall.lost;
  if (totalSample < MIN_WINDOW_SAMPLE) return [];

  // Strongest market from audit rollup
  const market = strongestMarket({ byMarket });
  if (market) {
    out.push({
      key: `audit_market_${market.key}`,
      text: `${MARKET_HUMAN[market.key] || market.key} signals have been our cleanest source of edge recently.`,
      tone: 'positive',
    });
  }

  // Signal attribution — most common winning signal
  const signals = {};
  for (const a of artifacts) {
    const sa = a?.signal_attribution || {};
    for (const [name, rec] of Object.entries(sa)) {
      signals[name] = signals[name] || emptyRecord();
      addInto(signals[name], rec);
    }
  }
  const bestSignal = Object.entries(signals)
    .map(([name, rec]) => ({ name, n: (rec.won ?? 0) + (rec.lost ?? 0), pct: pct(rec) }))
    .filter(x => x.n >= 8 && x.pct != null && x.pct >= 55)
    .sort((a, b) => b.pct - a.pct)[0];
  if (bestSignal && out.length < 2) {
    out.push({
      key: `audit_signal_${bestSignal.name}`,
      text: `"${bestSignal.name}" has been a reliable signal — ${bestSignal.pct}% over ${bestSignal.n} graded picks.`,
      tone: 'positive',
    });
  }

  return out.slice(0, 2);
}

/**
 * Data-sparsity fallback builder — returns a "Building track record" object
 * callers can render when they don't yet have enough data.
 */
export function buildingTrackRecordState() {
  return {
    label: 'Building track record',
    text: 'Results accumulate daily. Check back after the next slate grades.',
  };
}

// Re-exports of constants so tests / callers can reference them.
export const PERF_CONSTANTS = Object.freeze({
  MIN_MARKET_SAMPLE,
  MIN_TIER_SAMPLE,
  MIN_TOPPLAY_SAMPLE,
  MIN_WINDOW_SAMPLE,
  MIN_DELTA_PTS,
});
