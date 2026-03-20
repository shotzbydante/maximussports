/**
 * Batched team data. GET /api/team/batch?slugs=slug1,slug2,...
 * Max 5 slugs per request. Returns schedule + ats + headlines (teamNews) per slug.
 * Cache: 5–10 min. Used for pinned teams only after initial Home render.
 */

import { createCache } from '../_cache.js';
import {
  fetchRankingsSource,
  fetchTeamIdsSource,
  fetchTeamNewsSource,
  fetchScheduleSource,
  fetchOddsHistorySource,
} from '../_sources.js';
import { SEASON_START } from '../../src/utils/dateChunks.js';
import { buildSlugToRankMap } from '../../src/utils/rankingsNormalize.js';
import { buildSlugToIdFromRankings } from '../../src/utils/teamIdMap.js';
import { getTeamBySlug, TEAMS } from '../../src/data/teams.js';
import { computeATSForEvent, aggregateATS } from '../../src/utils/ats.js';
import { matchOddsHistoryToEvent } from '../../src/api/odds.js';
import { getQueryParam, getRequestUrl } from '../_requestUrl.js';

const CACHE_MS = 7 * 60 * 1000; // 7 min
const MAX_SLUGS = 5;
const batchCache = createCache(CACHE_MS);

function toDateStr(d) {
  return d.toISOString().slice(0, 10);
}

const NCAA_TOURNEY_DATE = '2026-03-17';

function computeAts(schedule, oddsHistory, teamName) {
  const past = (schedule?.events || []).filter((e) => e.isFinal).sort((a, b) => new Date(b.date) - new Date(a.date));
  if (past.length === 0) return { season: null, last30: null, last7: null, preNcaaLast10: null };
  const oddsGames = oddsHistory?.games ?? [];
  const thirtyAgo = new Date();
  thirtyAgo.setDate(thirtyAgo.getDate() - 30);
  const sevenAgo = new Date();
  sevenAgo.setDate(sevenAgo.getDate() - 7);
  const outcomes = past.map((ev) => {
    const odds = matchOddsHistoryToEvent(ev, oddsGames, teamName);
    return computeATSForEvent(ev, odds, teamName);
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
  const preNcaaLast10Out = withDate
    .filter(({ date }) => date && date.slice(0, 10) < NCAA_TOURNEY_DATE)
    .slice(0, 10)
    .map(({ outcome }) => outcome)
    .filter(Boolean);
  return {
    season: aggregateATS(seasonOut),
    last30: aggregateATS(last30Out),
    last7: aggregateATS(last7Out),
    preNcaaLast10: aggregateATS(preNcaaLast10Out),
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const url = getRequestUrl(req);
  const slugsFromGetAll = url.searchParams.getAll('slugs');
  const slugsParam = slugsFromGetAll.length > 0
    ? slugsFromGetAll.join(',')
    : getQueryParam(req, 'slugs');
  const slugs = typeof slugsParam === 'string' && slugsParam.trim()
    ? slugsParam.split(',').map((s) => s.trim()).filter(Boolean).slice(0, MAX_SLUGS)
    : [];
  const isDev = typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production';
  if (isDev) console.log('[api/team/batch] parsed', { slugs });
  if (slugs.length === 0) {
    return res.status(200).json({ teams: {} });
  }

  const cacheKey = `team:batch:${slugs.slice().sort().join(',')}`;
  const cached = batchCache.get(cacheKey);
  if (cached) {
    return res.status(200).json({ ...cached, _cached: true });
  }

  try {
    const today = toDateStr(new Date());
    const [teamIdsData, rankingsData] = await Promise.all([
      fetchTeamIdsSource(),
      fetchRankingsSource(),
    ]);
    const slugToId = teamIdsData?.slugToId || {};
    const rankings = rankingsData?.rankings || [];
    if (rankings.length > 0) {
      Object.assign(slugToId, buildSlugToIdFromRankings({ rankings }));
    }
    const rankMap = buildSlugToRankMap({ rankings }, TEAMS);

    const results = await Promise.all(
      slugs.map(async (slug) => {
        const team = getTeamBySlug(slug);
        const teamId = slugToId[slug] || null;
        let schedule = { events: [] };
        let oddsHistory = { games: [] };
        let teamNews = [];
        if (teamId) {
          const [schedRes, historyRes, newsRes] = await Promise.all([
            fetchScheduleSource(teamId),
            fetchOddsHistorySource(SEASON_START, today),
            fetchTeamNewsSource(slug),
          ]);
          schedule = schedRes || { events: [] };
          oddsHistory = historyRes?.games != null ? { games: historyRes.games } : { games: [] };
          teamNews = newsRes?.headlines || [];
        }
        const ats = team ? computeAts(schedule, oddsHistory, team.name) : { season: null, last30: null, last7: null };
        const rank = rankMap[slug] ?? null;
        return {
          slug,
          team: team ? { name: team.name, conference: team.conference, oddsTier: team.oddsTier, slug: team.slug } : null,
          schedule,
          oddsHistory,
          teamNews,
          rank,
          ats,
        };
      })
    );

    const teams = {};
    results.forEach((r) => {
      teams[r.slug] = {
        team: r.team,
        schedule: r.schedule,
        oddsHistory: r.oddsHistory,
        teamNews: r.teamNews,
        rank: r.rank,
        ats: r.ats,
      };
    });

    const payload = { teams };
    batchCache.set(cacheKey, payload);
    res.status(200).json(payload);
  } catch (err) {
    console.error('[api/team/batch] error:', err.message);
    res.status(200).json({ teams: {} });
  }
}
