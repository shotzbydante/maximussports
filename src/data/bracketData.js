/**
 * Bracket data layer — fetches, normalizes, and manages NCAA tournament
 * bracket structure. Supports two modes:
 *
 *   1. PROJECTED — pre-Selection Sunday, uses projected 64-team field
 *   2. OFFICIAL  — post-Selection Sunday, uses live ESPN bracket data
 *
 * Auto-switches from projected to official when ESPN data is detected.
 *
 * Data model:
 *   bracket.regions[].matchups[] — round-of-64 matchups with seeds + teams
 *   bracket.status — 'projected' | 'field_set' | 'in_progress' | 'complete'
 *   bracket.bracketMode — 'projected' | 'official'
 *   bracket.year — tournament year
 */

import { REGIONS, SEED_MATCHUP_ORDER, TOURNAMENT_YEAR, FINAL_FOUR_MATCHUPS } from '../config/bracketology';
import { generateProjectedBracket } from './projectedField';

/**
 * Fetch bracket data. Tries official ESPN data first.
 * Falls back to projected bracket if official data unavailable.
 *
 * Switchover logic:
 * - If /api/bracketology/data returns bracket with status !== 'pre_selection',
 *   that means official ESPN tournament data is available → use it.
 * - If it returns 'pre_selection' or fails, use projected bracket.
 * - No manual code change needed to switch.
 *
 * Guarantee: always returns a valid bracket with populated regions.
 */
export async function fetchBracketData() {
  try {
    const res = await fetch('/api/bracketology/data');
    if (res.ok) {
      const data = await res.json();
      const bracket = data?.bracket;
      const meta = data?._meta || {};

      if (bracket && bracket.status !== 'pre_selection' && bracket.regions?.length > 0) {
        const realTeamCount = bracket.regions.reduce((total, region) => {
          return total + (region.matchups || []).reduce((count, m) => {
            return count
              + (m.topTeam && !m.topTeam.isPlaceholder ? 1 : 0)
              + (m.bottomTeam && !m.bottomTeam.isPlaceholder ? 1 : 0);
          }, 0);
        }, 0);

        // Accept ANY ESPN data with real teams — no 32-team gate
        if (realTeamCount >= 1) {
          const isPartial = realTeamCount < 64;
          const bracketMode = isPartial ? 'official_partial' : 'official';
          return {
            ...bracket,
            bracketMode,
            _meta: { ...meta, realTeamCount, isPartial },
          };
        }
      }
    }
  } catch { /* fall through to projected */ }

  return generateProjectedBracket();
}

/**
 * Build the full bracket structure from round-of-64 through championship
 * using user selections. Returns all rounds as a flat map of matchups.
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

  const regionWinnerMap = {};
  for (const regionName of REGIONS) {
    const eliteEight = Object.values(allMatchups)
      .find(m => m.round === 4 && m.region === regionName);
    regionWinnerMap[regionName] = eliteEight ? getWinnerTeam(eliteEight, userPicks) : null;
  }

  for (const { matchupId, topRegion, bottomRegion } of FINAL_FOUR_MATCHUPS) {
    const topTeam = regionWinnerMap[topRegion];
    const bottomTeam = regionWinnerMap[bottomRegion];
    allMatchups[matchupId] = {
      matchupId, round: 5,
      topTeam, bottomTeam,
      winner: userPicks[matchupId] || null,
      status: topTeam && bottomTeam ? 'ready' : 'waiting',
      regionMatchup: `${topRegion} vs ${bottomRegion}`,
    };
  }

  const ff1Id = FINAL_FOUR_MATCHUPS[0].matchupId;
  const ff2Id = FINAL_FOUR_MATCHUPS[1].matchupId;
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
