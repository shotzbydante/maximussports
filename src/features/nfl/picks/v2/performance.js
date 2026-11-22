/**
 * Performance summary for graded NFL picks: record, units and closing-line
 * value, split by role. Pure.
 *
 * Units assume one unit staked per pick at the stored price (-110 when a
 * row has none). Closing-line value is averaged over picks that have it.
 */

import { unitsFor } from './distribution.js';

const ZERO = () => ({ won: 0, lost: 0, push: 0, graded: 0, units: 0, clvEvSum: 0, clvPointsSum: 0, clvN: 0, clvPointsN: 0, beatClose: 0 });

export function pickRoleOf(p) {
  return p?.rationale?.pickRole || (p?.tier === 'tracking' ? 'tracking' : 'hero');
}

function resultOf(p) {
  return Array.isArray(p?.pick_results) ? p.pick_results[0] : p?.pick_results;
}

/**
 * @param {Array} picks  `picks` rows with `pick_results` joined
 * @returns {{ hero: object, tracking: object }}
 */
export function summarizePerformance(picks = []) {
  const out = { hero: ZERO(), tracking: ZERO() };
  for (const p of picks) {
    const acc = out[pickRoleOf(p)];
    if (!acc) continue;
    const res = resultOf(p);
    const status = res?.status;
    if (status === 'won' || status === 'lost' || status === 'push') {
      acc[status] += 1;
      acc.graded += 1;
      const price = p.price_american == null ? null : Number(p.price_american);
      const units = res.units == null ? unitsFor(status, price) : Number(res.units);
      if (Number.isFinite(units)) acc.units += units;
    }
    if (p.clv_ev != null && Number.isFinite(Number(p.clv_ev))) {
      acc.clvEvSum += Number(p.clv_ev); acc.clvN += 1;
      if (Number(p.clv_ev) > 0) acc.beatClose += 1;
    }
    if (p.clv_points != null && Number.isFinite(Number(p.clv_points))) {
      acc.clvPointsSum += Number(p.clv_points); acc.clvPointsN += 1;
    }
  }
  for (const acc of Object.values(out)) {
    acc.units = Math.round(acc.units * 100) / 100;
    acc.clvEvSum = Math.round(acc.clvEvSum * 1000) / 1000;
    acc.clvPointsSum = Math.round(acc.clvPointsSum * 100) / 100;
  }
  return out;
}

/** Add several summaries together (for a season view over daily scorecards). */
export function addPerformance(list = []) {
  const out = { hero: ZERO(), tracking: ZERO() };
  for (const perf of list) {
    for (const role of ['hero', 'tracking']) {
      for (const k of Object.keys(out[role])) out[role][k] += Number(perf?.[role]?.[k] || 0);
    }
  }
  return out;
}

/** Display-ready numbers for one role. */
export function presentPerformance(acc) {
  if (!acc) return null;
  const decided = acc.won + acc.lost;
  return {
    record: { won: acc.won, lost: acc.lost, push: acc.push },
    winPct: decided > 0 ? Math.round((acc.won / decided) * 1000) / 10 : null,
    units: Math.round(acc.units * 100) / 100,
    roiPct: acc.graded > 0 ? Math.round((acc.units / acc.graded) * 1000) / 10 : null,
    clvEvPct: acc.clvN > 0 ? Math.round((acc.clvEvSum / acc.clvN) * 1000) / 10 : null,
    clvPoints: acc.clvPointsN > 0 ? Math.round((acc.clvPointsSum / acc.clvPointsN) * 100) / 100 : null,
    beatClosePct: acc.clvN > 0 ? Math.round((acc.beatClose / acc.clvN) * 1000) / 10 : null,
    clvSample: acc.clvN,
  };
}
