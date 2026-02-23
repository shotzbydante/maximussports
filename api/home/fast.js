/**
 * Fast Home data. GET /api/home/fast
 * Query: ?pinnedSlugs=slug1,slug2 (optional).
 * Returns: scoresToday, scoresYesterday, rankingsTop25, atsLeaders (empty), pinnedTeamsMeta, dataStatus.
 * Cache: 2 min. No odds, no news, no ATS computation.
 */

import { createCache } from '../_cache.js';
import { fetchScoresSource, fetchRankingsSource } from '../_sources.js';
import { getTeamBySlug } from '../../src/data/teams.js';

const CACHE_MS = 2 * 60 * 1000; // 2 min
const homeFastCache = createCache(CACHE_MS);

function toDateStr(d) {
  return d.toISOString().slice(0, 10);
}

function cacheKey(pinnedSlugs) {
  const slugPart = Array.isArray(pinnedSlugs) && pinnedSlugs.length > 0
    ? pinnedSlugs.slice(0, 20).join(',')
    : '';
  return `home:fast${slugPart ? `:${slugPart}` : ''}`;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const pinnedSlugsParam = req.query?.pinnedSlugs;
  const pinnedSlugs = typeof pinnedSlugsParam === 'string' && pinnedSlugsParam.trim()
    ? pinnedSlugsParam.split(',').map((s) => s.trim()).filter(Boolean)
    : [];

  const key = cacheKey(pinnedSlugs);
  const cached = homeFastCache.get(key);
  if (cached) {
    return res.status(200).json({ ...cached, _cached: true });
  }

  try {
    const today = toDateStr(new Date());
    const yesterday = (() => {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      return toDateStr(d);
    })();

    const [scoresTodayRaw, scoresYesterdayRaw, rankingsData] = await Promise.all([
      fetchScoresSource(),
      fetchScoresSource(yesterday.replace(/-/g, '')),
      fetchRankingsSource(),
    ]);

    const scoresToday = Array.isArray(scoresTodayRaw) ? scoresTodayRaw : [];
    const scoresYesterday = Array.isArray(scoresYesterdayRaw) ? scoresYesterdayRaw : [];
    const rankings = rankingsData?.rankings || [];
    const rankingsTop25 = Array.isArray(rankings) ? rankings.slice(0, 25) : [];

    const pinnedTeamsMeta = pinnedSlugs.map((slug) => {
      const team = getTeamBySlug(slug);
      return {
        slug,
        name: team?.name ?? slug,
        tier: team?.oddsTier ?? null,
      };
    });

    const dataStatus = {
      scoresCount: scoresToday.length,
      scoresYesterdayCount: scoresYesterday.length,
      rankingsCount: rankingsTop25.length,
      dataStatusLine: [
        `Scores: ${scoresToday.length > 0 ? `OK (${scoresToday.length})` : 'MISSING'}`,
        `Top 25: ${rankingsTop25.length > 0 ? `OK (${rankingsTop25.length})` : 'MISSING'}`,
      ].join('. '),
    };

    const payload = {
      scoresToday,
      scoresYesterday,
      rankingsTop25,
      rankings: { rankings: rankingsTop25 },
      atsLeaders: { best: [], worst: [] },
      pinnedTeamsMeta,
      dataStatus,
    };

    homeFastCache.set(key, payload);
    res.status(200).json(payload);
  } catch (err) {
    console.error('[api/home/fast] error:', err.message);
    res.status(200).json({
      scoresToday: [],
      scoresYesterday: [],
      rankingsTop25: [],
      rankings: { rankings: [] },
      atsLeaders: { best: [], worst: [] },
      pinnedTeamsMeta: [],
      dataStatus: {
        scoresCount: 0,
        scoresYesterdayCount: 0,
        rankingsCount: 0,
        dataStatusLine: 'Fast fetch failed.',
      },
    });
  }
}
