/**
 * GET /api/nfl/picks/insights
 *
 * Evidence-backed audit insights for NFL picks. Shares the sport-agnostic
 * NBA handler, pinned to NFL. Returns an empty list until audit artifacts
 * exist for the sport.
 */

import sharedHandler from '../../nba/picks/insights.js';

export default function handler(req, res) {
  const scoped = Object.create(req, {
    query: { value: { ...(req.query || {}), sport: 'nfl' }, enumerable: true },
  });
  return sharedHandler(scoped, res);
}
