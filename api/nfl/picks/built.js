/**
 * GET /api/nfl/picks/built
 *
 * Canonical NFL picks endpoint — mirrors /api/mlb/picks/built and the NBA
 * one. Delegates to buildNflPicksBoard() so the HTTP handler and any
 * in-process caller produce identical results.
 *
 * ?debug=1 bypasses caches and adds a per-game projection trace.
 */

import { createCache } from '../../_cache.js';
import { buildNflPicksBoard } from '../../_lib/nflPicksBuilder.js';
import { NFL_MODEL_VERSION } from '../../../src/features/nfl/picks/buildNflPicksV2.js';

const cache = createCache(120_000);
const cachedAt = new Map();

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const debug = req.query?.debug === '1' || req.query?.debug === 'true';
  if (debug) res.setHeader('Cache-Control', 'no-store');
  else res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=300');

  const cacheKey = `nfl:picks:built:${NFL_MODEL_VERSION}`;

  if (!debug) {
    const cached = cache.get(cacheKey);
    if (cached) {
      return res.status(200).json({
        ...cached,
        _cached: true,
        _cacheStatus: {
          servedFrom: 'in_process', cacheKey,
          cacheAgeSeconds: Math.round((Date.now() - (cachedAt.get(cacheKey) || Date.now())) / 1000),
        },
        builderModelVersion: NFL_MODEL_VERSION,
      });
    }
  }

  try {
    const { board, source, counts } = await buildNflPicksBoard({ preferFresh: debug });
    const payload = { ...board, _source: source };

    if (debug) {
      payload._debugByGame = (payload.byGame || []).map((g) => ({
        gameId: g.gameId,
        matchup: `${g.awayTeam?.shortName} @ ${g.homeTeam?.shortName}`,
        projection: g.projection,
        market: g.market,
        fair: g.fair,
        quarterbacks: g.quarterbacks,
        environment: g.environment,
        situations: (g.situations || []).map((t) => t.key),
        flags: g.flags,
        picks: Object.fromEntries(Object.entries(g.picks || {}).map(([k, p]) => [k, p ? {
          label: p.selection?.label,
          tier: p.tier,
          pickRole: p.pickRole,
          betScore: p.betScore?.total,
          components: p.betScore?.components,
          ev: p.ev,
          price: p.market?.priceAmerican,
          book: p.book?.title || null,
          reason: p.lowSignalReason,
          lock: p.lock || null,
          modelGap: p.edgePoints,
        } : null])),
      }));
    }

    console.log(`[nfl/picks/built] source=${source} counts:`, JSON.stringify(counts));

    if (!debug) {
      cache.set(cacheKey, payload);
      cachedAt.set(cacheKey, Date.now());
    }
    return res.status(200).json({
      ...payload,
      _cacheStatus: { servedFrom: source || 'fresh', cacheKey, cacheAgeSeconds: 0 },
      builderModelVersion: NFL_MODEL_VERSION,
    });
  } catch (err) {
    console.error('[nfl/picks/built] FATAL ERROR:', err.message);
    return res.status(200).json({
      sport: 'nfl',
      tiers: { tier1: [], tier2: [], tier3: [] },
      coverage: [], fullSlatePicks: [], heroPicks: [], trackingPicks: [], byGame: [],
      topPick: null,
      meta: { picksPublished: 0 },
      categories: { pickEms: [], ats: [], leans: [], totals: [] },
      generatedAt: new Date().toISOString(),
      _error: err.message,
      _source: 'error',
    });
  }
}
