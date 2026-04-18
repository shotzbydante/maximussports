/**
 * Audit analyzer — takes a window of graded picks and emits an artifact object
 * plus a proposed (pre-validated) tuning delta.
 *
 *   analyzePicks({ sport, slateDate, picks })
 *     → { summary, signalAttribution, recommendedDeltas }
 *
 * Pure function. The validator layer enforces safety; this module's job is just
 * pattern recognition + rule-of-thumb proposals.
 */

const EDGE_BANDS = [
  { label: 'lt1', min: -Infinity, max: 0.01 },
  { label: '1to2', min: 0.01, max: 0.02 },
  { label: '2to5', min: 0.02, max: 0.05 },
  { label: 'gte5', min: 0.05, max: Infinity },
];

function emptyRecord() { return { won: 0, lost: 0, push: 0, pending: 0 }; }
function hitRate(rec) { const n = rec.won + rec.lost; return n > 0 ? rec.won / n : null; }

export function analyzePicks({ sport, slateDate, picks = [] }) {
  const summary = {
    date: slateDate,
    sampleSize: picks.length,
    overall: emptyRecord(),
    byMarket: { moneyline: emptyRecord(), runline: emptyRecord(), total: emptyRecord() },
    byTier:   { tier1: emptyRecord(), tier2: emptyRecord(), tier3: emptyRecord() },
    byEdgeBand: Object.fromEntries(EDGE_BANDS.map(b => [b.label, emptyRecord()])),
    byHomeAway: { home: emptyRecord(), away: emptyRecord() },
    topHits: [],
    topMisses: [],
  };

  const signalAttribution = {};      // signalName -> {won, lost}

  for (const p of picks) {
    const res = Array.isArray(p.pick_results) ? p.pick_results[0] : p.pick_results;
    const status = res?.status || 'pending';
    incr(summary.overall, status);
    if (summary.byMarket[p.market_type]) incr(summary.byMarket[p.market_type], status);
    if (summary.byTier[p.tier]) incr(summary.byTier[p.tier], status);

    // Edge band (ML raw_edge)
    if (p.raw_edge != null) {
      const band = EDGE_BANDS.find(b => p.raw_edge >= b.min && p.raw_edge < b.max);
      if (band) incr(summary.byEdgeBand[band.label], status);
    }
    // Side
    if (p.selection_side === 'home' || p.selection_side === 'away') {
      incr(summary.byHomeAway[p.selection_side], status);
    }

    // Signal attribution
    const signals = Array.isArray(p.top_signals) ? p.top_signals : (p.top_signals?.signals || []);
    for (const s of signals.slice(0, 3)) {
      const key = String(s).split(' (')[0]; // collapse "Rotation quality (strong away edge)" → "Rotation quality"
      signalAttribution[key] = signalAttribution[key] || emptyRecord();
      incr(signalAttribution[key], status);
    }

    // Top hits / misses (by bet_score weighting)
    const score = Number(p.bet_score || 0);
    if (status === 'won') summary.topHits.push({ pick_key: p.pick_key, bet_score: score });
    if (status === 'lost') summary.topMisses.push({ pick_key: p.pick_key, bet_score: score });
  }
  summary.topHits.sort((a, b) => b.bet_score - a.bet_score);
  summary.topMisses.sort((a, b) => b.bet_score - a.bet_score);
  summary.topHits = summary.topHits.slice(0, 3);
  summary.topMisses = summary.topMisses.slice(0, 3);

  // ── Proposer: rule-of-thumb deltas ──
  const recommendedDeltas = proposeDeltas(summary);

  return { summary, signalAttribution, recommendedDeltas };
}

function incr(rec, status) { if (rec && status in rec) rec[status] += 1; }

/**
 * Rules (conservative):
 *   - If tier1 hit rate < 55% and sample ≥ 20, propose +0.02 to tier1.floor
 *   - If totals hit rate < 45% and sample ≥ 15, propose +0.05 to marketGates.total.minExpectedDelta
 *   - If 2to5 edge band hit rate > 60% and lt1 hit rate < 48%, propose +0.02 to wE (−0.02 to wS)
 */
function proposeDeltas(summary) {
  const out = { weights: null, tierCutoffs: null, marketGates: null, rationale: [] };

  const t1Rate = hitRate(summary.byTier.tier1);
  const t1Sample = summary.byTier.tier1.won + summary.byTier.tier1.lost;
  if (t1Rate != null && t1Sample >= 20 && t1Rate < 0.55) {
    out.tierCutoffs = { tier1: { floor: { delta: +0.02 } } };
    out.rationale.push(`tier1 hit ${(t1Rate * 100).toFixed(1)}% over ${t1Sample} → raise floor +0.02`);
  }

  const totRate = hitRate(summary.byMarket.total);
  const totSample = summary.byMarket.total.won + summary.byMarket.total.lost;
  if (totRate != null && totSample >= 15 && totRate < 0.45) {
    out.marketGates = { total: { minExpectedDelta: { delta: +0.05 } } };
    out.rationale.push(`totals hit ${(totRate * 100).toFixed(1)}% over ${totSample} → tighten gate +0.05`);
  }

  const midRate = hitRate(summary.byEdgeBand['2to5']);
  const lowRate = hitRate(summary.byEdgeBand['lt1']);
  if (midRate != null && lowRate != null && midRate > 0.60 && lowRate < 0.48) {
    out.weights = { edge: { delta: +0.02 }, sit: { delta: -0.02 } };
    out.rationale.push(`edge band 2–5% outperforms <1% → shift +0.02 to weights.edge from weights.sit`);
  }

  return out;
}
