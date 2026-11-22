/**
 * GET /api/nfl/live/games?status=all&sort=importance
 * The current NFL week, ranked, with consensus odds and model projections.
 */

import { getNflSlate } from '../../_lib/nflSlate.js';
import { rankLiveGames } from './_scoring.js';

const SEASON_LABEL = { 1: 'Preseason', 2: 'Regular Season', 3: 'Playoffs', 4: 'Offseason' };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const url = new URL(req.url, 'http://localhost');
  const statusFilter = url.searchParams.get('status') || 'all';
  const sortMode = url.searchParams.get('sort') || 'importance';

  let slate;
  try { slate = await getNflSlate(); }
  catch (err) {
    console.warn('[nfl/games] slate load failed:', err?.message);
    slate = { games: [], week: null, seasonType: null, seasonYear: null, byeTeams: [] };
  }

  const all = slate.games || [];
  const filtered = statusFilter === 'all' ? all : all.filter((g) => g.status === statusFilter);
  const ranked = rankLiveGames(filtered, sortMode);

  return res.status(200).json({
    games: ranked,
    total: ranked.length,
    counts: {
      live: all.filter((g) => g.status === 'live').length,
      upcoming: all.filter((g) => g.status === 'upcoming').length,
      final: all.filter((g) => g.status === 'final').length,
    },
    week: slate.week ?? null,
    seasonType: slate.seasonType ?? null,
    seasonLabel: SEASON_LABEL[slate.seasonType] || null,
    seasonYear: slate.seasonYear ?? null,
    byeTeams: slate.byeTeams || [],
    statusFilter,
    sortMode,
    generatedAt: new Date().toISOString(),
  });
}
