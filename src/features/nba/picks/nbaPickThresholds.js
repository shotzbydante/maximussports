/**
 * NBA pick qualification thresholds.
 *
 * Tuned to produce a meaningful board when odds data is present
 * but not so strict that the board is empty during normal playoff slates.
 * Higher seeds / stronger teams get smaller absolute edges in basketball,
 * so thresholds are gentler than MLB while still quality-gated.
 */

export const NBA_PICK_THRESHOLDS = {
  minDataQuality: 0.15,

  // Moneyline pick 'ems — edge measured against implied win%
  moneyline: { low: 0.015, medium: 0.035, high: 0.065 },

  // Spread picks — edge measured in points of fair spread gap
  spread:    { low: 0.8,   medium: 2.0,   high: 4.0 },

  // Value leans — softer moneyline (for when high-conf picks are thin)
  lean:      { low: 0.008, medium: 0.020, high: 0.040 },

  // Totals — edge measured in points of fair total gap
  total:     { low: 2.0,   medium: 4.0,   high: 7.0 },

  MAX_PICKS_PER_GAME: 4,
  MAX_CANDIDATE_GAMES: 24,
};

export const MAX_CANDIDATE_GAMES = NBA_PICK_THRESHOLDS.MAX_CANDIDATE_GAMES;
