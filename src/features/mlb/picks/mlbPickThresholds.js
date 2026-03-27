/**
 * MLB Pick Thresholds — central tunable constants for pick qualification.
 *
 * Edge values represent model probability edge over implied market probability.
 * Confidence tiers: low / medium / high
 */

export const MLB_PICK_THRESHOLDS = {
  /** Minimum data quality to consider any pick (0–1 scale) */
  minDataQuality: 0.40,

  /** Moneyline / Pick 'Em thresholds */
  moneyline: {
    low: 0.035,
    medium: 0.055,
    high: 0.08,
  },

  /** Run line / ATS thresholds */
  runLine: {
    low: 0.04,
    medium: 0.06,
    high: 0.085,
  },

  /** Lean thresholds (softer — directional value) */
  lean: {
    low: 0.02,
    medium: 0.035,
    high: 0.055,
  },

  /** Game total (over/under) thresholds */
  total: {
    low: 0.035,
    medium: 0.055,
    high: 0.08,
  },
};

/** Max picks per game to prevent flooding */
export const MAX_PICKS_PER_GAME = 2;

/** Max games in candidate window */
export const MAX_CANDIDATE_GAMES = 20;

/** Forward window in hours for candidate games */
export const CANDIDATE_WINDOW_HOURS = 36;
