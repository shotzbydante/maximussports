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
  fetchScheduleSource,
  fetchNewsAggregateSource,
  fetchTeamNewsSource,
  fetchScoresSource,
} from '../_sources.js';
import { setAtsLeaders, setHeadlines } from './cache.js';
import { SEASON_START } from '../../src/utils/dateChunks.js';
import { getTeamBySlug, TEAMS } from '../../src/data/teams.js';
import { getTeamSlug } from '../../src/utils/teamSlug.js';
import { getSlugFromRankingsName } from '../../src/utils/rankingsNormalize.js';
import { buildSlugToIdFromRankings } from '../../src/utils/teamIdMap.js';
import { computeATSForEvent, aggregateATS } from '../../src/utils/ats.js';
import { matchOddsHistoryToEvent, mergeGamesWithOdds } from '../../src/api/odds.js';

const CACHE_MS = 20 * 60 * 1000; // 20 min
const homeSlowCache = createCache(CACHE_MS);

function toDateStr(d) {
  return d.toISOString().slice(0, 10);
}

function cacheKey(pinnedSlugs) {
  const slugPart = Array.isArray(pinnedSlugs) && pinnedSlugs.length > 0
    ? pinnedSlugs.slice(0, 20).join(',')
    : '';
  return `home:slow${slugPart ? `:${slugPart}` : ''}`;
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
    });
  }

  try {
    const today = toDateStr(new Date());
    const tomorrow = (() => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      return toDateStr(d).replace(/-/g, '');
    })();

    const [
      newsData,
      oddsData,
      oddsHistoryData,
      teamIdsData,
      rankingsData,
      pinnedNewsRaw,
      tomorrowScoresRaw,
    ] = await Promise.all([
      fetchNewsAggregateSource({ includeNational: true }),
      fetchOddsSource(),
      fetchOddsHistorySource(SEASON_START, today),
      fetchTeamIdsSource(),
      fetchRankingsSource(),
      pinnedSlugs.length > 0 ? Promise.all(pinnedSlugs.map((slug) => fetchTeamNewsSource(slug))) : Promise.resolve(null),
      fetchScoresSource(tomorrow),
    ]);

    const headlines = newsData?.items || [];
    const odds = {
      games: oddsData?.games ?? [],
      error: oddsData?.error,
      hasOddsKey: oddsData?.hasOddsKey !== false,
    };
    const oddsHistoryGames = oddsHistoryData?.games || [];
    const slugToId = teamIdsData?.slugToId || {};
    const rankings = rankingsData?.rankings || [];
    if (rankings.length > 0) {
      Object.assign(slugToId, buildSlugToIdFromRankings({ rankings }));
    }

    let atsLeaders = { best: [], worst: [] };
    if (rankings.length > 0 && oddsHistoryGames.length > 0) {
      const thirtyAgo = new Date();
      thirtyAgo.setDate(thirtyAgo.getDate() - 30);
      const sevenAgo = new Date();
      sevenAgo.setDate(sevenAgo.getDate() - 7);
      const teamSlugs = [];
      for (const r of rankings.slice(0, 18)) {
        const slug = getTeamSlug(r.teamName) ?? getSlugFromRankingsName(r.teamName, TEAMS);
        if (slug && slugToId[slug]) {
          const team = getTeamBySlug(slug);
          teamSlugs.push({ slug, name: team?.name ?? r.teamName });
        }
      }

      const results = await Promise.all(
        teamSlugs.map(async ({ slug, name }) => {
          const teamId = slugToId[slug];
          if (!teamId) return null;
          try {
            const sched = await fetchScheduleSource(teamId);
            const past = (sched?.events || []).filter((e) => e.isFinal).sort((a, b) => new Date(b.date) - new Date(a.date));
            if (past.length === 0) return null;
            const outcomes = past.map((ev) => {
              const oddsMatch = matchOddsHistoryToEvent(ev, oddsHistoryGames, name);
              return computeATSForEvent(ev, oddsMatch, name);
            });
            const withDate = past.map((ev, i) => ({ ev, outcome: outcomes[i], date: ev.date }));
            const seasonOut = withDate
              .filter(({ date }) => date && new Date(date) >= new Date(SEASON_START))
              .map(({ outcome }) => outcome)
              .filter(Boolean);
            const last30Out = withDate
              .filter(({ date }) => date && new Date(date) >= thirtyAgo)
              .map(({ outcome }) => outcome)
              .filter(Boolean);
            const last7Out = withDate
              .filter(({ date }) => date && new Date(date) >= sevenAgo)
              .map(({ outcome }) => outcome)
              .filter(Boolean);
            return {
              slug,
              name,
              season: aggregateATS(seasonOut),
              last30: aggregateATS(last30Out),
              last7: aggregateATS(last7Out),
            };
          } catch {
            return null;
          }
        })
      );

      const rows = results.filter(Boolean);
      const sorted = [...rows]
        .map((r) => ({ ...r, rec: r.season }))
        .filter((r) => r.rec?.total > 0)
        .sort((a, b) => (b.rec.coverPct ?? 0) - (a.rec.coverPct ?? 0));
      atsLeaders = {
        best: sorted.slice(0, 10),
        worst: sorted.slice(-10).reverse(),
      };
    }

    setAtsLeaders(atsLeaders);
    const atsLeadersCount = atsLeaders.best.length + atsLeaders.worst.length;
    console.log('[api/home/slow] atsLeaders written to cache, count:', atsLeadersCount);
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
      atsLeaders,
      pinnedTeamNews,
      upcomingGamesWithSpreads,
      slowDataStatus,
      atsLeadersCount,
      atsCacheWrite: true,
    };

    homeSlowCache.set(key, payload);
    res.status(200).json(payload);
  } catch (err) {
    console.error('[api/home/slow] error:', err.message);
    res.status(200).json({
      headlines: [],
      odds: { games: [], error: null, hasOddsKey: false },
      oddsHistory: { games: [] },
      atsLeaders: { best: [], worst: [] },
      pinnedTeamNews: {},
      upcomingGamesWithSpreads: [],
      slowDataStatus: {
        headlinesCount: 0,
        oddsCount: 0,
        oddsHistoryCount: 0,
        atsLeadersCount: 0,
        dataStatusLine: 'Slow fetch failed.',
      },
      atsLeadersCount: 0,
      atsCacheWrite: false,
    });
  }
}
