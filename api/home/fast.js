/**
 * Fast Home data. GET /api/home/fast
 * Query: ?pinnedSlugs=slug1,slug2 (optional).
 * Returns: scoresToday, scoresYesterday, rankingsTop25, atsLeaders, headlines, pinnedTeamsMeta, dataStatus.
 * ATS + headlines from shared cache; if cache empty return empty and trigger non-blocking refresh.
 * Cache: 2 min.
 */

import { createCache, buildCacheMeta } from '../_cache.js';
import { fetchScoresSource, fetchRankingsSource, fetchNewsAggregateSource } from '../_sources.js';
import { getTeamBySlug } from '../../src/data/teams.js';
import { getHeadlines, setHeadlines, getAtsUnavailableReason, setAtsUnavailableReason } from './cache.js';
import { getAtsLeadersPipeline } from './atsPipeline.js';
import { getQueryParam, getRequestUrl } from '../_requestUrl.js';

const CACHE_MS = 2 * 60 * 1000; // 2 min
const homeFastCache = createCache(CACHE_MS);
const isDev = typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production';

let inFlightAtsWarm = false;

function warmAtsCache() {
  if (isDev) console.log('[api/home/fast] ATS warmer start');
  getAtsLeadersPipeline()
    .then((result) => {
      if (result.unavailableReason) setAtsUnavailableReason(result.unavailableReason);
      if (isDev) console.log('[api/home/fast] ATS warmer end', (result?.best?.length || 0) + (result?.worst?.length || 0), 'leaders', result.unavailableReason ? `(${result.unavailableReason})` : '');
    })
    .catch((err) => console.error('[api/home/fast] ATS warmer error:', err?.message));
}

function runFallbackAtsWarm() {
  if (isDev) console.log('[api/home/fast] ATS fallback job start');
  getAtsLeadersPipeline()
    .then((result) => {
      if (result.unavailableReason) setAtsUnavailableReason(result.unavailableReason);
      if (isDev) console.log('[api/home/fast] ATS fallback end', (result?.best?.length || 0) + (result?.worst?.length || 0), 'leaders', result.unavailableReason || '');
    })
    .catch((err) => {
      console.error('[api/home/fast] ATS fallback error:', err?.message);
    })
    .finally(() => {
      inFlightAtsWarm = false;
    });
}

function warmHeadlinesCache() {
  if (isDev) console.log('[api/home/fast] headlines warmer start');
  fetchNewsAggregateSource({ includeNational: true })
    .then((data) => {
      const items = data?.items || [];
      setHeadlines(items);
      if (isDev) console.log('[api/home/fast] headlines warmer end', items.length, 'items');
    })
    .catch((err) => console.error('[api/home/fast] headlines warmer error:', err?.message));
}

