/**
 * GET /api/mlb/live/team?slug=nyy
 * Returns the team's current live game or next upcoming game with intelligence.
 */

import { createCache, coalesce } from '../../_cache.js';
import { fetchScoreboard, slugMeta } from './_normalize.js';
import { enrichGamesWithOdds } from './_odds.js';
import { rankLiveGames } from './_scoring.js';

const cache = createCache(30_000);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const slug = new URL(req.url, 'http://localhost').searchParams.get('slug') || '';
  const meta = slugMeta[slug];
  if (!meta) return res.status(400).json({ error: 'Unknown slug' });

  const cacheKey = 'mlb:live:scoreboard';
  let games = cache.get(cacheKey) || await coalesce(cacheKey + ':fetch', fetchScoreboard);

  // Enrich with real odds
  try {
    games = await enrichGamesWithOdds(games);
  } catch (err) {
    console.warn('[team] odds enrichment failed:', err?.message);
  }

  if (games.length > 0) cache.set(cacheKey, games);

  // Find team's game (live first, then upcoming, then final)
  const teamGames = games.filter((g) => g.teams.home.slug === slug || g.teams.away.slug === slug);
  const ranked = rankLiveGames(teamGames, 'importance');
  const live = ranked.find((g) => g.status === 'live');
  const upcoming = ranked.find((g) => g.status === 'upcoming');
  const game = live || upcoming || ranked[0] || null;

  return res.status(200).json({
    teamSlug: slug,
    teamName: meta.name,
    game,
    hasLive: !!live,
    generatedAt: new Date().toISOString(),
  });
}
