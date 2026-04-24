/**
 * GET /api/nba/picks/built
 *
 * Canonical NBA picks endpoint — mirrors /api/mlb/picks/built.
 *
 * Delegates to buildNbaPicksBoard() in api/_lib/nbaPicksBuilder.js so the
 * HTTP handler and any in-process caller (autopost, email, Content Studio)
 * produce IDENTICAL results from the same source of truth. In-process
 * callers must NOT HTTP-self-fetch this endpoint — call buildNbaPicksBoard
 * directly (this is the exact fix we applied to the MLB autopost).
 *
 * Response:
 * {
 *   sport: 'nba',
 *   modelVersion, configVersion,
 *   tiers: { tier1, tier2, tier3 },
 *   categories: { pickEms, ats, leans, totals },   // legacy shape (caption builder)
 *   coverage, topPick, scorecardSummary, meta,
 *   _source: 'fresh' | 'kv_latest' | 'kv_lastknown' | 'empty',
 * }
 */

import { createCache } from '../../_cache.js';
import { buildNbaPicksBoard } from '../../_lib/nbaPicksBuilder.js';

const cache = createCache(120_000); // 2 min

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=300');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const cacheKey = 'nba:picks:built';
  const cached = cache.get(cacheKey);
  if (cached) return res.status(200).json({ ...cached, _cached: true });

  try {
    const { board, source, counts } = await buildNbaPicksBoard();
    const payload = { ...board, _source: source };

    console.log(`[nba/picks/built] source=${source} counts:`, JSON.stringify(counts));

    cache.set(cacheKey, payload);
    return res.status(200).json(payload);
  } catch (err) {
    console.error('[nba/picks/built] FATAL ERROR:', err.message);
    return res.status(200).json({
      sport: 'nba',
      tiers: { tier1: [], tier2: [], tier3: [] },
      coverage: [],
      topPick: null,
      meta: { picksPublished: 0 },
      categories: { pickEms: [], ats: [], leans: [], totals: [] },
      generatedAt: new Date().toISOString(),
      _error: err.message,
      _source: 'error',
    });
  }
}
