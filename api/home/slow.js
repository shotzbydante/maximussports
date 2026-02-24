/**
 * Slow Home data. GET /api/home/slow
 * Query: ?pinnedSlugs=slug1,slug2 (optional).
 * Returns: headlines, odds, oddsHistory, atsLeaders, pinnedTeamNews, upcomingGamesWithSpreads, slowDataStatus.
 * Cache: 20 min.
 */

import { createCache } from '../_cache.js';
import {
  fetchRankingsSource,
  fetchOddsSource,
  fetchOddsHistorySource,
  fetchTeamIdsSource,
  fetchNewsAggregateSource,
  fetchTeamNewsSource,
  fetchScoresSource,
} from '../_sources.js';
import { getAtsLeaders, setAtsLeaders, setHeadlines } from './cache.js';
import { computeAtsLeadersFromSources } from './atsLeaders.js';
import { getTeamSlug } from '../../src/utils/teamSlug.js';
import { mergeGamesWithOdds } from '../../src/api/odds.js';

const CACHE_MS = 20 * 60 * 1000; // 20 min
const FETCH_TIMEOUT_MS = 8000;   // 8s per upstream fetch
const OVERALL_TIMEOUT_MS = 10000; // 10s max response
const SKIP_ODDS_HISTORY_AFTER_MS = 6000; // optional: use cached ATS if we're past 6s

const homeSlowCache = createCache(CACHE_MS);
const isDev = typeof process !== 'undefined' && process.env && process.env.NODE_ENV !== 'production';

function rejectAfter(ms) {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms);
  });
}

function withTimeout(promise, ms) {
  return Promise.race([promise, rejectAfter(ms)]);
}

function toDateStr(d) {
  return d.toISOString().slice(0, 10);
}

function cacheKey(pinnedSlugs) {
  const slugPart = Array.isArray(pinnedSlugs) && pinnedSlugs.length > 0
    ? pinnedSlugs.slice(0, 20).join(',')
    : '';
  return `home:slow${slugPart ? `:${slugPart}` : ''}`;
}

