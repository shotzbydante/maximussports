/**
 * Game projection from v2 ratings. Pure.
 *
 * Margin and total come from the two teams' offense and defense ratings,
 * home field, rest, this week's quarterbacks and, for totals, the playing
 * environment (roof, wind, cold).
 */

import { RATING_PARAMS } from './ratings.js';

export const PROJECTION_PARAMS = Object.freeze({
  /** Points for coming off a bye (13+ days of rest) against a team on normal rest. */
  byeEdge: 0.6,
  /** Points lost on short rest (5 days or fewer) against a team on normal rest. */
  shortRestEdge: 0.0,
  /** Totals: points added under a roof (dome or closed). */
  roofTotal: 1.7,
  /** Totals: points removed outdoors in ordinary conditions. */
  outdoorTotal: 0.8,
  /** Totals: points removed per mph of sustained wind above the threshold, outdoors. */
  windPerMph: 0.3,
  windThreshold: 10,
  /** Totals: points removed in deep cold, outdoors. */
  coldTotal: 2.0,
  coldThreshold: 20,
  /** Cap on the total environment adjustment, either direction. */
  envCap: 6,
});

function isNum(v) { return typeof v === 'number' && Number.isFinite(v); }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

export function isIndoor(roof) {
  const r = String(roof || '').toLowerCase();
  return r === 'dome' || r === 'closed' || r === 'indoor';
}

/**
 * Environment adjustment to the total, in points.
 * @param {{roof?:string, indoor?:boolean, temp?:number, wind?:number}} env
 * @returns {{ points:number, parts:Array<{key:string, points:number}>, known:boolean }}
 */
export function totalEnvironment(env = {}, params = PROJECTION_PARAMS) {
  const p = { ...PROJECTION_PARAMS, ...params };
  const parts = [];
  const indoor = env.indoor === true || isIndoor(env.roof);
  if (indoor) {
    parts.push({ key: 'roof', points: p.roofTotal });
    return { points: p.roofTotal, parts, known: true };
  }
  const outdoors = env.indoor === false || ['outdoors', 'open'].includes(String(env.roof || '').toLowerCase());
  const known = isNum(env.wind) || isNum(env.temp);
  if (outdoors) parts.push({ key: 'outdoors', points: -p.outdoorTotal });
  if (isNum(env.wind) && env.wind > p.windThreshold) {
    parts.push({ key: 'wind', points: -p.windPerMph * (env.wind - p.windThreshold) });
  }
  if (isNum(env.temp) && env.temp <= p.coldThreshold) parts.push({ key: 'cold', points: -p.coldTotal });
  const points = clamp(parts.reduce((a, x) => a + x.points, 0), -p.envCap, p.envCap);
  return { points: Math.round(points * 100) / 100, parts, known };
}

function restEdge(homeRest, awayRest, p) {
  if (!isNum(homeRest) || !isNum(awayRest)) return 0;
  const tag = (d) => (d >= 13 ? 'bye' : d <= 5 ? 'short' : 'normal');
  const h = tag(homeRest), a = tag(awayRest);
  let edge = 0;
  if (h === 'bye' && a !== 'bye') edge += p.byeEdge;
  if (a === 'bye' && h !== 'bye') edge -= p.byeEdge;
  if (h === 'short' && a === 'normal') edge -= p.shortRestEdge;
  if (a === 'short' && h === 'normal') edge += p.shortRestEdge;
  return edge;
}

/**
 * @param {object} args
 * @param {string} args.home, args.away         team codes present in ratings.teams
 * @param {object} args.ratings                 output of buildRatings()
 * @param {boolean} [args.neutral]
 * @param {{home?:number, away?:number}} [args.qb]   quarterback points for each side
 * @param {{home?:number, away?:number}} [args.rest] days since each side's last game
 * @param {object} [args.env]                   roof / temp / wind
 * @returns {object|null} margin is home minus away
 */
export function projectGame({ home, away, ratings, neutral = false, qb = {}, rest = {}, env = {}, params = {} }) {
  const H = ratings?.teams?.[home];
  const A = ratings?.teams?.[away];
  if (!H || !A) return null;
  const rp = { ...RATING_PARAMS, ...(params.rating || {}) };
  const pp = { ...PROJECTION_PARAMS, ...(params.projection || {}) };

  const hfa = neutral ? 0 : rp.hfa;
  const lg = isNum(ratings.leaguePpg) ? ratings.leaguePpg : 22.5;
  const qbHome = isNum(qb.home) ? qb.home : 0;
  const qbAway = isNum(qb.away) ? qb.away : 0;
  const restPts = restEdge(rest.home, rest.away, pp);
  const environment = totalEnvironment(env, pp);

  let homePts = lg + H.offense - A.defense + hfa / 2 + qbHome + restPts / 2;
  let awayPts = lg + A.offense - H.defense - hfa / 2 + qbAway - restPts / 2;
  homePts += environment.points / 2;
  awayPts += environment.points / 2;

  const r1 = (v) => Math.round(v * 10) / 10;
  return {
    margin: r1(homePts - awayPts),
    total: r1(homePts + awayPts),
    homePoints: r1(homePts),
    awayPoints: r1(awayPts),
    fairSpreadHome: r1(-(homePts - awayPts)),
    parts: {
      ratings: r1((H.offense + H.defense) - (A.offense + A.defense)),
      homeField: hfa,
      quarterback: r1(qbHome - qbAway),
      rest: r1(restPts),
      environmentTotal: environment.points,
      quarterbackTotal: r1(qbHome + qbAway),
    },
    environment,
  };
}
