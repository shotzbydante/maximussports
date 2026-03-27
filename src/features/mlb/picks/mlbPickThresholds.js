/**
 * MLB Pick Thresholds — central tunable constants for pick qualification.
 *
 * Edge values represent model probability edge over implied market probability.
 * Confidence tiers: low / medium / high
 */

export const MLB_PICK_THRESHOLDS = {
  /** Minimum data quality to consider any pick (0–1 scale).
   *  Lowered from 0.40 → 0.30 because pitcher/offense/prevention
   *  signals are currently stubbed, capping achievable DQ at ~0.54.
   *  With just projections + record + market, DQ is often ~0.46. */
  minDataQuality: 0.30,

  /** Moneyline / Pick 'Em thresholds */
  moneyline: {
    low: 0.025,
    medium: 0.045,
    high: 0.07,
  },

  /** Run line / ATS thresholds */
  runLine: {
    low: 0.03,
    medium: 0.05,
    high: 0.075,
  },

  /** Lean thresholds (softer — directional value) */
  lean: {
    low: 0.015,
    medium: 0.03,
    high: 0.05,
  },

  /** Game total (over/under) thresholds */
  total: {
    low: 0.025,
    medium: 0.045,
    high: 0.07,
  },
};

/** Max picks per game to prevent flooding */
export const MAX_PICKS_PER_GAME = 2;

/** Max games in candidate window */
export const MAX_CANDIDATE_GAMES = 20;

/** Forward window in hours for candidate games */
export const CANDIDATE_WINDOW_HOURS = 36;
