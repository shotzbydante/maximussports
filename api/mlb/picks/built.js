/**
 * GET /api/mlb/picks/built
 *
 * Returns fully classified MLB picks ready for rendering.
 *
 * Delegates to the shared buildPicksBoard() helper in api/_lib/mlbPicksBuilder.js
 * so the email pipeline and this HTTP endpoint produce IDENTICAL results from
 * the same source of truth. The email pipeline no longer calls this endpoint
 * via HTTP — it calls buildPicksBoard() directly in-process.
 *
 * Response:
 * {
 *   categories: { pickEms: [...], ats: [...], leans: [...], totals: [...] },
 *   meta: { totalCandidates, qualifiedGames, skippedGames },
 *   generatedAt: ISO string,
 *   _source: 'fresh' | 'kv_latest' | 'kv_lastknown' | 'empty',
 * }
 */

import { createCache } from '../../_cache.js';
import { buildPicksBoard } from '../../_lib/mlbPicksBuilder.js';

const cache = createCache(120_000); // 2 min

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=300');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const cacheKey = 'mlb:picks:built';
  const cached = cache.get(cacheKey);
  if (cached) return res.status(200).json({ ...cached, _cached: true });

  try {
    const { board, source, counts } = await buildPicksBoard();
    const payload = { ...board, _source: source };

    const c = payload.categories || {};
    console.log(`[mlb/picks/built] Source=${source} counts:`, JSON.stringify(counts));

    cache.set(cacheKey, payload);
    return res.status(200).json(payload);
  } catch (err) {
    console.error('[mlb/picks/built] FATAL ERROR:', err.message);
    return res.status(200).json({
      categories: { pickEms: [], ats: [], leans: [], totals: [] },
      meta: { totalCandidates: 0, qualifiedGames: 0, skippedGames: 0 },
      generatedAt: new Date().toISOString(),
      _error: err.message,
      _source: 'error',
    });
  }
}