function getOddsKeyDebug() {
  const key = process.env.ODDS_API_KEY || '';
  return { hasOddsKey: !!process.env.ODDS_API_KEY, oddsKeyLength: key.length };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const pinnedSlugsParam = req.query?.pinnedSlugs;
  const pinnedSlugs = typeof pinnedSlugsParam === 'string' && pinnedSlugsParam.trim()
    ? pinnedSlugsParam.split(',').map((s) => s.trim()).filter(Boolean)
    : [];

  const key = cacheKey(pinnedSlugs);
  const cached = homeSlowCache.get(key);
  if (cached) {
    const atsLeadersCount = (cached.atsLeaders?.best?.length || 0) + (cached.atsLeaders?.worst?.length || 0);
    return res.status(200).json({
      ...cached,
      _cached: true,
      atsLeadersCount: cached.atsLeadersCount ?? atsLeadersCount,
      atsCacheWrite: false,
      slowTimeout: false,
      ...getOddsKeyDebug(),
    });
  }

  if (!process.env.ODDS_API_KEY || process.env.ODDS_API_KEY.trim() === '') {
    const slowDataStatus = {
      headlinesCount: 0,
      oddsCount: 0,
      oddsHistoryCount: 0,
      atsLeadersCount: 0,
      dataStatusLine: 'Odds API key missing. Headlines/ATS skipped.',
    };
    return res.status(200).json({
      hasOddsKey: false,
      headlines: [],
      odds: { games: [], error: 'missing_key', hasOddsKey: false },
      oddsHistory: { games: [] },
      atsLeaders: { best: [], worst: [] },
      pinnedTeamNews: {},
      upcomingGamesWithSpreads: [],
      slowDataStatus,
      atsLeadersCount: 0,
      atsCacheWrite: false,
      slowTimeout: false,
      ...getOddsKeyDebug(),
    });
  }

  function returnCachedOrEmpty(slowTimeoutFlag = false) {
    const cached = homeSlowCache.get(key);
    if (cached) {
      const atsLeadersCount = (cached.atsLeaders?.best?.length || 0) + (cached.atsLeaders?.worst?.length || 0);
      return res.status(200).json({
        ...cached,
        slowTimeout: slowTimeoutFlag,
        atsLeadersCount: cached.atsLeadersCount ?? atsLeadersCount,
        atsCacheWrite: false,
        ...getOddsKeyDebug(),
      });
    }
    const slowDataStatus = {
      headlinesCount: 0,
      oddsCount: 0,
      oddsHistoryCount: 0,
      atsLeadersCount: 0,
      dataStatusLine: slowTimeoutFlag ? 'Timeout; returning empty.' : 'Slow fetch failed.',
    };
    return res.status(200).json({
      headlines: [],
      odds: { games: [], error: null, hasOddsKey: false },
      oddsHistory: { games: [] },
      atsLeaders: { best: [], worst: [] },
      pinnedTeamNews: {},
      upcomingGamesWithSpreads: [],
      slowDataStatus,
      atsLeadersCount: 0,
      atsCacheWrite: false,
      slowTimeout: slowTimeoutFlag,
      ...getOddsKeyDebug(),
    });
  }

  const startTime = Date.now();

  try {
    const workPromise = (async () => {
        const today = toDateStr(new Date());
        const tomorrow = (() => {
          const d = new Date();
          d.setDate(d.getDate() + 1);
          return toDateStr(d).replace(/-/g, '');
        })();

        let slowTimeout = false;
        const settled = await Promise.allSettled([
          withTimeout(fetchNewsAggregateSource({ includeNational: true }), FETCH_TIMEOUT_MS),
          withTimeout(fetchOddsSource(), FETCH_TIMEOUT_MS),
          withTimeout(fetchOddsHistorySource(SEASON_START, today), FETCH_TIMEOUT_MS),
          withTimeout(fetchTeamIdsSource(), FETCH_TIMEOUT_MS),
          withTimeout(fetchRankingsSource(), FETCH_TIMEOUT_MS),
          pinnedSlugs.length > 0
            ? withTimeout(Promise.all(pinnedSlugs.map((slug) => fetchTeamNewsSource(slug))), FETCH_TIMEOUT_MS)
            : Promise.resolve(null),
          withTimeout(fetchScoresSource(tomorrow), FETCH_TIMEOUT_MS),
        ]);

        const newsData = settled[0].status === 'fulfilled' ? settled[0].value : null;
        const oddsData = settled[1].status === 'fulfilled' ? settled[1].value : null;
        const oddsHistoryData = settled[2].status === 'fulfilled' ? settled[2].value : null;
        const teamIdsData = settled[3].status === 'fulfilled' ? settled[3].value : null;
        const rankingsData = settled[4].status === 'fulfilled' ? settled[4].value : null;
        const pinnedNewsRaw = settled[5].status === 'fulfilled' ? settled[5].value : null;
        const tomorrowScoresRaw = settled[6].status === 'fulfilled' ? settled[6].value : null;

        if (settled.some((s) => s.status === 'rejected')) slowTimeout = true;

        const elapsed = Date.now() - startTime;
        const useCachedAts = elapsed > SKIP_ODDS_HISTORY_AFTER_MS;

        const headlines = newsData?.items || [];
        const odds = {
          games: oddsData?.games ?? [],
          error: oddsData?.error,
          hasOddsKey: oddsData?.hasOddsKey !== false,
        };
        let oddsHistoryGames = oddsHistoryData?.games || [];
        if (useCachedAts) {
          oddsHistoryGames = [];
          slowTimeout = true;
        }
        let atsLeaders = { best: [], worst: [] };
        if (useCachedAts) {
          const cached = getAtsLeaders();
          atsLeaders = { best: cached.best, worst: cached.worst, sourceLabel: cached.sourceLabel };
        } else {
          const atsResult = await computeAtsLeadersFromSources();
          atsLeaders = {
            best: atsResult.best || [],
            worst: atsResult.worst || [],
            source: atsResult.source,
            sourceLabel: atsResult.sourceLabel,
          };
          setAtsLeaders(atsLeaders);
        }
        const atsLeadersCount = atsLeaders.best.length + atsLeaders.worst.length;
    if (isDev) console.log('[api/home/slow] atsLeaders written to cache, count:', atsLeadersCount);
    setHeadlines(headlines);

    const pinnedTeamNews = {};
    if (pinnedNewsRaw && pinnedSlugs.length > 0) {
      pinnedSlugs.forEach((slug, i) => {
        const data = pinnedNewsRaw[i];
        pinnedTeamNews[slug] = data?.headlines || [];
      });
    }

    const tomorrowScores = Array.isArray(tomorrowScoresRaw) ? tomorrowScoresRaw : [];
    const upcomingGamesWithSpreads = mergeGamesWithOdds(tomorrowScores, odds.games, getTeamSlug);

    const slowDataStatus = {
      headlinesCount: headlines.length,
      oddsCount: odds.games.length,
      oddsHistoryCount: oddsHistoryGames.length,
      atsLeadersCount: atsLeaders.best.length + atsLeaders.worst.length,
      dataStatusLine: [
        `Headlines: ${headlines.length > 0 ? `OK (${headlines.length})` : 'MISSING'}`,
        `Odds: ${odds.games.length > 0 ? `OK (${odds.games.length})` : 'MISSING'}`,
        `ATS: ${atsLeaders.best.length + atsLeaders.worst.length > 0 ? 'OK' : 'MISSING'}`,
      ].join('. '),
    };

        const payload = {
          headlines,
          odds: { games: odds.games, error: odds.error, hasOddsKey: odds.hasOddsKey },
          oddsHistory: { games: oddsHistoryGames },
          atsLeaders: { best: atsLeaders.best, worst: atsLeaders.worst },
          atsLeadersSourceLabel: atsLeaders.sourceLabel ?? null,
          pinnedTeamNews,
          upcomingGamesWithSpreads,
          slowDataStatus,
          atsLeadersCount,
          atsCacheWrite: true,
          slowTimeout,
          ...getOddsKeyDebug(),
        };
        return payload;
      })().catch((err) => {
        console.error('[api/home/slow] error:', err.message);
        return null;
      });

    const overallTimeoutPromise = new Promise((resolve) => {
      setTimeout(() => resolve({ timedOut: true }), OVERALL_TIMEOUT_MS);
    });

    const result = await Promise.race([
      overallTimeoutPromise,
      workPromise.then((payload) => (payload ? { timedOut: false, payload } : { timedOut: true })),
    ]);

    if (result.timedOut) return returnCachedOrEmpty(true);
    const payload = result.payload;
    homeSlowCache.set(key, payload);
    return res.status(200).json(payload);
  } catch (err) {
    console.error('[api/home/slow] error:', err.message);
    return returnCachedOrEmpty(false);
  }
}
