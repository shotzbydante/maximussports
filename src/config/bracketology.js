/**
 * Bracketology feature gate.
 *
 * Centralizes access control for the Bracketology feature during private
 * iteration. Expand the allowlist or switch to a feature-flag / admin-flag
 * system when ready to open up access.
 */

/**
 * Returns true if the user has access to Bracketology.
 * Now open to all users — no email allowlist required.
 * @param {string|null|undefined} _email
 */
export function hasBracketologyAccess(_email) {
  return true;
}

export const BRACKETOLOGY_ROUTE = '/bracketology';

export const TOURNAMENT_YEAR = 2026;
export const TOURNAMENT_NAME = '2026 NCAA March Madness';

export const REGIONS = ['East', 'West', 'South', 'Midwest'];

/**
 * Canonical Final Four cross-region pairings (NCAA bracket structure).
 * Each entry maps a semifinal matchup ID to the two regions whose
 * champions meet. All downstream code must reference this constant
 * instead of deriving pairings from REGIONS array order.
 */
export const FINAL_FOUR_MATCHUPS = [
  { matchupId: 'ff-1', topRegion: 'South', bottomRegion: 'East' },
  { matchupId: 'ff-2', topRegion: 'West',  bottomRegion: 'Midwest' },
];

export const ROUNDS = [
  { id: 1, name: 'Round of 64', shortName: 'R64', gamesPerRegion: 8 },
  { id: 2, name: 'Round of 32', shortName: 'R32', gamesPerRegion: 4 },
  { id: 3, name: 'Sweet 16', shortName: 'S16', gamesPerRegion: 2 },
  { id: 4, name: 'Elite 8', shortName: 'E8', gamesPerRegion: 1 },
  { id: 5, name: 'Final Four', shortName: 'F4', gamesPerRegion: 0 },
  { id: 6, name: 'Championship', shortName: 'CHAMP', gamesPerRegion: 0 },
];

export const SEED_MATCHUP_ORDER = [
  [1, 16], [8, 9], [5, 12], [4, 13],
  [6, 11], [3, 14], [7, 10], [2, 15],
];
