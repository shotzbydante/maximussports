/**
 * MLB Pick Thresholds — central tunable constants for pick qualification.
 *
 * Calibration notes (2026-04-01):
 *   - Value Leans use raw edge (no DQ/SA multiplier) for softer qualification
 *   - Totals use raw edge with boosted multiplier for narrow MLB total variance
 *   - Pick'Ems and ATS use adjusted edge (with DQ/SA multiplier)
 *   - All thresholds calibrated for stubbed pitcher data (DQ cap ~0.54)
 *   - Tuned to produce ~5 picks per section on a 15-game slate
 */

export const MLB_PICK_THRESHOLDS = {
  /** Minimum data quality to consider any pick (0–1 scale). */
  minDataQuality: 0.20,

  /** Moneyline / Pick 'Em thresholds (applied to adjusted edge) */
  moneyline: {
    low: 0.015,
    medium: 0.035,
    high: 0.060,
  },

  /** Run line / ATS thresholds (applied to adjusted edge) */
  runLine: {
    low: 0.020,
    medium: 0.040,
    high: 0.065,
  },

  /** Lean thresholds (applied to RAW edge — no DQ/SA multiplier) */
  lean: {
    low: 0.005,
    medium: 0.015,
    high: 0.035,
  },

  /** Game total thresholds (applied to RAW edge — no DQ/SA multiplier) */
  total: {
    low: 0.008,
    medium: 0.020,
    high: 0.045,
  },
};

/** Max picks per game across all categories */
export const MAX_PICKS_PER_GAME = 4;

/** Max games in candidate window */
export const MAX_CANDIDATE_GAMES = 20;

/** Forward window in hours for candidate games */
export const CANDIDATE_WINDOW_HOURS = 36;
