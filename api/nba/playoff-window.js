/**
 * GET /api/nba/playoff-window
 *
 * Multi-day ESPN scoreboard window. Used by NBA Daily Briefing so series
 * state reflects real game results (last 7 days), not just static
 * bracket placeholders.
 *
 * Query params:
 *   ?daysBack=7      — default 7
 *   ?daysForward=1   — default 1
 *   ?enrichOdds=1    — opt-in odds enrichment (off by default for speed)
 *
 * Response:
 *   { games: Array, dates: string[], counts: { total, final, live, upcoming } }
 *
 * Cache: 2-min in-process memo + 60s s-maxage. The window is meant to
 * be refreshed multiple times per day so series wins update as finals
 * come in.
 */

import { createCache } from '../_cache.js';
import { fetchNbaPlayoffScheduleWindow } from '../_lib/nbaPlayoffSchedule.js';

const cache = createCache(120_000);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const url = new URL(req.url, 'http://localhost');
  const daysBack = clamp(parseInt(url.searchParams.get('daysBack') || '7', 10), 0, 30);
  const daysForward = clamp(parseInt(url.searchParams.get('daysForward') || '1', 10), 0, 7);
  const enrichOdds = url.searchParams.get('enrichOdds') === '1';

  const cacheKey = `nba:playoff-window:${daysBack}:${daysForward}:${enrichOdds ? '1' : '0'}`;
  const cached = cache.get(cacheKey);
  if (cached) return res.status(200).json({ ...cached, _cached: true });

  try {
    const result = await fetchNbaPlayoffScheduleWindow({ daysBack, daysForward, enrichOdds });
    cache.set(cacheKey, result);
    return res.status(200).json(result);
  } catch (err) {
    console.error('[nba/playoff-window]', err?.message);
    return res.status(200).json({ games: [], dates: [], counts: { total: 0 }, _error: err?.message });
  }
}

function clamp(n, lo, hi) {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}
