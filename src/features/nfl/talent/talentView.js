/**
 * Roster talent, shaped for the team and game pages.
 *
 * Two stored rows feed this (see api/_lib/nflTalent.js):
 *   - unit grades per team, the same row the picks engine reads
 *   - position-group grades and each team's counted starters
 *
 * A player's Maximus score blends his Madden overall, his rank on PFF's
 * position list and his 2026 production. A group grade is the average
 * score of the starters counted for that group; a unit blends groups.
 * Nothing here moves a fair price: it is context beside the picks.
 */

export const TALENT_GROUPS = Object.freeze(['QB', 'RB', 'WR', 'TE', 'OT', 'IOL', 'EDGE', 'IDL', 'LB', 'CB', 'S']);

export const GROUP_LABELS = Object.freeze({
  QB: 'Quarterback', RB: 'Running back', WR: 'Wide receiver', TE: 'Tight end',
  OT: 'Tackle', IOL: 'Interior line', EDGE: 'Edge rusher', IDL: 'Interior D-line',
  LB: 'Linebacker', CB: 'Cornerback', S: 'Safety',
});

export const OFFENSE_GROUPS = Object.freeze(['QB', 'RB', 'WR', 'TE', 'OT', 'IOL']);
export const DEFENSE_GROUPS = Object.freeze(['EDGE', 'IDL', 'LB', 'CB', 'S']);

/** The position groups whose starters make up each unit. */
export const UNIT_GROUPS = Object.freeze({
  QB: ['QB'],
  'Pass protection': ['OT', 'IOL'],
  Receivers: ['WR', 'TE'],
  'Run game': ['RB', 'OT', 'IOL'],
  'Pass rush': ['EDGE', 'IDL'],
  Coverage: ['CB', 'S'],
  'Run defense': ['IDL', 'LB'],
  'Pass defense': ['EDGE', 'IDL', 'CB', 'S'],
});

export const UNIT_LABELS = Object.freeze({
  QB: 'Quarterback', 'Pass protection': 'Pass protection', Receivers: 'Receivers', 'Run game': 'Run game',
  'Pass rush': 'Pass rush', Coverage: 'Coverage', 'Run defense': 'Run defense', 'Pass defense': 'Pass defense',
});

export const OFFENSE_UNITS = Object.freeze(['QB', 'Pass protection', 'Receivers', 'Run game']);
export const DEFENSE_UNITS = Object.freeze(['Pass rush', 'Coverage', 'Run defense', 'Pass defense']);

export const TALENT_WEIGHTS = Object.freeze({ madden: 0.5, pff: 0.3, production: 0.2 });

export function tierOf(score) {
  if (typeof score !== 'number') return null;
  if (score >= 90) return 'Elite';
  if (score >= 80) return 'Good';
  if (score >= 70) return 'Average';
  return 'Below average';
}

export function ordinal(n) {
  if (!Number.isFinite(n)) return '';
  const sfx = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (sfx[(v - 20) % 10] || sfx[v] || sfx[0]);
}

const num = (v) => (v === '' || v == null ? null : Number(v));

/** "group|pos|name|madden|pffRank|production|score|groupRank|xFactor;…" → players. */
export function decodePlayers(str) {
  if (typeof str !== 'string' || !str) return [];
  return str.split(';').map((row) => {
    const [group, pos, name, madden, pffRank, production, score, groupRank, xf] = row.split('|');
    const s = num(score);
    return {
      group, pos: pos || group, name,
      madden: num(madden), pffRank: num(pffRank), production: num(production),
      score: s, groupRank: num(groupRank), xFactor: xf === '1', tier: tierOf(s),
    };
  }).filter((p) => p.name && p.group);
}

/** Rank a set of teams on one number, best first. Ties share the better rank. */
function rankBy(teams, read) {
  const vals = Object.entries(teams).map(([k, t]) => [k, read(t)]).filter(([, v]) => typeof v === 'number');
  const sorted = vals.map(([, v]) => v).sort((a, b) => b - a);
  return Object.fromEntries(vals.map(([k, v]) => [k, sorted.indexOf(v) + 1]));
}

const mean = (xs) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

/**
 * Merge the two stored rows into one league view keyed by team abbreviation.
 * Returns null when either row is missing or too thin to rank.
 */
