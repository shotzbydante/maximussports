/**
 * Fast Home data. GET /api/home/fast
 * Query: ?pinnedSlugs=slug1,slug2 (optional).
 * Returns: scoresToday, scoresYesterday, rankingsTop25, atsLeaders, headlines, pinnedTeamsMeta, dataStatus.
 * ATS + headlines from shared cache; if cache empty return empty and trigger non-blocking refresh.
 * Cache: 2 min.
 */

import { createCache } from '../_cache.js';
import { fetchScoresSource, fetchRankingsSource, fetchNewsAggregateSource } from '../_sources.js';
import { getTeamBySlug } from '../../src/data/teams.js';
import { getAtsLeaders, setAtsLeaders, getHeadlines, setHeadlines } from './cache.js';
import { computeAtsLeadersFromSources } from './atsLeaders.js';

const CACHE_MS = 2 * 60 * 1000; // 2 min
const homeFastCache = createCache(CACHE_MS);

function warmAtsCache() {
  computeAtsLeadersFromSources()
    .then((ats) => setAtsLeaders(ats))
    .catch((err) => console.error('[api/home/fast] ATS warmer error:', err?.message));
}

function warmHeadlinesCache() {
  fetchNewsAggregateSource({ includeNational: true })
    .then((data) => setHeadlines(data?.items || []))
    .catch((err) => console.error('[api/home/fast] headlines warmer error:', err?.message));
}

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

    // ATS + headlines from shared cache; warm in background if missing
    let atsLeaders = getAtsLeaders();
    let headlines = getHeadlines();
    if ((!atsLeaders.best?.length && !atsLeaders.worst?.length)) {
      atsLeaders = { best: [], worst: [] };
      setImmediate(warmAtsCache);
    }
    if (!Array.isArray(headlines) || headlines.length === 0) {
      headlines = [];
      setImmediate(warmHeadlinesCache);
    }

    const atsCount = (atsLeaders.best?.length || 0) + (atsLeaders.worst?.length || 0);
    const dataStatus = {
      scoresCount: scoresToday.length,
      scoresYesterdayCount: scoresYesterday.length,
      rankingsCount: rankingsTop25.length,
      atsLeadersCount: atsCount,
      headlinesCount: headlines.length,
      dataStatusLine: [
        `Scores: ${scoresToday.length > 0 ? `OK (${scoresToday.length})` : 'MISSING'}`,
        `Top 25: ${rankingsTop25.length > 0 ? `OK (${rankingsTop25.length})` : 'MISSING'}`,
        `ATS: ${atsCount > 0 ? 'OK' : 'MISSING'}`,
        `Headlines: ${headlines.length > 0 ? `OK (${headlines.length})` : 'MISSING'}`,
      ].join('. '),
    };

    const payload = {
      scoresToday,
      scoresYesterday,
      rankingsTop25,
      rankings: { rankings: rankingsTop25 },
      atsLeaders,
      headlines,
      pinnedTeamsMeta,
      dataStatus,
    };

    homeFastCache.set(key, payload);
    res.status(200).json(payload);
  } catch (err) {
    console.error('[api/home/fast] error:', err.message);
    setImmediate(warmAtsCache);
    setImmediate(warmHeadlinesCache);
    res.status(200).json({
      scoresToday: [],
      scoresYesterday: [],
      rankingsTop25: [],
      rankings: { rankings: [] },
      atsLeaders: { best: [], worst: [] },
      headlines: [],
      pinnedTeamsMeta: [],
      dataStatus: {
        scoresCount: 0,
        scoresYesterdayCount: 0,
        rankingsCount: 0,
        atsLeadersCount: 0,
        headlinesCount: 0,
        dataStatusLine: 'Fast fetch failed.',
      },
    });
  }
}
