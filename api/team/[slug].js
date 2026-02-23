/**
 * Batch endpoint for Team page: schedule + odds history + team news + rank in one round trip.
 * GET /api/team/:slug
 * Returns: { schedule, oddsHistory, teamNews, rank }.
 * ATS can be computed client-side from schedule + oddsHistory.
 */

import { SEASON_START } from '../../src/utils/dateChunks.js';
import { buildSlugToRankMap } from '../../src/utils/rankingsNormalize.js';
import { TEAMS } from '../../src/data/teams.js';

function getBaseUrl(req) {
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  const host = req.headers?.host || 'localhost:3000';
  const proto = req.headers?.['x-forwarded-proto'] === 'https' ? 'https' : 'http';
  return `${proto}://${host}`;
}

function getSlugFromReq(req) {
  const url = req.url || '';
  const match = url.match(/\/api\/team\/([^/?]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const slug = getSlugFromReq(req);
  if (!slug) {
    return res.status(400).json({ error: 'Missing slug' });
  }

  const baseUrl = getBaseUrl(req);
  const today = new Date().toISOString().slice(0, 10);

  if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development') {
    console.time(`[api/team] ${slug}`);
  }

  try {
    const [teamIdsRes, rankingsRes, newsRes] = await Promise.all([
      fetch(`${baseUrl}/api/teamIds`, { headers: { Accept: 'application/json' } }),
      fetch(`${baseUrl}/api/rankings`, { headers: { Accept: 'application/json' } }),
      fetch(`${baseUrl}/api/news/team/${encodeURIComponent(slug)}`, { headers: { Accept: 'application/json' } }),
    ]);

    const slugToId = teamIdsRes.ok ? (await teamIdsRes.json())?.slugToId || {} : {};
    const teamId = slugToId[slug] || null;

    let schedule = { events: [] };
    let oddsHistory = { games: [] };

    if (teamId) {
      const [scheduleRes, historyRes] = await Promise.all([
        fetch(`${baseUrl}/api/schedule/${teamId}`, { headers: { Accept: 'application/json' } }),
        fetch(`${baseUrl}/api/odds-history?from=${SEASON_START}&to=${today}`, { headers: { Accept: 'application/json' } }),
      ]);
      if (scheduleRes.ok) {
        schedule = await scheduleRes.json();
      }
      if (historyRes.ok) {
        oddsHistory = await historyRes.json();
      }
    }

    const rankings = rankingsRes.ok ? (await rankingsRes.json())?.rankings || [] : [];
    const rankMap = buildSlugToRankMap({ rankings }, TEAMS);
    const rank = rankMap[slug] ?? null;

    const teamNews = newsRes.ok ? (await newsRes.json())?.headlines || [] : [];

    if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development') {
      console.timeEnd(`[api/team] ${slug}`);
    }

    res.status(200).json({
      schedule,
      oddsHistory,
      teamNews,
      rank,
      teamId,
    });
  } catch (err) {
    console.error(`[api/team] ${slug} error:`, err.message);
    if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development') {
      console.timeEnd(`[api/team] ${slug}`);
    }
    res.status(200).json({
      schedule: { events: [] },
      oddsHistory: { games: [] },
      teamNews: [],
      rank: null,
      teamId: null,
    });
  }
}