function fireWarmers(atsEmpty, headlinesEmpty) {
  if (atsEmpty) {
    setTimeout(() => { void warmAtsCache(); }, 0);
    setTimeout(() => {
      if (inFlightAtsWarm) return;
      inFlightAtsWarm = true;
      runFallbackAtsWarm();
    }, 2000);
  }
  if (headlinesEmpty) {
    setTimeout(() => { void warmHeadlinesCache(); }, 0);
  }
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
  res.setHeader('Cache-Control', 'public, s-maxage=90, stale-while-revalidate=300');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const url = getRequestUrl(req);
  const pinnedSlugsFromGetAll = url.searchParams.getAll('pinnedSlugs');
  const pinnedSlugsParam = pinnedSlugsFromGetAll.length > 0
    ? pinnedSlugsFromGetAll.join(',')
    : getQueryParam(req, 'pinnedSlugs');
  const pinnedSlugs = typeof pinnedSlugsParam === 'string' && pinnedSlugsParam.trim()
    ? pinnedSlugsParam.split(',').map((s) => s.trim()).filter(Boolean)
    : [];
  const atsWindowParam = getQueryParam(req, 'atsWindow');
  const atsWindow = (atsWindowParam === 'last7' || atsWindowParam === 'season') ? atsWindowParam : 'last30';

  const key = cacheKey(pinnedSlugs) + (atsWindow !== 'last30' ? `:${atsWindow}` : '');
  const cached = homeFastCache.get(key);
  if (cached) {
    const atsCount = (cached.atsLeaders?.best?.length || 0) + (cached.atsLeaders?.worst?.length || 0);
    const atsMeta = cached.atsMeta ?? { status: atsCount > 0 ? 'FULL' : 'EMPTY', reason: cached.atsUnavailableReason ?? null, sourceLabel: cached.atsLeadersSourceLabel ?? null, confidence: atsCount > 0 ? 'high' : 'low', generatedAt: cached.generatedAt ?? new Date().toISOString() };
    const meta = buildCacheMeta({ hit: true, ageMs: null, stale: false }, { sourceLabel: cached.atsLeadersSourceLabel ?? atsMeta.sourceLabel ?? null });
    return res.status(200).json({
      ...cached,
      atsMeta,
      atsWindow: cached.atsWindow ?? atsWindow,
      seasonWarming: cached.seasonWarming,
      _cached: true,
      atsLeadersCount: cached.atsLeadersCount ?? atsCount,
      atsWarming: false,
      headlinesWarming: cached.headlinesWarming ?? false,
      atsLeadersTimestamp: cached.atsLeadersTimestamp ?? null,
      atsLeadersSourceLabel: cached.atsLeadersSourceLabel ?? null,
      generatedAt: meta.generatedAt,
      cache: meta.cache,
      partial: meta.partial,
      sourceLabel: meta.sourceLabel,
    });
  }

  try {
    const today = toDateStr(new Date());
    const yesterday = (() => {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      return toDateStr(d);
    })();

    const [scoresTodayRaw, scoresYesterdayRaw, rankingsData, atsResult] = await Promise.all([
      fetchScoresSource(),
      fetchScoresSource(yesterday.replace(/-/g, '')),
      fetchRankingsSource(),
      getAtsLeadersPipeline({ pinnedSlugs, atsWindow }),
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

    const atsLeaders = { best: atsResult.best || [], worst: atsResult.worst || [] };
    const atsCount = atsLeaders.best.length + atsLeaders.worst.length;
    const atsMeta = atsResult.atsMeta ?? {
      status: atsCount > 0 ? 'FULL' : 'EMPTY',
      reason: getAtsUnavailableReason() || (atsCount === 0 ? 'cold_start' : null),
      sourceLabel: atsResult.sourceLabel ?? null,
      confidence: atsCount > 0 ? 'high' : 'low',
      generatedAt: new Date().toISOString(),
      cacheNote: atsResult.atsMeta?.cacheNote ?? 'computed_fallback',
    };
    if (atsResult.atsMeta?.cacheNote) atsMeta.cacheNote = atsResult.atsMeta.cacheNote;
    const atsWindowOut = atsResult.atsWindow ?? atsWindow;
    const seasonWarming = atsResult.seasonWarming === true;
    let headlines = getHeadlines();
    const headlinesEmpty = !Array.isArray(headlines) || headlines.length === 0;
    if (headlinesEmpty) headlines = [];
    fireWarmers(atsCount === 0, headlinesEmpty);
    const atsWarming = false;
    const atsLeadersTimestamp = atsMeta.generatedAt ?? null;
    const atsLeadersSourceLabel = atsMeta.sourceLabel ?? atsResult.sourceLabel ?? null;
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

    const cacheMeta = buildCacheMeta(
      { hit: atsCount > 0, ageMs: null, stale: false },
      { sourceLabel: atsLeadersSourceLabel ?? null, partial: atsCount === 0 && (rankingsTop25.length > 0 || scoresToday.length > 0), errors: atsMeta.reason ? [atsMeta.reason] : [] }
    );
    const payload = {
      scoresToday,
      scoresYesterday,
      rankingsTop25,
      rankings: { rankings: rankingsTop25 },
      atsLeaders: { best: atsLeaders.best || [], worst: atsLeaders.worst || [] },
      atsMeta,
      atsWindow: atsWindowOut,
      seasonWarming: seasonWarming || undefined,
      headlines,
      pinnedTeamsMeta,
      dataStatus,
      atsLeadersCount: atsCount,
      atsWarming,
      headlinesWarming: headlinesEmpty,
      atsLeadersTimestamp,
      atsLeadersSourceLabel,
      generatedAt: cacheMeta.generatedAt,
      cache: cacheMeta.cache,
      partial: cacheMeta.partial,
      sourceLabel: cacheMeta.sourceLabel,
      ...(cacheMeta.errors?.length ? { errors: cacheMeta.errors } : {}),
    };

    homeFastCache.set(key, payload);
    res.status(200).json(payload);
  } catch (err) {
    console.error('[api/home/fast] error:', err.message);
    fireWarmers(true, true);
    const atsMeta = { status: 'EMPTY', reason: 'fast_fetch_failed', sourceLabel: null, confidence: 'low', generatedAt: new Date().toISOString() };
    res.status(200).json({
      scoresToday: [],
      scoresYesterday: [],
      rankingsTop25: [],
      rankings: { rankings: [] },
      atsLeaders: { best: [], worst: [] },
      atsMeta,
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
      atsWarming: false,
      headlinesWarming: true,
    });
  }
}
