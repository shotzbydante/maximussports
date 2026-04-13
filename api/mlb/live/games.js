/**
 * GET /api/mlb/live/games?status=all&sort=importance
 * Full ranked MLB game slate with intelligence signals.
 */

import { createCache, coalesce } from '../../_cache.js';
import { fetchScoreboard, fetchYesterdayFinals } from './_normalize.js';
import { enrichGamesWithOdds } from './_odds.js';
import { rankLiveGames } from './_scoring.js';

const cache = createCache(30_000);
const yesterdayCache = createCache(300_000); // 5 min — yesterday's results don't change often

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const url = new URL(req.url, 'http://localhost');
  const statusFilter = url.searchParams.get('status') || 'all';
  const sortMode = url.searchParams.get('sort') || 'importance';
  const includeYesterday = url.searchParams.get('includeYesterday') === 'true';

  const cacheKey = 'mlb:live:games';
  let games = cache.get(cacheKey) || await coalesce(cacheKey + ':fetch', fetchScoreboard);

  if (games.length === 0) {
    const stale = cache.getMaybeStale(cacheKey);
    if (stale?.value?.length > 0) games = stale.value;
  }

  // Enrich with real odds
  try {
    games = await enrichGamesWithOdds(games);
  } catch (err) {
    console.warn('[games] odds enrichment failed:', err?.message);
  }

  if (games.length > 0) cache.set(cacheKey, games);

  // Merge yesterday's finals when requested (for daily briefing narratives)
  let yesterdayFinals = [];
  if (includeYesterday) {
    const yCacheKey = 'mlb:live:yesterday';
    yesterdayFinals = yesterdayCache.get(yCacheKey) || await coalesce(yCacheKey + ':fetch', fetchYesterdayFinals);
    if (yesterdayFinals.length > 0) yesterdayCache.set(yCacheKey, yesterdayFinals);
    // Tag yesterday's games so consumers can distinguish them
    yesterdayFinals = yesterdayFinals.map(g => ({ ...g, _fromYesterday: true }));
  }

  let allGames = [...games, ...yesterdayFinals];

  // Deduplicate by gameId (in case a yesterday game also appears in today's feed)
  const seen = new Set();
  allGames = allGames.filter(g => {
    if (seen.has(g.gameId)) return false;
    seen.add(g.gameId);
    return true;
  });

  let filtered = allGames;
  if (statusFilter !== 'all') {
    filtered = allGames.filter((g) => g.status === statusFilter);
  }

  const ranked = rankLiveGames(filtered, sortMode);

  return res.status(200).json({
    games: ranked,
    total: ranked.length,
    statusFilter,
    sortMode,
    includeYesterday,
    generatedAt: new Date().toISOString(),
  });
}
