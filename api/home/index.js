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
import { getTeamBySlug } from '../../src/data/teams.js';
import { TEAMS } from '../../src/data/teams.js';
import { getTeamSlug } from '../../src/utils/teamSlug.js';
import { getSlugFromRankingsName } from '../../src/utils/rankingsNormalize.js';
import { buildSlugToIdFromRankings } from '../../src/utils/teamIdMap.js';
import { computeATSForEvent, aggregateATS } from '../../src/utils/ats.js';
import { matchOddsHistoryToEvent } from '../../src/api/odds.js';

function toDateStr(d) {
  return d.toISOString().slice(0, 10);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');

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

    const [
      scoresToday,
      rankingsData,
      oddsData,
      newsData,
      teamIdsData,
      oddsHistoryData,
      scoresByDateRaw,
      pinnedNewsRaw,
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

    let atsLeaders = { best: [], worst: [] };
    if (rankings.length > 0) {
      const thirtyAgo = new Date();
      thirtyAgo.setDate(thirtyAgo.getDate() - 30);
      const sevenAgo = new Date();
      sevenAgo.setDate(sevenAgo.getDate() - 7);
      const oddsGames = oddsHistoryData.games || [];
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
              const oddsMatch = matchOddsHistoryToEvent(ev, oddsGames, name);
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

    const payload = {
      scores: scoresArray,
      odds: { games: odds.games, error: odds.error, hasOddsKey: odds.hasOddsKey },
      oddsHistory: { games: oddsHistoryData?.games || [] },
      rankings: { rankings },
      headlines,
      atsLeaders,
      dataStatus,
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
    res.status(200).json({
      scores: [],
      odds: { games: [], error: null, hasOddsKey: false },
      rankings: { rankings: [] },
      headlines: [],
      atsLeaders: { best: [], worst: [] },
      dataStatus: {
        scoresCount: 0,
        rankingsCount: 0,
        oddsCount: 0,
        oddsHistoryCount: 0,
        headlinesCount: 0,
        dataStatusLine: 'Batch fetch failed.',
      },
    });
  }
}
