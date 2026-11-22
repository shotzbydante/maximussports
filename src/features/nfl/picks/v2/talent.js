/**
 * Roster talent: position-group grades for each team and the matchups
 * they set up in a game.
 *
 * The grades are Maximus's own blend, built off-line in the player
 * workbook from Madden overall ratings, PFF position ranks and 2026
 * production. Only the blended team grades are loaded here; the
 * underlying ratings are not in this repository.
 *
 * Context only. The blend's weights are judgment and there is one
 * snapshot of it, so it cannot be tested against closing lines yet. Like
 * every other untested input it moves no fair number and makes no pick.
 */

/** Offense unit against the defense unit that opposes it. */
export const TALENT_PAIRS = Object.freeze([
  { offense: 'QB', defense: 'Pass defense', label: 'quarterback', against: 'pass defense' },
  { offense: 'Pass protection', defense: 'Pass rush', label: 'pass protection', against: 'pass rush' },
  { offense: 'Receivers', defense: 'Coverage', label: 'receivers', against: 'coverage' },
  { offense: 'Run game', defense: 'Run defense', label: 'run game', against: 'run defense' },
]);

export const TALENT_PARAMS = Object.freeze({ edge: 3, bigEdge: 6 });

function isNum(v) { return typeof v === 'number' && Number.isFinite(v); }
const r1 = (v) => Math.round(v * 10) / 10;

/** League average of each unit across the teams on file. */
export function talentAverages(teams = {}) {
  const sums = {};
  for (const t of Object.values(teams)) {
    for (const [unit, v] of Object.entries(t || {})) {
      if (!isNum(v)) continue;
      (sums[unit] ||= { s: 0, n: 0 }); sums[unit].s += v; sums[unit].n += 1;
    }
  }
  return Object.fromEntries(Object.entries(sums).map(([u, x]) => [u, x.s / x.n]));
}

/**
 * Every unit matchup in a game, both directions, biggest first.
 * `edge` is how far the offense unit sits above league average minus how
 * far the defense unit does: positive favours the offense.
 */
export function talentMatchups({ home, away, talent, params = TALENT_PARAMS }) {
  const teams = talent?.teams || {};
  const H = teams[home], A = teams[away];
  if (!H || !A) return null;
  const avg = talent.averages || talentAverages(teams);
  const rows = [];
  for (const [off, def, offCode, defCode] of [[A, H, away, home], [H, A, home, away]]) {
    for (const p of TALENT_PAIRS) {
      const o = off[p.offense], d = def[p.defense];
      if (!isNum(o) || !isNum(d) || !isNum(avg[p.offense]) || !isNum(avg[p.defense])) continue;
      const edge = r1((o - avg[p.offense]) - (d - avg[p.defense]));
      const size = Math.abs(edge) >= params.bigEdge ? 'big' : Math.abs(edge) >= params.edge ? 'edge' : 'even';
      rows.push({
        offenseTeam: offCode, defenseTeam: defCode, offense: p.label, defense: p.against,
        offenseGrade: o, defenseGrade: d, edge, size,
        favours: size === 'even' ? null : (edge > 0 ? offCode : defCode),
      });
    }
  }
  if (rows.length === 0) return null;
  const sum = (code) => rows.filter((x) => x.offenseTeam === code).reduce((s, x) => s + x.edge, 0);
  const net = r1(sum(home) - sum(away));
  return {
    matchups: rows.sort((a, b) => Math.abs(b.edge) - Math.abs(a.edge)),
    netHome: net,
    leansTo: Math.abs(net) >= params.edge ? (net > 0 ? home : away) : null,
    overall: { home: H['Overall talent'] ?? null, away: A['Overall talent'] ?? null },
    asOf: talent.asOf || null,
    source: talent.source || 'maximus-talent',
  };
}

/** One sentence for a pick's context. */
export function talentNote(t, name = (code) => code) {
  const top = t?.matchups?.[0];
  if (!top || top.size === 'even') return null;
  const side = top.edge > 0
    ? `${name(top.offenseTeam)}’s ${top.offense} against ${name(top.defenseTeam)}’s ${top.defense}`
    : `${name(top.defenseTeam)}’s ${top.defense} against ${name(top.offenseTeam)}’s ${top.offense}`;
  return `Roster talent: the biggest position-group edge is ${side} (${Math.abs(top.edge).toFixed(1)} points on our 100-point talent scale). Context only: it has not been tested against the line.`;
}
