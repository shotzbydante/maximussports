/**
 * GET /api/mlb/leaders — MLB season stat leaders via ESPN API.
 *
 * Delegates to api/_lib/mlbLeadersBuilder.js so the HTTP handler and
 * any in-process caller (autopost, email pipeline) produce IDENTICAL
 * results from the same source of truth. In-process callers MUST NOT
 * HTTP-self-fetch this endpoint — call buildMlbLeadersData() directly.
 *
 * Returns top 3 leaders + per-team best in 5 categories:
 *   homeRuns, RBIs, hits, wins, saves
 *
 * Response shape:
 * {
 *   categories: {
 *     homeRuns: { label, abbrev, leaders: [...top3], teamBest: { ABBR: ... } },
 *     ...
 *   },
 *   fetchedAt: ISO string,
 *   _source: 'fresh' | 'kv_latest' | 'kv_lastknown' | 'empty',
 * }
 */

import { createCache, coalesce } from '../_cache.js';
import { buildMlbLeadersData } from '../_lib/mlbLeadersBuilder.js';

const PROCESS_CACHE_TTL = 30 * 60 * 1000; // 30 min in-process memo
const cache = createCache(PROCESS_CACHE_TTL);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const result = await coalesce('mlb:leaders', async () => {
      const fresh = cache.get('mlb:leaders');
      if (fresh) return fresh;

      const { data, source, counts } = await buildMlbLeadersData();
      console.log(`[mlb/leaders] source=${source} counts:`, JSON.stringify(counts));
      const payload = { ...data, _source: source };

      // Only memoize if the response is substantive — avoids pinning an
      // empty board for the next half hour after a transient failure.
      if (counts._categoriesFound >= 3) {
        cache.set('mlb:leaders', payload);
      }
      return payload;
    });

    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');
    return res.status(200).json(result);
  } catch (err) {
    console.error('[mlb/leaders] error:', err?.message);
    return res.status(200).json({
      categories: {},
      fetchedAt: new Date().toISOString(),
      _error: err?.message || 'unknown',
      _source: 'error',
    });
  }
}