export function buildTalentLeague({ detail, units }) {
  if (!detail?.teams || !units?.teams) return null;
  const groups = Array.isArray(detail.groups) && detail.groups.length ? detail.groups : TALENT_GROUPS;
  const keys = Object.keys(detail.teams).filter((k) => units.teams[k]);
  if (keys.length < 8) return null;

  const raw = {};
  for (const k of keys) {
    const d = detail.teams[k];
    const u = units.teams[k];
    raw[k] = {
      abbrev: k,
      overall: u['Overall talent'] ?? null,
      offense: d.o ?? null,
      defense: d.d ?? null,
      groups: Object.fromEntries(groups.map((g, i) => [g, d.g?.[i] ?? null])),
      units: Object.fromEntries(Object.keys(UNIT_GROUPS).map((name) => [name, u[name] ?? null])),
      players: decodePlayers(d.p),
    };
  }

  const ranks = {
    overall: rankBy(raw, (t) => t.overall),
    offense: rankBy(raw, (t) => t.offense),
    defense: rankBy(raw, (t) => t.defense),
  };
  const groupRanks = Object.fromEntries(groups.map((g) => [g, rankBy(raw, (t) => t.groups[g])]));
  const unitRanks = Object.fromEntries(Object.keys(UNIT_GROUPS).map((u) => [u, rankBy(raw, (t) => t.units[u])]));
  const averages = {
    groups: Object.fromEntries(groups.map((g) => [g, mean(keys.map((k) => raw[k].groups[g]).filter((v) => typeof v === 'number'))])),
    units: Object.fromEntries(Object.keys(UNIT_GROUPS).map((u) => [u, mean(keys.map((k) => raw[k].units[u]).filter((v) => typeof v === 'number'))])),
    overall: mean(keys.map((k) => raw[k].overall).filter((v) => typeof v === 'number')),
  };

  const teams = {};
  for (const k of keys) {
    const t = raw[k];
    const groupRows = groups.map((g) => ({
      group: g, label: GROUP_LABELS[g] || g, grade: t.groups[g], rank: groupRanks[g][k] ?? null,
      average: averages.groups[g],
      side: OFFENSE_GROUPS.includes(g) ? 'offense' : 'defense',
    }));
    const byRank = groupRows.filter((r) => r.rank != null).sort((a, b) => a.rank - b.rank || b.grade - a.grade);
    teams[k] = {
      abbrev: k,
      overall: { grade: t.overall, rank: ranks.overall[k] ?? null },
      offense: { grade: t.offense, rank: ranks.offense[k] ?? null },
      defense: { grade: t.defense, rank: ranks.defense[k] ?? null },
      groups: groupRows,
      units: Object.keys(UNIT_GROUPS).map((u) => ({
        unit: u, label: UNIT_LABELS[u], grade: t.units[u], rank: unitRanks[u][k] ?? null, average: averages.units[u],
        side: OFFENSE_UNITS.includes(u) ? 'offense' : 'defense',
      })),
      strengths: byRank.slice(0, 3).map((r) => ({ group: r.group, label: r.label, rank: r.rank, grade: r.grade })),
      weaknesses: byRank.slice(-3).reverse().map((r) => ({ group: r.group, label: r.label, rank: r.rank, grade: r.grade })),
      players: t.players,
    };
  }

  return {
    asOf: detail.asOf || units.asOf || null,
    week: detail.week ?? null,
    teamCount: keys.length,
    weights: TALENT_WEIGHTS,
    averages,
    teams,
  };
}

/** The counted starters behind one unit, best first. */
export function unitPlayers(team, unit) {
  const groups = UNIT_GROUPS[unit] || [];
  return (team?.players || [])
    .filter((p) => groups.includes(p.group))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}

/** One plain sentence on where a roster is strong and weak. */
export function talentSentence(team, name) {
  if (!team?.overall?.rank) return '';
  const list = (rows) => rows.map((r) => `${r.label.toLowerCase()} (${ordinal(r.rank)})`).join(', ');
  return `${name} rank ${ordinal(team.overall.rank)} of 32 in roster talent: ${ordinal(team.offense.rank)} on offense, ${ordinal(team.defense.rank)} on defense. `
    + `Strongest at ${list(team.strengths)}. Thinnest at ${list(team.weaknesses)}.`;
}
