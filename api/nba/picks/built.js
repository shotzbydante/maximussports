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
    const debug = req.query?.debug === '1' || req.query?.debug === 'true';
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

    if (!debug) cache.set(cacheKey, payload);
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
