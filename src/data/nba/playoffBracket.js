/**
 * NBA Playoff Bracket — 2025-26 season.
 *
 * Includes play-in tournament teams and first-round matchups.
 * Play-in seeds are resolved probabilistically before R1 simulation.
 */

import { getNbaEspnLogoUrl } from '../../utils/espnNbaLogos';

function team(seed, slug, name, shortName, record) {
  return { seed, slug, teamId: slug, name, shortName, record, logo: getNbaEspnLogoUrl(slug), isPlaceholder: false };
}

function tbd(seed, label) {
  return { seed, slug: null, teamId: null, name: label || 'TBD', shortName: label || 'TBD', record: null, logo: null, isPlaceholder: true };
}

/**
 * Play-In Tournament teams — used to resolve 7/8 seeds.
 * Structure: { 7seed, 8seed, 9seed, 10seed } per conference.
 */
export const PLAY_IN_TEAMS = {
  western: {
    seed7: team(7, 'phx', 'Phoenix Suns', 'Suns', '44-37'),
    seed8: team(8, 'por', 'Portland Trail Blazers', 'Blazers', '41-40'),
    seed9: team(9, 'lac', 'LA Clippers', 'Clippers', '41-40'),
    seed10: team(10, 'gsw', 'Golden State Warriors', 'Warriors', '37-44'),
  },
  eastern: {
    seed7: team(7, 'phi', 'Philadelphia 76ers', '76ers', '44-37'),
    seed8: team(8, 'mia', 'Miami Heat', 'Heat', '43-38'),
    seed9: team(9, 'orl', 'Orlando Magic', 'Magic', '41-40'),
    seed10: team(10, 'ind', 'Indiana Pacers', 'Pacers', '40-41'),
  },
};

/**
 * Resolve play-in seeds for a conference probabilistically.
 * Play-in structure:
 *   Game 1: 7 vs 8 → winner is 7-seed
 *   Game 2: 9 vs 10 → loser eliminated
 *   Game 3: loser of G1 vs winner of G2 → winner is 8-seed
 *
 * Returns { seed7: teamObj, seed8: teamObj }
 */
export function resolvePlayIn(conference, context = {}) {
  const pi = PLAY_IN_TEAMS[conference];
  if (!pi) return { seed7: tbd(7, 'TBD'), seed8: tbd(8, 'TBD') };

  // Simple model: better record = higher win probability
  function winProb(a, b) {
    const pctA = parseRecordPct(a.record);
    const pctB = parseRecordPct(b.record);
    if (pctA == null || pctB == null) return 0.5;
    const combined = pctA + pctB;
    return combined > 0 ? Math.max(0.35, Math.min(0.65, pctA / combined)) : 0.5;
  }

  function playSingleGame(a, b) {
    const p = winProb(a, b);
    return Math.random() < p ? a : b;
  }

  // Game 1: 7 vs 8
  const g1Winner = playSingleGame(pi.seed7, pi.seed8);
  const g1Loser = g1Winner === pi.seed7 ? pi.seed8 : pi.seed7;

  // Game 2: 9 vs 10
  const g2Winner = playSingleGame(pi.seed9, pi.seed10);

  // Game 3: loser of G1 vs winner of G2
  const g3Winner = playSingleGame(g1Loser, g2Winner);

  // Assign seeds
  const resolved7 = { ...g1Winner, seed: 7 };
  const resolved8 = { ...g3Winner, seed: 8 };

  return { seed7: resolved7, seed8: resolved8 };
}

function parseRecordPct(record) {
  if (!record) return null;
  const parts = record.split('-').map(Number);
  if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return null;
  const total = parts[0] + parts[1];
  return total > 0 ? parts[0] / total : null;
}

/**
 * Apply play-in results to the bracket, filling TBD slots.
 */
