/**
 * GET /api/nba/leaders — NBA season stat leaders via ESPN API.
 *
 * Delegates to api/_lib/nbaLeadersBuilder.js so the HTTP handler and any
 * in-process caller (autopost, email pipeline) produce IDENTICAL results
 * from the same source of truth. In-process callers MUST NOT HTTP-self-
 * fetch this endpoint — call buildNbaLeadersData() directly.
 *
 * Returns top 3 leaders + per-team best in 5 categories:
 *   avgPoints (PPG), avgAssists (APG), avgRebounds (RPG),
 *   avgSteals (SPG), avgBlocks (BPG)
 *
 * Response shape:
 * {
 *   categories: {
 *     avgPoints: { label, abbrev, leaders: [...top3], teamBest: { ABBR: ... } },
 *     ...
 *   },
 *   fetchedAt: ISO string,
 *   _source: 'fresh' | 'kv_latest' | 'kv_lastknown' | 'empty',
 * }
 */

import { createCache, coalesce } from '../_cache.js';
import { buildNbaLeadersData } from '../_lib/nbaLeadersBuilder.js';

const PROCESS_CACHE_TTL = 30 * 60 * 1000; // 30 min in-process memo
const cache = createCache(PROCESS_CACHE_TTL);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const result = await coalesce('nba:leaders', async () => {
      const fresh = cache.get('nba:leaders');
      if (fresh) return fresh;

      const { data, source, counts } = await buildNbaLeadersData();
      console.log(`[nba/leaders] source=${source} counts:`, JSON.stringify(counts));
      const payload = { ...data, _source: source };

      // Only memoize substantive responses — avoids pinning an empty board
      // for the next half-hour after a transient failure.
      if (counts._categoriesFound >= 3) {
        cache.set('nba:leaders', payload);
      }
      return payload;
    });

    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');
    return res.status(200).json(result);
  } catch (err) {
    console.error('[nba/leaders] error:', err?.message);
    return res.status(200).json({
      categories: {},
      fetchedAt: new Date().toISOString(),
      _error: err?.message || 'unknown',
      _source: 'error',
    });
  }
}
