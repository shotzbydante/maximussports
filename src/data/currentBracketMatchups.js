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

export const CURRENT_ROUND = 5; // Final Four
export const CURRENT_ROUND_LABEL = 'Final Four';

export const CURRENT_MATCHUPS = [
  {
    teamA: 'Illinois Fighting Illini',
    teamB: 'UConn Huskies',
    slugA: 'illinois-fighting-illini',
    slugB: 'uconn-huskies',
    seedA: 3,
    seedB: 2,
    round: 5,
    roundLabel: 'Final Four',
    gameDate: '2026-04-04',
  },
  {
    teamA: 'Michigan Wolverines',
    teamB: 'Arizona Wildcats',
    slugA: 'michigan-wolverines',
    slugB: 'arizona-wildcats',
    seedA: 2,
    seedB: 1,
    round: 5,
    roundLabel: 'Final Four',
    gameDate: '2026-04-04',
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
