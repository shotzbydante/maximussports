/**
 * Unit grades: how each side of the ball has played, by phase. Pure.
 *
 * Built from nflverse team-game EPA. Each unit is put on a 0 to 100 scale
 * where 50 is league average and about 15 points is one standard
 * deviation, so the numbers read like the position-group grades people
 * know from film-grading services. They are not film grades: they measure
 * results per play, not individual assignments.
 *
 * `source` is carried on every grade so a licensed feed (for example PFF
 * position-group grades) can replace these unit by unit. See
 * docs/nfl-picks-engine-v2.md for what such a feed needs to provide.
 */

import { weeksAgo, isBefore } from './ratings.js';

export const UNIT_KEYS = Object.freeze(['passOffense', 'rushOffense', 'passProtection', 'passDefense', 'rushDefense', 'passRush']);

export const UNIT_LABELS = Object.freeze({
  passOffense: 'Pass offense',
  rushOffense: 'Run offense',
  passProtection: 'Pass protection',
  passDefense: 'Pass defense',
  rushDefense: 'Run defense',
  passRush: 'Pass rush',
});

/** Which defensive unit each offensive unit lines up against. */
export const UNIT_MATCHUPS = Object.freeze([
  ['passOffense', 'passDefense'],
  ['rushOffense', 'rushDefense'],
  ['passProtection', 'passRush'],
]);

const TAU_WEEKS = 12;

function isNum(v) { return typeof v === 'number' && Number.isFinite(v); }

/**
 * @param {object} args
 * @param {Array} args.teamWeeks  nflverse team-game rows
 * @param {{season:number, week:number}} args.asOf
 * @returns {Record<string, Record<string, {grade:number, rank:number, value:number, source:string}>>}
 */
export function buildUnitGrades({ teamWeeks = [], asOf, source = 'nflverse' }) {
  const rows = teamWeeks.filter((t) => t.season === asOf.season && isBefore(t, asOf));
  const byGame = new Map(rows.map((t) => [`${t.gameId}|${t.team}`, t]));
  const acc = {};
  const bump = (team) => (acc[team] ||= {
    passEpa: 0, dropbacks: 0, rushEpa: 0, carries: 0, sacksAllowed: 0,
    passEpaAllowed: 0, oppDropbacks: 0, rushEpaAllowed: 0, oppCarries: 0, pressure: 0,
  });
  for (const t of rows) {
    const opp = byGame.get(`${t.gameId}|${t.opp}`);
    if (!opp || !isNum(t.passEpa) || !isNum(t.rushEpa) || !isNum(opp.passEpa) || !isNum(opp.rushEpa)) continue;
    const w = Math.exp(-weeksAgo(t, asOf) / TAU_WEEKS);
    const a = bump(t.team);
    a.passEpa += w * t.passEpa; a.dropbacks += w * t.dropbacks;
    a.rushEpa += w * t.rushEpa; a.carries += w * t.carries;
    a.sacksAllowed += w * t.sacksSuffered;
    a.passEpaAllowed += w * opp.passEpa; a.oppDropbacks += w * opp.dropbacks;
    a.rushEpaAllowed += w * opp.rushEpa; a.oppCarries += w * opp.carries;
    a.pressure += w * (t.defSacks + 0.5 * Math.max(0, t.defQbHits - t.defSacks));
  }

  const raw = {};
  for (const [team, a] of Object.entries(acc)) {
    if (a.dropbacks <= 0 || a.oppDropbacks <= 0) continue;
    raw[team] = {
      passOffense: a.passEpa / a.dropbacks,
      rushOffense: a.carries > 0 ? a.rushEpa / a.carries : 0,
      passProtection: -(a.sacksAllowed / a.dropbacks),
      passDefense: -(a.passEpaAllowed / a.oppDropbacks),
      rushDefense: a.oppCarries > 0 ? -(a.rushEpaAllowed / a.oppCarries) : 0,
      passRush: a.pressure / a.oppDropbacks,
    };
  }

  const teams = Object.keys(raw);
  const out = Object.fromEntries(teams.map((t) => [t, {}]));
  if (teams.length < 8) return out;
  for (const key of UNIT_KEYS) {
    const vals = teams.map((t) => raw[t][key]);
    const mu = vals.reduce((x, y) => x + y, 0) / vals.length;
    const sd = Math.sqrt(vals.reduce((x, y) => x + (y - mu) ** 2, 0) / vals.length) || 1;
    const order = [...teams].sort((x, y) => raw[y][key] - raw[x][key]);
    for (const t of teams) {
      out[t][key] = {
        grade: Math.round(Math.max(1, Math.min(99, 50 + 15 * (raw[t][key] - mu) / sd))),
        rank: order.indexOf(t) + 1,
        value: Math.round(raw[t][key] * 1000) / 1000,
        source,
      };
    }
  }
  return out;
}

/**
 * The lopsided unit matchups in a game, biggest gap first.
 * @returns {Array<{offense:string, defense:string, offenseTeam:string, defenseTeam:string, offenseGrade:number, defenseGrade:number, gap:number}>}
 */
export function unitMismatches({ home, away, grades, minGap = 18 }) {
  const out = [];
  for (const [off, def] of UNIT_MATCHUPS) {
    for (const [o, d] of [[home, away], [away, home]]) {
      const og = grades?.[o]?.[off]?.grade, dg = grades?.[d]?.[def]?.grade;
      if (!isNum(og) || !isNum(dg)) continue;
      const gap = og - dg;
      if (Math.abs(gap) >= minGap) {
        out.push({ offense: off, defense: def, offenseTeam: o, defenseTeam: d, offenseGrade: og, defenseGrade: dg, gap });
      }
    }
  }
  return out.sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));
}
