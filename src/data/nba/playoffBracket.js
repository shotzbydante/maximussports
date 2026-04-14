/**
 * NBA Playoff Bracket — 2025-26 season.
 *
 * Hardcoded first-round matchups based on current standings/play-in results.
 * This file is the source of truth for the bracket structure.
 * Update as play-in results are finalized.
 */

import { getNbaEspnLogoUrl } from '../../utils/espnNbaLogos';

function team(seed, slug, name, shortName, record) {
  return {
    seed,
    slug,
    teamId: slug,
    name,
    shortName,
    record,
    logo: getNbaEspnLogoUrl(slug),
    isPlaceholder: false,
  };
}

function tbd(seed, label) {
  return {
    seed,
    slug: null,
    teamId: null,
    name: label || 'TBD',
    shortName: label || 'TBD',
    record: null,
    logo: null,
    isPlaceholder: true,
  };
}

/**
 * 2026 NBA Playoff Bracket — first round matchups.
 * Based on final standings + play-in results.
 * Update TBD entries as play-in games resolve.
 */
export const NBA_PLAYOFF_BRACKET = {
  year: 2026,
  status: 'in_progress', // 'projected' | 'play_in' | 'in_progress' | 'complete'
  lastUpdated: new Date().toISOString(),

  western: {
    name: 'Western',
    matchups: [
      // R1: 1 vs 8
      {
        matchupId: 'r1-west-0',
        round: 1,
        conference: 'Western',
        position: 0,
        topTeam: team(1, 'okc', 'Oklahoma City Thunder', 'Thunder', '64-17'),
        bottomTeam: tbd(8, 'TBD'),
        seriesScore: { top: 0, bottom: 0 },
        status: 'upcoming',
        winner: null,
        network: 'ABC',
        startDate: 'Apr 19',
      },
      // R1: 4 vs 5
      {
        matchupId: 'r1-west-1',
        round: 1,
        conference: 'Western',
        position: 1,
        topTeam: team(4, 'lal', 'Los Angeles Lakers', 'Lakers', '52-29'),
        bottomTeam: team(5, 'hou', 'Houston Rockets', 'Rockets', '52-30'),
        seriesScore: { top: 0, bottom: 0 },
        status: 'upcoming',
        winner: null,
        network: 'ABC',
        startDate: 'Apr 18',
        spread: 'HOU -5.5',
      },
      // R1: 3 vs 6
      {
        matchupId: 'r1-west-2',
        round: 1,
        conference: 'Western',
        position: 2,
        topTeam: team(3, 'den', 'Denver Nuggets', 'Nuggets', '53-28'),
        bottomTeam: team(6, 'min', 'Minnesota Timberwolves', 'Timberwolves', '48-33'),
        seriesScore: { top: 0, bottom: 0 },
        status: 'upcoming',
        winner: null,
        network: 'Prime Video',
        startDate: 'Apr 18',
        spread: 'DEN -6.5',
      },
      // R1: 2 vs 7
      {
        matchupId: 'r1-west-3',
        round: 1,
        conference: 'Western',
        position: 3,
        topTeam: team(2, 'sas', 'San Antonio Spurs', 'Spurs', '62-19'),
        bottomTeam: tbd(7, 'Suns/Trail Blazers'),
        seriesScore: { top: 0, bottom: 0 },
        status: 'upcoming',
        winner: null,
        network: 'NBC/Peacock',
        startDate: 'Apr 19',
      },
    ],
  },

  eastern: {
    name: 'Eastern',
    matchups: [
      // R1: 1 vs 8
      {
        matchupId: 'r1-east-0',
        round: 1,
        conference: 'Eastern',
        position: 0,
        topTeam: team(1, 'det', 'Detroit Pistons', 'Pistons', '59-22'),
        bottomTeam: tbd(8, 'TBD'),
        seriesScore: { top: 0, bottom: 0 },
        status: 'upcoming',
        winner: null,
        network: 'NBC/Peacock',
        startDate: 'Apr 19',
      },
      // R1: 4 vs 5
      {
        matchupId: 'r1-east-1',
        round: 1,
        conference: 'Eastern',
        position: 1,
        topTeam: team(4, 'cle', 'Cleveland Cavaliers', 'Cavaliers', '51-30'),
        bottomTeam: team(5, 'tor', 'Toronto Raptors', 'Raptors', '49-33'),
        seriesScore: { top: 0, bottom: 0 },
        status: 'upcoming',
        winner: null,
        network: 'Prime Video',
        startDate: 'Apr 18',
        spread: 'CLE -7.5',
      },
      // R1: 3 vs 6
      {
        matchupId: 'r1-east-2',
        round: 1,
        conference: 'Eastern',
        position: 2,
        topTeam: team(3, 'nyk', 'New York Knicks', 'Knicks', '53-28'),
        bottomTeam: team(6, 'atl', 'Atlanta Hawks', 'Hawks', '46-35'),
        seriesScore: { top: 0, bottom: 0 },
        status: 'upcoming',
        winner: null,
        network: 'Prime Video',
        startDate: 'Apr 18',
        spread: 'NY -4.5',
      },
      // R1: 2 vs 7
      {
        matchupId: 'r1-east-3',
        round: 1,
        conference: 'Eastern',
        position: 3,
        topTeam: team(2, 'bos', 'Boston Celtics', 'Celtics', '55-26'),
        bottomTeam: tbd(7, '76ers/Magic'),
        seriesScore: { top: 0, bottom: 0 },
        status: 'upcoming',
        winner: null,
        network: 'ABC',
        startDate: 'Apr 19',
      },
    ],
  },
};

