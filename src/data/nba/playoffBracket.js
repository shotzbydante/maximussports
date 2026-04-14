/**
 * NBA Playoff Bracket — 2025-26 season.
 *
 * Hardcoded first-round matchups based on current standings/play-in results.
 * This file is the source of truth for the bracket structure.
 */

import { getNbaEspnLogoUrl } from '../../utils/espnNbaLogos';

function team(seed, slug, name, shortName, record) {
  return { seed, slug, teamId: slug, name, shortName, record, logo: getNbaEspnLogoUrl(slug), isPlaceholder: false };
}

function tbd(seed, label) {
  return { seed, slug: null, teamId: null, name: label || 'TBD', shortName: label || 'TBD', record: null, logo: null, isPlaceholder: true };
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
      { matchupId: 'r1-west-0', round: 1, conference: 'Western', position: 0, topTeam: team(1, 'okc', 'Oklahoma City Thunder', 'Thunder', '64-17'), bottomTeam: tbd(8, 'TBD'), seriesScore: { top: 0, bottom: 0 }, status: 'upcoming', winner: null, network: 'ABC', startDate: 'Apr 19' },
      { matchupId: 'r1-west-1', round: 1, conference: 'Western', position: 1, topTeam: team(4, 'lal', 'Los Angeles Lakers', 'Lakers', '52-29'), bottomTeam: team(5, 'hou', 'Houston Rockets', 'Rockets', '52-30'), seriesScore: { top: 0, bottom: 0 }, status: 'upcoming', winner: null, network: 'ABC', startDate: 'Apr 18', spread: 'HOU -5.5' },
      { matchupId: 'r1-west-2', round: 1, conference: 'Western', position: 2, topTeam: team(3, 'den', 'Denver Nuggets', 'Nuggets', '53-28'), bottomTeam: team(6, 'min', 'Minnesota Timberwolves', 'Timberwolves', '48-33'), seriesScore: { top: 0, bottom: 0 }, status: 'upcoming', winner: null, network: 'Prime Video', startDate: 'Apr 18', spread: 'DEN -6.5' },
      { matchupId: 'r1-west-3', round: 1, conference: 'Western', position: 3, topTeam: team(2, 'sas', 'San Antonio Spurs', 'Spurs', '62-19'), bottomTeam: tbd(7, 'Suns/Blazers'), seriesScore: { top: 0, bottom: 0 }, status: 'upcoming', winner: null, network: 'NBC/Peacock', startDate: 'Apr 19' },
    ],
  },

  eastern: {
    name: 'Eastern',
    matchups: [
      { matchupId: 'r1-east-0', round: 1, conference: 'Eastern', position: 0, topTeam: team(1, 'det', 'Detroit Pistons', 'Pistons', '59-22'), bottomTeam: tbd(8, 'TBD'), seriesScore: { top: 0, bottom: 0 }, status: 'upcoming', winner: null, network: 'NBC/Peacock', startDate: 'Apr 19' },
      { matchupId: 'r1-east-1', round: 1, conference: 'Eastern', position: 1, topTeam: team(4, 'cle', 'Cleveland Cavaliers', 'Cavaliers', '51-30'), bottomTeam: team(5, 'tor', 'Toronto Raptors', 'Raptors', '49-33'), seriesScore: { top: 0, bottom: 0 }, status: 'upcoming', winner: null, network: 'Prime Video', startDate: 'Apr 18', spread: 'CLE -7.5' },
      { matchupId: 'r1-east-2', round: 1, conference: 'Eastern', position: 2, topTeam: team(3, 'nyk', 'New York Knicks', 'Knicks', '53-28'), bottomTeam: team(6, 'atl', 'Atlanta Hawks', 'Hawks', '46-35'), seriesScore: { top: 0, bottom: 0 }, status: 'upcoming', winner: null, network: 'Prime Video', startDate: 'Apr 18', spread: 'NY -4.5' },
      { matchupId: 'r1-east-3', round: 1, conference: 'Eastern', position: 3, topTeam: team(2, 'bos', 'Boston Celtics', 'Celtics', '55-26'), bottomTeam: tbd(7, '76ers/Magic'), seriesScore: { top: 0, bottom: 0 }, status: 'upcoming', winner: null, network: 'ABC', startDate: 'Apr 19' },
    ],
  },
};

