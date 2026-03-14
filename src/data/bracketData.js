/**
 * Bracket data layer — fetches, normalizes, and manages NCAA tournament
 * bracket structure. Handles pre-Selection Sunday empty state gracefully.
 *
 * Data model:
 *   bracket.regions[].matchups[] — round-of-64 matchups with seeds + teams
 *   bracket.status — 'pre_selection' | 'field_set' | 'in_progress' | 'complete'
 *   bracket.year — tournament year
 */

import { REGIONS, SEED_MATCHUP_ORDER, TOURNAMENT_YEAR } from '../config/bracketology';

/**
 * Generate a blank bracket shell for pre-Selection Sunday state.
 * Each region has 8 first-round matchups following standard seeding.
 */
export function generateBlankBracket() {
  const regions = REGIONS.map((regionName) => {
    const matchups = SEED_MATCHUP_ORDER.map(([topSeed, bottomSeed], idx) => ({
      matchupId: `r1-${regionName.toLowerCase()}-${idx}`,
      round: 1,
      region: regionName,
      position: idx,
      topTeam: buildPlaceholderTeam(topSeed, regionName),
      bottomTeam: buildPlaceholderTeam(bottomSeed, regionName),
      winner: null,
      status: 'pending',
    }));
    return { name: regionName, matchups };
  });

  return {
    year: TOURNAMENT_YEAR,
    status: 'pre_selection',
    regions,
    finalFour: [
      { matchupId: 'ff-1', round: 5, topTeam: null, bottomTeam: null, winner: null, status: 'pending', regionMatchup: `${REGIONS[0]} vs ${REGIONS[1]}` },
      { matchupId: 'ff-2', round: 5, topTeam: null, bottomTeam: null, winner: null, status: 'pending', regionMatchup: `${REGIONS[2]} vs ${REGIONS[3]}` },
    ],
    championship: {
      matchupId: 'champ', round: 6, topTeam: null, bottomTeam: null, winner: null, status: 'pending',
    },
    lastUpdated: new Date().toISOString(),
  };
}

function buildPlaceholderTeam(seed, region) {
  return {
    teamId: null,
    name: null,
    shortName: null,
    slug: null,
    seed,
    logo: null,
    record: null,
    region,
    isPlaceholder: true,
  };
}

/**
 * Fetch bracket data from the API. Falls back to blank bracket if
 * data isn't available yet (pre-Selection Sunday).
 */
export async function fetchBracketData() {
  try {
    const res = await fetch('/api/bracketology/data');
    if (!res.ok) return generateBlankBracket();
    const data = await res.json();
    if (data?.bracket) return data.bracket;
    return generateBlankBracket();
  } catch {
    return generateBlankBracket();
  }
}

/**
 * Build the full bracket structure from round-of-64 through championship
 * using user selections. Returns all rounds as a flat list of matchups.
 */
export function buildFullBracket(regions, userPicks = {}) {
  const allMatchups = {};

  for (const region of regions) {
    for (const m of region.matchups) {
      allMatchups[m.matchupId] = { ...m };
    }

    for (let round = 2; round <= 4; round++) {
      const prevRound = round - 1;
      const prevMatchups = Object.values(allMatchups)
        .filter(m => m.round === prevRound && m.region === region.name)
        .sort((a, b) => a.position - b.position);

      for (let i = 0; i < prevMatchups.length; i += 2) {
        const pos = Math.floor(i / 2);
        const matchupId = `r${round}-${region.name.toLowerCase()}-${pos}`;
        const topSource = prevMatchups[i];
        const bottomSource = prevMatchups[i + 1];

        const topTeam = topSource ? getWinnerTeam(topSource, userPicks) : null;
        const bottomTeam = bottomSource ? getWinnerTeam(bottomSource, userPicks) : null;

        allMatchups[matchupId] = {
          matchupId,
          round,
          region: region.name,
          position: pos,
          topTeam,
          bottomTeam,
          topSourceId: topSource?.matchupId,
          bottomSourceId: bottomSource?.matchupId,
          winner: userPicks[matchupId] || null,
          status: topTeam && bottomTeam ? 'ready' : 'waiting',
        };
      }
    }
  }

  const regionWinners = REGIONS.map(regionName => {
    const eliteEight = Object.values(allMatchups)
      .find(m => m.round === 4 && m.region === regionName);
    return eliteEight ? getWinnerTeam(eliteEight, userPicks) : null;
  });

  const ff1Id = 'ff-1';
  const ff2Id = 'ff-2';
  allMatchups[ff1Id] = {
    matchupId: ff1Id, round: 5,
    topTeam: regionWinners[0], bottomTeam: regionWinners[1],
    winner: userPicks[ff1Id] || null,
    status: regionWinners[0] && regionWinners[1] ? 'ready' : 'waiting',
    regionMatchup: `${REGIONS[0]} vs ${REGIONS[1]}`,
  };
  allMatchups[ff2Id] = {
    matchupId: ff2Id, round: 5,
    topTeam: regionWinners[2], bottomTeam: regionWinners[3],
    winner: userPicks[ff2Id] || null,
    status: regionWinners[2] && regionWinners[3] ? 'ready' : 'waiting',
    regionMatchup: `${REGIONS[2]} vs ${REGIONS[3]}`,
  };

  const champTeamTop = allMatchups[ff1Id].winner
    ? getTeamByPickId(allMatchups[ff1Id], userPicks[ff1Id])
    : null;
  const champTeamBottom = allMatchups[ff2Id].winner
    ? getTeamByPickId(allMatchups[ff2Id], userPicks[ff2Id])
    : null;

  allMatchups['champ'] = {
    matchupId: 'champ', round: 6,
    topTeam: champTeamTop, bottomTeam: champTeamBottom,
    winner: userPicks['champ'] || null,
    status: champTeamTop && champTeamBottom ? 'ready' : 'waiting',
  };

  return allMatchups;
}

function getWinnerTeam(matchup, userPicks) {
  const pickId = userPicks[matchup.matchupId];
  if (!pickId) return null;
  return getTeamByPickId(matchup, pickId);
}

function getTeamByPickId(matchup, pickId) {
  if (!pickId) return null;
  if (pickId === 'top' || pickId === matchup.topTeam?.teamId || pickId === matchup.topTeam?.slug) {
    return matchup.topTeam;
  }
  if (pickId === 'bottom' || pickId === matchup.bottomTeam?.teamId || pickId === matchup.bottomTeam?.slug) {
    return matchup.bottomTeam;
  }
  return null;
}

/**
 * When a user changes an earlier-round pick, find and clear all
 * downstream picks that depended on the old winner.
 */
export function cascadeClearDownstream(matchupId, allMatchups, userPicks) {
  const cleared = { ...userPicks };
  const queue = [matchupId];
  const visited = new Set();

  while (queue.length > 0) {
    const current = queue.shift();
    if (visited.has(current)) continue;
    visited.add(current);

    for (const m of Object.values(allMatchups)) {
      if (m.topSourceId === current || m.bottomSourceId === current) {
        delete cleared[m.matchupId];
        queue.push(m.matchupId);
      }
    }
  }

  if (matchupId.startsWith('r4-')) {
    delete cleared['ff-1'];
    delete cleared['ff-2'];
    delete cleared['champ'];
  }
  if (matchupId.startsWith('ff-')) {
    delete cleared['champ'];
  }

  return cleared;
}
