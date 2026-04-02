/**
 * MLB Pick Thresholds — central tunable constants for pick qualification.
 *
 * Edge values represent model probability edge over implied market probability.
 * Confidence tiers: low / medium / high
 *
 * Calibration notes (2026-04):
 *   - Thresholds relaxed from initial conservative settings to ensure
 *     all 4 sections populate on typical MLB slates (~12-16 games/day)
 *   - Pitcher/offense/prevention signals are partially stubbed, capping
 *     achievable DQ at ~0.54. Thresholds account for this.
 *   - Value Leans run independently (not exclusive with Pick'Ems)
 *   - Totals use boosted edge scale to compensate for narrow total variance
 *   - Will continue tuning based on actual game outcomes
 */

export const MLB_PICK_THRESHOLDS = {
  /** Minimum data quality to consider any pick (0–1 scale). */
  minDataQuality: 0.25,

  /** Moneyline / Pick 'Em thresholds */
  moneyline: {
    low: 0.020,
    medium: 0.040,
    high: 0.065,
  },

  /** Run line / ATS thresholds */
  runLine: {
    low: 0.025,
    medium: 0.045,
    high: 0.070,
  },

  /** Lean thresholds (softer — directional value, runs independently) */
  lean: {
    low: 0.010,
    medium: 0.025,
    high: 0.045,
  },

  /** Game total (over/under) thresholds — relaxed due to narrow total variance */
  total: {
    low: 0.015,
    medium: 0.030,
    high: 0.055,
  },
};

/** Max picks per game — raised to 3 so a game can appear in
 *  Pick'Em + ATS/Lean + Total without crowding out categories */
export const MAX_PICKS_PER_GAME = 3;

/** Max games in candidate window */
export const MAX_CANDIDATE_GAMES = 20;

/** Forward window in hours for candidate games */
export const CANDIDATE_WINDOW_HOURS = 36;