/** Scaffold: all matchup IDs and their source dependencies. */
const BRACKET_SCAFFOLD = [
  // R1 — no sources, populated from static data
  // R2 — sources from R1
  { id: 'r2-west-0', round: 2, conf: 'Western', pos: 0, topSrc: 'r1-west-0', btmSrc: 'r1-west-1' },
  { id: 'r2-west-1', round: 2, conf: 'Western', pos: 1, topSrc: 'r1-west-2', btmSrc: 'r1-west-3' },
  { id: 'r2-east-0', round: 2, conf: 'Eastern', pos: 0, topSrc: 'r1-east-0', btmSrc: 'r1-east-1' },
  { id: 'r2-east-1', round: 2, conf: 'Eastern', pos: 1, topSrc: 'r1-east-2', btmSrc: 'r1-east-3' },
  // R3 — sources from R2
  { id: 'r3-west', round: 3, conf: 'Western', pos: 0, topSrc: 'r2-west-0', btmSrc: 'r2-west-1' },
  { id: 'r3-east', round: 3, conf: 'Eastern', pos: 0, topSrc: 'r2-east-0', btmSrc: 'r2-east-1' },
  // Finals
  { id: 'finals', round: 4, conf: null, pos: 0, topSrc: 'r3-west', btmSrc: 'r3-east' },
];

/**
 * Build the full bracket.
 * Returns a flat map of matchupId → matchup object.
 */
export function buildFullNbaBracket(bracket = NBA_PLAYOFF_BRACKET) {
  const all = {};

  // R1 matchups from static data
  for (const conf of [bracket.western, bracket.eastern]) {
    for (const m of conf.matchups) {
      all[m.matchupId] = { ...m };
    }
  }

  // Later rounds from scaffold
  for (const s of BRACKET_SCAFFOLD) {
    all[s.id] = {
      matchupId: s.id,
      round: s.round,
      conference: s.conf,
      position: s.pos,
      topTeam: tbd(null, 'TBD'),
      bottomTeam: tbd(null, 'TBD'),
      topSourceId: s.topSrc,
      bottomSourceId: s.btmSrc,
      seriesScore: { top: 0, bottom: 0 },
      status: 'waiting',
      winner: null,
    };
  }

  return all;
}

/**
 * Apply user picks to the bracket — propagate winners round by round.
 * Processes in round order to guarantee upstream teams are placed before downstream.
 */
export function applyPicksToBracket(rawBracket, picks) {
  const result = {};
  for (const [id, m] of Object.entries(rawBracket)) {
    result[id] = { ...m };
  }

  // Process round by round (1→4) to guarantee correct propagation
  const sorted = Object.entries(picks).sort(([a], [b]) => {
    const rA = result[a]?.round ?? 99;
    const rB = result[b]?.round ?? 99;
    return rA - rB;
  });

  for (const [matchupId, position] of sorted) {
    const m = result[matchupId];
    if (!m) continue;
    const winner = position === 'top' ? m.topTeam : m.bottomTeam;
    if (!winner || winner.isPlaceholder) continue;

    // Propagate winner into downstream matchups
    for (const [downId, down] of Object.entries(result)) {
      if (down.topSourceId === matchupId) {
        result[downId] = { ...result[downId], topTeam: winner };
      }
      if (down.bottomSourceId === matchupId) {
        result[downId] = { ...result[downId], bottomTeam: winner };
      }
    }
  }

  // Update statuses
  for (const [id, m] of Object.entries(result)) {
    const hasTop = m.topTeam && !m.topTeam.isPlaceholder;
    const hasBtm = m.bottomTeam && !m.bottomTeam.isPlaceholder;
    if (hasTop && hasBtm && m.status === 'waiting') {
      result[id] = { ...result[id], status: 'ready' };
    }
  }

  return result;
}
