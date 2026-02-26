/**
 * Consolidated Team page data. GET /api/team/:slug
 * Returns: { team, schedule, oddsHistory, teamNews, rank, teamId, tier }
 * Uses _sources only (no HTTP to other APIs).
 */

import { fetchRankingsSource, fetchTeamIdsSource, fetchTeamNewsSource, fetchScheduleSource, fetchOddsHistorySource } from '../_sources.js';
import { SEASON_START } from '../../src/utils/dateChunks.js';
import { buildSlugToRankMap } from '../../src/utils/rankingsNormalize.js';
import { getTeamBySlug, TEAMS } from '../../src/data/teams.js';

function getSlugFromReq(req) {
  const urlObj = new URL(req.url || '/', 'http://localhost');
  const segments = urlObj.pathname.split('/').filter(Boolean);
  const slug = segments[2];
  return slug ? decodeURIComponent(slug) : null;
}

function toDateStr(d) {
  return d.toISOString().slice(0, 10);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const slug = getSlugFromReq(req);
  if (!slug) return res.status(400).json({ error: 'Missing slug' });

  const team = getTeamBySlug(slug);
  const tier = team?.oddsTier ?? null;

  try {
    const today = toDateStr(new Date());
    const [teamIdsData, rankingsData, newsRes] = await Promise.all([
      fetchTeamIdsSource(),
      fetchRankingsSource(),
      fetchTeamNewsSource(slug),
    ]);

    const slugToId = teamIdsData?.slugToId || {};
    const teamId = slugToId[slug] || null;

    let schedule = { events: [] };
    let oddsHistory = { games: [] };

    if (teamId) {
      const [schedRes, historyRes] = await Promise.all([
        fetchScheduleSource(teamId),
        fetchOddsHistorySource(SEASON_START, today),
      ]);
      schedule = schedRes || { events: [] };
      oddsHistory = historyRes?.games != null ? { games: historyRes.games } : { games: [] };
    }

    const rankings = rankingsData?.rankings || [];
    const rankMap = buildSlugToRankMap({ rankings }, TEAMS);
    const rank = rankMap[slug] ?? null;
    const teamNews = newsRes?.headlines || [];

    res.status(200).json({
      team: team ? { name: team.name, conference: team.conference, oddsTier: team.oddsTier, slug: team.slug } : null,
      schedule,
      oddsHistory,
      teamNews,
      rank,
      teamId,
      tier,
    });
  } catch (err) {
    console.error(`[api/team] ${slug} error:`, err.message);
    res.status(200).json({
      team: team ? { name: team.name, conference: team.conference, oddsTier: team.oddsTier, slug: team.slug } : null,
      schedule: { events: [] },
      oddsHistory: { games: [] },
      teamNews: [],
      rank: null,
      teamId: null,
      tier,
    });
  }
}
