/**
 * Quarterback layer. Pure.
 *
 * A team's rating is built from games its quarterbacks actually played. If
 * a different quarterback starts this week, the rating is describing the
 * wrong offense. This module measures each quarterback (EPA per play,
 * shrunk hard toward a replacement-level prior when the sample is small),
 * works out which quarterbacks produced the team's rated games, and returns
 * the points to add or remove for this week's expected starter.
 *
 *   adjustment = scale x plays per game x sum over other QBs of
 *                (their share of the team's rated plays) x (starter value - their value)
 *
 * A starter who took every rated snap gets an adjustment of exactly zero.
 */

import { weeksAgo, isBefore } from './ratings.js';

export const QB_PARAMS = Object.freeze({
  /** Weeks for a quarterback game's weight to fall to 1/e. */
  tauWeeks: 80,
  /** Plays of prior evidence at replacement level. */
  priorPlays: 250,
  /** Replacement level, EPA per play relative to the league-average quarterback. */
  replacementEpa: -0.12,
  /** Quarterback plays per team game (dropbacks plus designed runs and scrambles). */
  playsPerGame: 40,
  /** Share of the raw EPA gap that shows up on the scoreboard. */
  scale: 0.6,
  lookbackSeasons: 2,
  /** A starter with fewer weighted plays than this is treated as unproven. */
  lowSamplePlays: 120,
});

/**
 * @returns {{ byId: Map<string, {id,name,plays,value,raw}>, leagueEpa: number }}
 *          value = shrunk EPA per play above the league-average quarterback
 */
export function buildQbTable({ qbWeeks = [], asOf, params = QB_PARAMS }) {
  const p = { ...QB_PARAMS, ...params };
  const minSeason = asOf.season - p.lookbackSeasons;
  const acc = new Map();
  let lgEpa = 0, lgPlays = 0;
  for (const r of qbWeeks) {
    if (r.season < minSeason || !isBefore(r, asOf)) continue;
    const w = Math.exp(-weeksAgo(r, asOf) / p.tauWeeks);
    let a = acc.get(r.playerId);
    if (!a) { a = { id: r.playerId, name: r.name, epa: 0, plays: 0 }; acc.set(r.playerId, a); }
    a.epa += w * r.epa; a.plays += w * r.plays;
    lgEpa += w * r.epa; lgPlays += w * r.plays;
  }
  const leagueEpa = lgPlays > 0 ? lgEpa / lgPlays : 0;
  const byId = new Map();
  for (const a of acc.values()) {
    const above = a.epa - leagueEpa * a.plays;
    byId.set(a.id, {
      id: a.id, name: a.name,
      plays: Math.round(a.plays * 10) / 10,
      raw: a.plays > 0 ? above / a.plays : null,
      value: (above + p.priorPlays * p.replacementEpa) / (a.plays + p.priorPlays),
    });
  }
  return { byId, leagueEpa, params: p };
}

/** Value for a quarterback, or the replacement prior when he has no plays on file. */
export function qbValue(table, id) {
  return table?.byId?.get(id)?.value ?? (table?.params?.replacementEpa ?? QB_PARAMS.replacementEpa);
}

/** Index quarterback rows by `season|week|team` for the mix lookup. */
export function indexQbWeeks(qbWeeks = []) {
  const idx = new Map();
  for (const r of qbWeeks) {
    const k = `${r.season}|${r.week}|${r.team}`;
    let list = idx.get(k);
    if (!list) { list = []; idx.set(k, list); }
    list.push(r);
  }
  return idx;
}

/**
 * Who produced a team's rated games, by share of weighted quarterback plays.
 * @param {Array<{season,week,w}>} weights  the team's game weights from buildRatings()
 * @returns {Array<{id,name,share}>} largest share first
 */
export function teamQbMix({ team, weights = [], qbIndex }) {
  const shares = new Map();
  let total = 0;
  for (const g of weights) {
    for (const r of qbIndex.get(`${g.season}|${g.week}|${team}`) || []) {
      const v = g.w * r.dropbacks;
      if (v <= 0) continue;
      const cur = shares.get(r.playerId) || { id: r.playerId, name: r.name, v: 0 };
      cur.v += v; shares.set(r.playerId, cur); total += v;
    }
  }
  if (total <= 0) return [];
  return [...shares.values()].map((s) => ({ id: s.id, name: s.name, share: s.v / total }))
    .sort((a, b) => b.share - a.share);
}

/**
 * Points to add to a team's projected score for this week's starter.
 * @returns {{ points:number, starter:{id,name,value,plays}|null, primary:{id,name,share}|null,
 *             starterShare:number, lowSample:boolean, known:boolean }}
 */
export function qbAdjustment({ team, starterId, starterName = null, ratings, table, qbIndex, params = QB_PARAMS }) {
  const p = { ...QB_PARAMS, ...params };
  const mix = teamQbMix({ team, weights: ratings?.weights?.[team] || [], qbIndex });
  const primary = mix[0] || null;
  if (!starterId) {
    return { points: 0, starter: null, primary, starterShare: 0, lowSample: false, known: false };
  }
  const vStarter = qbValue(table, starterId);
  let gap = 0, starterShare = 0;
  for (const q of mix) {
    if (q.id === starterId) { starterShare = q.share; continue; }
    gap += q.share * (vStarter - qbValue(table, q.id));
  }
  const entry = table?.byId?.get(starterId) || null;
  const plays = entry?.plays ?? 0;
  return {
    points: Math.round(p.scale * p.playsPerGame * gap * 100) / 100,
    starter: { id: starterId, name: entry?.name || starterName, value: Math.round(vStarter * 1000) / 1000, plays },
    primary,
    starterShare: Math.round(starterShare * 1000) / 1000,
    lowSample: plays < p.lowSamplePlays,
    known: true,
  };
}
