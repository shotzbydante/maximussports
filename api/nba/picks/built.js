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
import { NBA_MODEL_VERSION } from '../../../src/features/nba/picks/v2/buildNbaPicksV2.js';

const cache = createCache(120_000); // 2 min
const cacheStartedAt = new Map(); // cacheKey -> ms epoch when written

function setCacheWithTimestamp(key, payload) {
  cache.set(key, payload);
  cacheStartedAt.set(key, Date.now());
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const debug = req.query?.debug === '1' || req.query?.debug === 'true';
  // v10: debug requests bypass HTTP edge caching so the debug fields aren't
  // erased by Vercel's edge cache hit. Non-debug responses keep the same
  // 2-min s-maxage that production has used since v6.
  if (debug) res.setHeader('Cache-Control', 'no-store');
  else res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=300');

  // v10: cache key includes the model version so a model bump auto-busts
  // the in-process cache too.
  const cacheKey = `nba:picks:built:${NBA_MODEL_VERSION}`;

  // v10: debug=1 bypasses the in-process cache entirely. Pre-v10 the cache
  // hit short-circuited before the debug branch, so /api/nba/picks/built?debug=1
  // never returned _debugByGame whenever the cache was warm.
  if (!debug) {
    const cached = cache.get(cacheKey);
    if (cached) {
      const ageSec = Math.round((Date.now() - (cacheStartedAt.get(cacheKey) || Date.now())) / 1000);
      return res.status(200).json({
        ...cached,
        _cached: true,
        _cacheStatus: { servedFrom: 'in_process', cacheKey, cacheAgeSeconds: ageSec },
        payloadModelVersion: cached.modelVersion ?? null,
        builderModelVersion: NBA_MODEL_VERSION,
      });
    }
  }

  try {
    const { board, source, counts } = await buildNbaPicksBoard({ preferFresh: debug });
    const payload = { ...board, _source: source };

    if (debug && Array.isArray(payload.byGame)) {
      // Project each game into the trimmed shape the audit doc requested
      // so a human or QA bot can spot-check the model decisions.
      payload._debugByGame = payload.byGame.map(g => {
        const ml = g.picks?.moneyline;
        const sp = g.picks?.runline;
        const tt = g.picks?.total;
        return {
          gameId: g.gameId,
          matchup: `${g.awayTeam?.shortName || g.awayTeam?.slug} @ ${g.homeTeam?.shortName || g.homeTeam?.slug}`,
          awayTeam: g.awayTeam?.slug,
          homeTeam: g.homeTeam?.slug,
          model: {
            awayWinProb: ml?.model?.awayWinProb ?? null,
            homeWinProb: ml?.model?.homeWinProb ?? null,
          },
          moneylineDecision: ml ? {
            ...(ml.mlDebug || {}),
            selectedSide: ml.selection?.side,
            selectedTeam: ml.selection?.team,
            priceAmerican: ml.market?.priceAmerican,
            rawEdge: ml.rawEdge,
            modelProb: ml.modelProb,
            impliedProb: ml.impliedProb,
            impliedSource: ml.impliedSource,
            modelSource: ml.modelSource,
            isLowConviction: ml.isLowConviction,
            lowSignalReason: ml.lowSignalReason,
            betScore: ml.betScore?.total,
            conviction: ml.conviction?.label,
          } : null,
          spreadDecision: sp ? {
            ...(sp.spreadDebug || {}),
            selectedSide: sp.selection?.side,
            selectedTeam: sp.selection?.team,
            lineValue: sp.market?.line,
            rawEdge: sp.rawEdge,
            modelSource: sp.modelSource,
            isLowConviction: sp.isLowConviction,
            lowSignalReason: sp.lowSignalReason,
            betScore: sp.betScore?.total,
            conviction: sp.conviction?.label,
          } : null,
          totalDecision: tt ? {
            ...(tt.totalDebug || {}),
            selectedDirection: tt.selection?.side,
            modelSource: tt.modelSource,
            isLowConviction: tt.isLowConviction,
            lowSignalReason: tt.lowSignalReason,
            betScore: tt.betScore?.total,
            conviction: tt.conviction?.label,
          } : null,
        };
      });
    }

    console.log(`[nba/picks/built] source=${source} counts:`, JSON.stringify(counts));

    if (!debug) setCacheWithTimestamp(cacheKey, payload);
    const enriched = {
      ...payload,
      _cacheStatus: { servedFrom: source || 'fresh', cacheKey, cacheAgeSeconds: 0 },
      payloadModelVersion: payload.modelVersion ?? null,
      builderModelVersion: NBA_MODEL_VERSION,
    };
    return res.status(200).json(enriched);
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
