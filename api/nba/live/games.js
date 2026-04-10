/**
 * GET /api/nba/live/games?status=all&sort=importance
 * Full ranked NBA game slate with intelligence signals.
 */

import { createCache, coalesce } from '../../_cache.js';
import { fetchScoreboard } from './_normalize.js';
import { enrichGamesWithOdds } from './_odds.js';
import { rankLiveGames } from './_scoring.js';

const cache = createCache(30_000);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const url = new URL(req.url, 'http://localhost');
  const statusFilter = url.searchParams.get('status') || 'all';
  const sortMode = url.searchParams.get('sort') || 'importance';

  const cacheKey = 'nba:live:games';
  let games = cache.get(cacheKey) || await coalesce(cacheKey + ':fetch', fetchScoreboard);

  if (games.length === 0) {
    const stale = cache.getMaybeStale(cacheKey);
    if (stale?.value?.length > 0) games = stale.value;
  }

  try {
    games = await enrichGamesWithOdds(games);
  } catch (err) {
    console.warn('[nba/games] odds enrichment failed:', err?.message);
  }

  if (games.length > 0) cache.set(cacheKey, games);

  let filtered = games;
  if (statusFilter !== 'all') {
    filtered = games.filter((g) => g.status === statusFilter);
  }

  const ranked = rankLiveGames(filtered, sortMode);

  return res.status(200).json({
    games: ranked,
    total: ranked.length,
    statusFilter,
    sortMode,
    generatedAt: new Date().toISOString(),
  });
}