export function applyPlayInToBracket(bracket, playInResults) {
  const result = {};
  for (const [id, m] of Object.entries(bracket)) {
    result[id] = { ...m };
  }

  // West: r1-west-0 bottom = 8-seed, r1-west-3 bottom = 7-seed
  if (playInResults.western) {
    if (result['r1-west-0']?.bottomTeam?.isPlaceholder) {
      result['r1-west-0'] = { ...result['r1-west-0'], bottomTeam: playInResults.western.seed8, status: 'upcoming' };
    }
    if (result['r1-west-3']?.bottomTeam?.isPlaceholder) {
      result['r1-west-3'] = { ...result['r1-west-3'], bottomTeam: playInResults.western.seed7, status: 'upcoming' };
    }
  }

  // East: r1-east-0 bottom = 8-seed, r1-east-3 bottom = 7-seed
  if (playInResults.eastern) {
    if (result['r1-east-0']?.bottomTeam?.isPlaceholder) {
      result['r1-east-0'] = { ...result['r1-east-0'], bottomTeam: playInResults.eastern.seed8, status: 'upcoming' };
    }
    if (result['r1-east-3']?.bottomTeam?.isPlaceholder) {
      result['r1-east-3'] = { ...result['r1-east-3'], bottomTeam: playInResults.eastern.seed7, status: 'upcoming' };
    }
  }

  return result;
}

/**
 * 2026 NBA Playoff Bracket — first round matchups.
 */
export const NBA_PLAYOFF_BRACKET = {
  year: 2026,
  status: 'in_progress',
  lastUpdated: new Date().toISOString(),

  western: {
    name: 'Western',
    matchups: [
      { matchupId: 'r1-west-0', round: 1, conference: 'Western', position: 0, topTeam: team(1, 'okc', 'Oklahoma City Thunder', 'Thunder', '64-17'), bottomTeam: tbd(8, 'Play-In Winner'), seriesScore: { top: 0, bottom: 0 }, status: 'upcoming', winner: null, network: 'ABC', startDate: 'Apr 19' },
      { matchupId: 'r1-west-1', round: 1, conference: 'Western', position: 1, topTeam: team(4, 'lal', 'Los Angeles Lakers', 'Lakers', '52-29'), bottomTeam: team(5, 'hou', 'Houston Rockets', 'Rockets', '52-30'), seriesScore: { top: 0, bottom: 0 }, status: 'upcoming', winner: null, network: 'ABC', startDate: 'Apr 18', spread: 'HOU -5.5' },
      { matchupId: 'r1-west-2', round: 1, conference: 'Western', position: 2, topTeam: team(3, 'den', 'Denver Nuggets', 'Nuggets', '53-28'), bottomTeam: team(6, 'min', 'Minnesota Timberwolves', 'Timberwolves', '48-33'), seriesScore: { top: 0, bottom: 0 }, status: 'upcoming', winner: null, network: 'Prime Video', startDate: 'Apr 18', spread: 'DEN -6.5' },
      { matchupId: 'r1-west-3', round: 1, conference: 'Western', position: 3, topTeam: team(2, 'sas', 'San Antonio Spurs', 'Spurs', '62-19'), bottomTeam: tbd(7, 'Play-In Winner'), seriesScore: { top: 0, bottom: 0 }, status: 'upcoming', winner: null, network: 'NBC/Peacock', startDate: 'Apr 19' },
    ],
  },

  eastern: {
    name: 'Eastern',
    matchups: [
      { matchupId: 'r1-east-0', round: 1, conference: 'Eastern', position: 0, topTeam: team(1, 'det', 'Detroit Pistons', 'Pistons', '59-22'), bottomTeam: tbd(8, 'Play-In Winner'), seriesScore: { top: 0, bottom: 0 }, status: 'upcoming', winner: null, network: 'NBC/Peacock', startDate: 'Apr 19' },
      { matchupId: 'r1-east-1', round: 1, conference: 'Eastern', position: 1, topTeam: team(4, 'cle', 'Cleveland Cavaliers', 'Cavaliers', '51-30'), bottomTeam: team(5, 'tor', 'Toronto Raptors', 'Raptors', '49-33'), seriesScore: { top: 0, bottom: 0 }, status: 'upcoming', winner: null, network: 'Prime Video', startDate: 'Apr 18', spread: 'CLE -7.5' },
      { matchupId: 'r1-east-2', round: 1, conference: 'Eastern', position: 2, topTeam: team(3, 'nyk', 'New York Knicks', 'Knicks', '53-28'), bottomTeam: team(6, 'atl', 'Atlanta Hawks', 'Hawks', '46-35'), seriesScore: { top: 0, bottom: 0 }, status: 'upcoming', winner: null, network: 'Prime Video', startDate: 'Apr 18', spread: 'NY -4.5' },
      { matchupId: 'r1-east-3', round: 1, conference: 'Eastern', position: 3, topTeam: team(2, 'bos', 'Boston Celtics', 'Celtics', '55-26'), bottomTeam: tbd(7, 'Play-In Winner'), seriesScore: { top: 0, bottom: 0 }, status: 'upcoming', winner: null, network: 'ABC', startDate: 'Apr 19' },
    ],
  },
};

