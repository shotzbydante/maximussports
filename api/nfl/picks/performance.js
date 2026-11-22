/**
 * GET /api/nfl/picks/performance
 *
 * Trailing 7-day and 30-day NFL record from picks_daily_scorecards.
 * The aggregation is sport-agnostic and lives in the NBA handler; this
 * route pins it to NFL so a missing ?sport= can never return another
 * sport's numbers.
 */

import sharedHandler from '../../nba/picks/performance.js';

export default function handler(req, res) {
  const scoped = Object.create(req, {
    query: { value: { ...(req.query || {}), sport: 'nfl' }, enumerable: true },
  });
  return sharedHandler(scoped, res);
}
