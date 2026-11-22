/**
 * GET /api/nfl/picks/inplay
 *
 * This week's recommended picks whose games are under way or finished,
 * each with where it stands against the score. The picks board
 * (/api/nfl/picks/built) only lists games still to be played.
 */

import { createCache } from '../../_cache.js';
import { getNflSlate } from '../../_lib/nflSlate.js';
import { getWeekPicksInPlay } from '../../_lib/nflWeekPicks.js';

const cache = createCache(30_000);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');

  const cached = cache.get('inplay');
  if (cached) return res.status(200).json(cached);

  try {
    const slate = await getNflSlate();
    const { picks, ok } = await getWeekPicksInPlay(slate);
    const body = { picks, week: slate?.week ?? null, ok, generatedAt: new Date().toISOString() };
    cache.set('inplay', body);
    return res.status(200).json(body);
  } catch (err) {
    console.error('[nfl/picks/inplay]', err?.message);
    return res.status(200).json({ picks: [], week: null, ok: false, generatedAt: new Date().toISOString() });
  }
}