/**
 * Build the full bracket structure with placeholder later-round matchups.
 * Returns a flat map of all matchup IDs → matchup objects.
 */
export function buildFullNbaBracket(bracket = NBA_PLAYOFF_BRACKET) {
  const all = {};

  // R1 matchups
  for (const conf of [bracket.western, bracket.eastern]) {
    for (const m of conf.matchups) {
      all[m.matchupId] = { ...m };
    }
  }

  // R2: Conference Semifinals (winners of R1 meet)
  // West: winner of r1-west-0 vs winner of r1-west-1, winner of r1-west-2 vs winner of r1-west-3
  // East: same pattern
  for (const confKey of ['west', 'east']) {
    const conf = confKey === 'west' ? 'Western' : 'Eastern';
    for (let i = 0; i < 2; i++) {
      const topSource = `r1-${confKey}-${i * 2}`;
      const bottomSource = `r1-${confKey}-${i * 2 + 1}`;
      const id = `r2-${confKey}-${i}`;
      all[id] = {
        matchupId: id,
        round: 2,
        conference: conf,
        position: i,
        topTeam: tbd(null, 'TBD'),
        bottomTeam: tbd(null, 'TBD'),
        topSourceId: topSource,
        bottomSourceId: bottomSource,
        seriesScore: { top: 0, bottom: 0 },
        status: 'waiting',
        winner: null,
      };
    }
  }

  // R3: Conference Finals
  for (const confKey of ['west', 'east']) {
    const conf = confKey === 'west' ? 'Western' : 'Eastern';
    const id = `r3-${confKey}`;
    all[id] = {
      matchupId: id,
      round: 3,
      conference: conf,
      position: 0,
      topTeam: tbd(null, 'TBD'),
      bottomTeam: tbd(null, 'TBD'),
      topSourceId: `r2-${confKey}-0`,
      bottomSourceId: `r2-${confKey}-1`,
      seriesScore: { top: 0, bottom: 0 },
      status: 'waiting',
      winner: null,
    };
  }

  // NBA Finals
  all['finals'] = {
    matchupId: 'finals',
    round: 4,
    conference: null,
    position: 0,
    topTeam: tbd(null, 'TBD'),
    bottomTeam: tbd(null, 'TBD'),
    topSourceId: 'r3-west',
    bottomSourceId: 'r3-east',
    seriesScore: { top: 0, bottom: 0 },
    status: 'waiting',
    winner: null,
    label: 'NBA Finals',
  };

  return all;
}

/**
 * Apply user picks to the bracket — propagate winners to later rounds.
 */
export function applyPicksToBracket(allMatchups, picks) {
  const result = {};
  for (const [id, m] of Object.entries(allMatchups)) {
    result[id] = { ...m };
  }

  // Propagate picks through rounds
  for (const [matchupId, position] of Object.entries(picks)) {
    const m = result[matchupId];
    if (!m) continue;
    const winner = position === 'top' ? m.topTeam : m.bottomTeam;
    if (!winner || winner.isPlaceholder) continue;

    // Find downstream matchup that sources from this one
    for (const [downId, down] of Object.entries(result)) {
      if (down.topSourceId === matchupId) {
        result[downId] = { ...result[downId], topTeam: winner, status: result[downId].bottomTeam?.isPlaceholder === false ? 'ready' : 'waiting' };
      }
      if (down.bottomSourceId === matchupId) {
        result[downId] = { ...result[downId], bottomTeam: winner, status: result[downId].topTeam?.isPlaceholder === false ? 'ready' : 'waiting' };
      }
    }
  }

  // Update status for matchups where both teams are resolved
  for (const [id, m] of Object.entries(result)) {
    if (m.topTeam && !m.topTeam.isPlaceholder && m.bottomTeam && !m.bottomTeam.isPlaceholder) {
      if (result[id].status === 'waiting') result[id].status = 'ready';
    }
  }

  return result;
}
