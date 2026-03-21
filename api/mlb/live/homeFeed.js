/**
 * GET /api/mlb/live/homeFeed
 * Aggregated live intelligence for the MLB Home page.
 * Returns: liveNow, startingSoon, bestEdges, generatedAt
 * Source: ESPN MLB scoreboard + Odds API enrichment.
 */

import { createCache, coalesce } from '../../_cache.js';
import { fetchScoreboard } from './_normalize.js';
import { enrichGamesWithOdds } from './_odds.js';
import { rankLiveGames } from './_scoring.js';

const cache = createCache(30_000); // 30s fresh

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const t0 = Date.now();
  const cacheKey = 'mlb:live:homeFeed';
  const cached = cache.get(cacheKey);
  if (cached) {
    return res.status(200).json({ ...cached, _cache: 'hit' });
  }

  let games = await coalesce(cacheKey + ':fetch', fetchScoreboard);
  if (games.length === 0) {
    const stale = cache.getMaybeStale(cacheKey);
    if (stale?.value) return res.status(200).json({ ...stale.value, _cache: 'stale' });
  }

  // Enrich with real odds (non-blocking — fails gracefully)
  try {
    games = await enrichGamesWithOdds(games);
  } catch (err) {
    console.warn('[homeFeed] odds enrichment failed:', err?.message);
  }

  const ranked = rankLiveGames(games, 'importance');
  const liveNow = ranked.filter((g) => g.status === 'live').slice(0, 6);
  const startingSoon = ranked
    .filter((g) => g.status === 'upcoming' && new Date(g.startTime) - Date.now() < 3 * 3600_000)
    .slice(0, 6);
  const bestEdges = rankLiveGames(games.filter((g) => g.status !== 'final'), 'edge').slice(0, 4);

  const oddsPopulated = games.filter((g) => g.market?.pregameSpread != null).length;
  const modelPopulated = games.filter((g) => g.model?.pregameEdge != null).length;

  const result = {
    liveNow,
    startingSoon,
    bestEdges,
    allGames: ranked.length,
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - t0,
    _enrichment: { oddsPopulated, modelPopulated, total: games.length },
  };

  if (games.length > 0) cache.set(cacheKey, result);

  return res.status(200).json(result);
}
