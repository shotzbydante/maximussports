/**
 * NBA Bracketology configuration.
 *
 * Defines playoff structure, rounds, and bracket layout for
 * the NBA postseason bracket visualization.
 */

export const NBA_PLAYOFF_YEAR = 2026;
export const NBA_PLAYOFF_NAME = '2026 NBA Playoffs';

export const CONFERENCES = ['Western', 'Eastern'];

/** Round definitions — NBA uses best-of-7 throughout */
export const ROUNDS = [
  { id: 1, name: '1st Round',         shortName: 'R1',    seriesLength: 7 },
  { id: 2, name: 'Conf. Semifinals',  shortName: 'CSF',   seriesLength: 7 },
  { id: 3, name: 'Conf. Finals',      shortName: 'CF',    seriesLength: 7 },
  { id: 4, name: 'NBA Finals',        shortName: 'FINALS', seriesLength: 7 },
];

/** First-round seed matchup order (higher seed gets home court) */
export const SEED_MATCHUP_ORDER = [
  [1, 8], [4, 5], [3, 6], [2, 7],
];

/**
 * Conference Finals pairing: the championship matchup
 * brings the West champion vs East champion.
 */
export const FINALS_MATCHUP = {
  matchupId: 'finals',
  topConference: 'Western',
  bottomConference: 'Eastern',
};

/** Round labels for display */
export const ROUND_LABELS = ['1st Round', 'Conf. Semifinals', 'Conf. Finals', 'NBA Finals'];

/** Play-In Tournament dates */
export const PLAY_IN_DATES = {
  start: '2026-04-14',
  end: '2026-04-17',
};

/** Playoff start date */
export const PLAYOFF_START = '2026-04-18';
