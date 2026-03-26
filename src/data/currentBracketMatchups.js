/**
 * Current NCAA Men's Tournament bracket matchups.
 *
 * This file is the CANONICAL source of truth for what games are
 * in the current round of the men's tournament. During March Madness,
 * Maximus Picks uses this to seed the game universe instead of
 * relying on feed-first filtering.
 *
 * UPDATE THIS FILE when the bracket advances to a new round.
 * Each entry represents one game in the current round.
 *
 * Fields:
 *   teamA / teamB     — team display names (should match ESPN / Odds API)
 *   slugA / slugB      — canonical team slugs
 *   seedA / seedB      — tournament seeds
 *   round              — current round number (3 = Sweet 16, 4 = Elite 8, etc.)
 *   roundLabel         — display label
 *   gameDate           — ISO date string (day of game)
 */

export const CURRENT_ROUND = 3; // Sweet 16
export const CURRENT_ROUND_LABEL = 'Sweet 16';

export const CURRENT_MATCHUPS = [
  {
    teamA: 'Duke Blue Devils',
    teamB: "St. John's Red Storm",
    slugA: 'duke-blue-devils',
    slugB: 'st-johns-red-storm',
    seedA: 1,
    seedB: 3,
    round: 3,
    roundLabel: 'Sweet 16',
    gameDate: '2026-03-26',
  },
  {
    teamA: 'Arizona Wildcats',
    teamB: 'Arkansas Razorbacks',
    slugA: 'arizona-wildcats',
    slugB: 'arkansas-razorbacks',
    seedA: 1,
    seedB: 4,
    round: 3,
    roundLabel: 'Sweet 16',
    gameDate: '2026-03-27',
  },
  {
    teamA: 'Michigan State Spartans',
    teamB: 'UConn Huskies',
    slugA: 'michigan-state-spartans',
    slugB: 'uconn-huskies',
    seedA: 3,
    seedB: 2,
    round: 3,
    roundLabel: 'Sweet 16',
    gameDate: '2026-03-27',
  },
  {
    teamA: 'Alabama Crimson Tide',
    teamB: 'Michigan Wolverines',
    slugA: 'alabama-crimson-tide',
    slugB: 'michigan-wolverines',
    seedA: 2,
    seedB: 2,
    round: 3,
    roundLabel: 'Sweet 16',
    gameDate: '2026-03-27',
  },
  {
    teamA: 'Purdue Boilermakers',
    teamB: 'Texas Longhorns',
    slugA: 'purdue-boilermakers',
    slugB: 'texas-longhorns',
    seedA: 3,
    seedB: 11,
    round: 3,
    roundLabel: 'Sweet 16',
    gameDate: '2026-03-26',
  },
  {
    teamA: 'Illinois Fighting Illini',
    teamB: 'Houston Cougars',
    slugA: 'illinois-fighting-illini',
    slugB: 'houston-cougars',
    seedA: 3,
    seedB: 1,
    round: 3,
    roundLabel: 'Sweet 16',
    gameDate: '2026-03-27',
  },
  {
    teamA: 'Tennessee Volunteers',
    teamB: 'Iowa State Cyclones',
    slugA: 'tennessee-volunteers',
    slugB: 'iowa-state-cyclones',
    seedA: 2,
    seedB: 2,
    round: 3,
    roundLabel: 'Sweet 16',
    gameDate: '2026-03-26',
  },
  {
    teamA: 'Nebraska Cornhuskers',
    teamB: 'Iowa Hawkeyes',
    slugA: 'nebraska-cornhuskers',
    slugB: 'iowa-hawkeyes',
    seedA: 7,
    seedB: 9,
    round: 3,
    roundLabel: 'Sweet 16',
    gameDate: '2026-03-26',
  },
];

/**
 * Quick lookup: is this slug one of the teams in the current round?
 */
const _currentTeams = new Set(
  CURRENT_MATCHUPS.flatMap(m => [m.slugA, m.slugB])
);

export function isCurrentRoundTeam(slug) {
  return _currentTeams.has(slug);
}

/**
 * Get the canonical matchup key for a pair of slugs.
 * Returns null if these teams are not playing each other in the current round.
 */
export function getCurrentRoundMatchupKey(slugA, slugB) {
  if (!slugA || !slugB) return null;
  const sorted = [slugA, slugB].sort().join('|');
  for (const m of CURRENT_MATCHUPS) {
    const key = [m.slugA, m.slugB].sort().join('|');
    if (key === sorted) return key;
  }
  return null;
}
