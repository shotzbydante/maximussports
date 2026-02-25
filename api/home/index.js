/**
 * Consolidated Home + Games data. GET /api/home
 * Query: ?dates=YYYYMMDD,YYYYMMDD (optional) for scores by date; ?pinnedSlugs=slug1,slug2 (optional) for pinned team news.
 * Returns: { scores, scoresByDate?, odds, rankings, oddsHistory?, atsLeaders, headlines, dataStatus, pinnedTeamNews? }
 * Uses _sources only (no HTTP to other APIs). Caching per section inside.
 */

import {
  fetchScoresSource,
  fetchRankingsSource,
  fetchOddsSource,
  fetchOddsHistorySource,
  fetchTeamIdsSource,
  fetchScheduleSource,
  fetchNewsAggregateSource,
  fetchTeamNewsSource,
} from '../_sources.js';
import { SEASON_START } from '../../src/utils/dateChunks.js';
import { buildSlugToIdFromRankings } from '../../src/utils/teamIdMap.js';
import { getAtsLeadersPipeline } from './atsPipeline.js';
import { getAtsLeadersMaybeStale } from './cache.js';
import { buildCacheMeta } from '../_cache.js';

function toDateStr(d) {
  return d.toISOString().slice(0, 10);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'public, s-maxage=90, stale-while-revalidate=300');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const datesParam = req.query?.dates;
  const pinnedSlugsParam = req.query?.pinnedSlugs;
  const dateStrs = typeof datesParam === 'string' && datesParam.trim()
    ? datesParam.split(',').map((d) => String(d).trim().replace(/-/g, '')).filter((d) => /^\d{8}$/.test(d))
    : null;
  const pinnedSlugs = typeof pinnedSlugsParam === 'string' && pinnedSlugsParam.trim()
    ? pinnedSlugsParam.split(',').map((s) => s.trim()).filter(Boolean)
    : [];

  try {
    const today = toDateStr(new Date());
    const yesterday = (() => {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      return toDateStr(d);
    })();

    const ATS_TIMEOUT_MS = 8000;
    const atsPromise = Promise.race([
      getAtsLeadersPipeline(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('ATS timeout')), ATS_TIMEOUT_MS)),
    ]).catch(() => {
      const stale = getAtsLeadersMaybeStale();
      return stale ? { best: stale.best || [], worst: stale.worst || [], sourceLabel: stale.sourceLabel, fromCache: true, stale: true } : { best: [], worst: [], sourceLabel: null };
    });

    const [
      scoresToday,
      rankingsData,
      oddsData,
      newsData,
      teamIdsData,
      oddsHistoryData,
      scoresByDateRaw,
      pinnedNewsRaw,
      atsResult,
    ] = await Promise.all([
      fetchScoresSource(),
      fetchRankingsSource(),
      fetchOddsSource(),
      fetchNewsAggregateSource({ includeNational: true }),
      fetchTeamIdsSource(),
      fetchOddsHistorySource(SEASON_START, today),
      dateStrs
        ? Promise.all(dateStrs.map((d) => fetchScoresSource(d)))
        : Promise.resolve(null),
      pinnedSlugs.length > 0
        ? Promise.all(pinnedSlugs.map((slug) => fetchTeamNewsSource(slug)))
        : Promise.resolve(null),
      atsPromise,
    ]);

    const scoresArray = Array.isArray(scoresToday) ? scoresToday : [];
    const rankings = rankingsData?.rankings || [];
    const odds = {
      games: oddsData?.games ?? [],
      error: oddsData?.error,
      hasOddsKey: oddsData?.hasOddsKey !== false,
    };
    const headlines = newsData?.items || [];
    const slugToId = teamIdsData?.slugToId || {};
    if (rankings.length > 0) {
      Object.assign(slugToId, buildSlugToIdFromRankings({ rankings }));
    }

    const atsLeaders = {
      best: atsResult?.best ?? [],
      worst: atsResult?.worst ?? [],
    };

    const dataStatus = {
      scoresCount: scoresArray.length,
      rankingsCount: rankings.length,
      oddsCount: odds.games.length,
      oddsHistoryCount: (oddsHistoryData?.games || []).length,
      headlinesCount: headlines.length,
      dataStatusLine: [
        `Top 25: ${rankings.length > 0 ? `OK (${rankings.length})` : 'MISSING'}`,
        `Scores: ${scoresArray.length > 0 ? `OK (${scoresArray.length})` : 'MISSING'}`,
        `Odds: ${odds.games.length > 0 ? `OK (${odds.games.length})` : 'MISSING'}`,
        `Headlines: ${headlines.length > 0 ? `OK (${headlines.length})` : 'MISSING'}`,
      ].join('. '),
    };

    const atsCount = (atsLeaders.best?.length || 0) + (atsLeaders.worst?.length || 0);
    const isDev = typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production';
    if (isDev) {
      console.log('[api/home] response', { atsLeadersCount: atsCount, fromCache: atsResult?.fromCache, stale: atsResult?.stale });
    }

    const cacheMeta = buildCacheMeta(
      { hit: !!atsResult?.fromCache, ageMs: atsResult?.ageMs ?? null, stale: !!atsResult?.stale },
      { sourceLabel: atsResult?.sourceLabel ?? null, partial: atsCount === 0 && (rankings.length > 0 || scoresArray.length > 0), errors: atsResult?.unavailableReason ? [atsResult.unavailableReason] : [] }
    );

    const payload = {
      scores: scoresArray,
      odds: { games: odds.games, error: odds.error, hasOddsKey: odds.hasOddsKey },
      oddsHistory: { games: oddsHistoryData?.games || [] },
      rankings: { rankings },
      headlines,
      atsLeaders,
      dataStatus,
      generatedAt: cacheMeta.generatedAt,
      cache: cacheMeta.cache,
      partial: cacheMeta.partial,
      sourceLabel: cacheMeta.sourceLabel,
      ...(cacheMeta.errors?.length ? { errors: cacheMeta.errors } : {}),
    };

    if (scoresByDateRaw && dateStrs && dateStrs.length > 0) {
      const scoresByDate = {};
      dateStrs.forEach((d, i) => {
        scoresByDate[d] = Array.isArray(scoresByDateRaw[i]) ? scoresByDateRaw[i] : [];
      });
      payload.scoresByDate = scoresByDate;
    }

    if (pinnedNewsRaw && pinnedSlugs.length > 0) {
      const pinnedTeamNews = {};
      pinnedSlugs.forEach((slug, i) => {
        const data = pinnedNewsRaw[i];
        pinnedTeamNews[slug] = data?.headlines || [];
      });
      payload.pinnedTeamNews = pinnedTeamNews;
    }

    res.status(200).json(payload);
  } catch (err) {
    console.error('[api/home] error:', err.message);
    if (err?.stack) console.error('[api/home] stack', err.stack);
    const fallback = getAtsLeadersMaybeStale();
    const atsLeadersFallback = fallback ? { best: fallback.best || [], worst: fallback.worst || [] } : { best: [], worst: [] };
    const meta = buildCacheMeta({ hit: !!fallback, stale: !!fallback }, { partial: true, errors: [err.message] });
    res.status(200).json({
      scores: [],
      odds: { games: [], error: null, hasOddsKey: false },
      rankings: { rankings: [] },
      headlines: [],
      atsLeaders: atsLeadersFallback,
      dataStatus: {
        scoresCount: 0,
        rankingsCount: 0,
        oddsCount: 0,
        oddsHistoryCount: 0,
        headlinesCount: 0,
        dataStatusLine: 'Batch fetch failed.',
      },
      generatedAt: meta.generatedAt,
      cache: meta.cache,
      partial: true,
      errors: meta.errors,
    });
  }
}
