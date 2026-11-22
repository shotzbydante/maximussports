/**
 * GET /api/nfl/standings — NFL standings via ESPN.
 *
 * Mirrors the /api/mlb/standings and /api/nba/standings contract: a flat
 * map of team slug → record fields. NFL adds ties, points for/against,
 * division rank and the conference playoff seed.
 */

import { getNflStandings } from '../_lib/nflStandings.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const result = await getNflStandings();
  return res.status(200).json(result);
}