/** Scaffold for later rounds */
const BRACKET_SCAFFOLD = [
  { id: 'r2-west-0', round: 2, conf: 'Western', pos: 0, topSrc: 'r1-west-0', btmSrc: 'r1-west-1' },
  { id: 'r2-west-1', round: 2, conf: 'Western', pos: 1, topSrc: 'r1-west-2', btmSrc: 'r1-west-3' },
  { id: 'r2-east-0', round: 2, conf: 'Eastern', pos: 0, topSrc: 'r1-east-0', btmSrc: 'r1-east-1' },
  { id: 'r2-east-1', round: 2, conf: 'Eastern', pos: 1, topSrc: 'r1-east-2', btmSrc: 'r1-east-3' },
  { id: 'r3-west', round: 3, conf: 'Western', pos: 0, topSrc: 'r2-west-0', btmSrc: 'r2-west-1' },
  { id: 'r3-east', round: 3, conf: 'Eastern', pos: 0, topSrc: 'r2-east-0', btmSrc: 'r2-east-1' },
  { id: 'finals', round: 4, conf: null, pos: 0, topSrc: 'r3-west', btmSrc: 'r3-east' },
];

/** Build the full bracket. */
export function buildFullNbaBracket(bracket = NBA_PLAYOFF_BRACKET) {
  const all = {};
  for (const conf of [bracket.western, bracket.eastern]) {
    for (const m of conf.matchups) all[m.matchupId] = { ...m };
  }
  for (const s of BRACKET_SCAFFOLD) {
    all[s.id] = {
      matchupId: s.id, round: s.round, conference: s.conf, position: s.pos,
      topTeam: tbd(null, 'TBD'), bottomTeam: tbd(null, 'TBD'),
      topSourceId: s.topSrc, bottomSourceId: s.btmSrc,
      seriesScore: { top: 0, bottom: 0 }, status: 'waiting', winner: null,
    };
  }
  return all;
}

/** Apply picks, propagating winners round by round. */
export function applyPicksToBracket(rawBracket, picks) {
  const result = {};
  for (const [id, m] of Object.entries(rawBracket)) result[id] = { ...m };

  const sorted = Object.entries(picks).sort(([a], [b]) => {
    return (result[a]?.round ?? 99) - (result[b]?.round ?? 99);
  });

  for (const [matchupId, position] of sorted) {
    const m = result[matchupId];
    if (!m) continue;
    const winner = position === 'top' ? m.topTeam : m.bottomTeam;
    if (!winner || winner.isPlaceholder) continue;
    for (const [downId, down] of Object.entries(result)) {
      if (down.topSourceId === matchupId) result[downId] = { ...result[downId], topTeam: winner };
      if (down.bottomSourceId === matchupId) result[downId] = { ...result[downId], bottomTeam: winner };
    }
  }

  for (const [id, m] of Object.entries(result)) {
    const hasTop = m.topTeam && !m.topTeam.isPlaceholder;
    const hasBtm = m.bottomTeam && !m.bottomTeam.isPlaceholder;
    if (hasTop && hasBtm && m.status === 'waiting') result[id] = { ...result[id], status: 'ready' };
  }

  return result;
}

/**
 * Check if the bracket has unresolved play-in seeds.
 */
export function hasUnresolvedPlayIn(bracket) {
  const r1West0 = bracket['r1-west-0'];
  const r1West3 = bracket['r1-west-3'];
  const r1East0 = bracket['r1-east-0'];
  const r1East3 = bracket['r1-east-3'];
  return (
    r1West0?.bottomTeam?.isPlaceholder ||
    r1West3?.bottomTeam?.isPlaceholder ||
    r1East0?.bottomTeam?.isPlaceholder ||
    r1East3?.bottomTeam?.isPlaceholder
  );
}
