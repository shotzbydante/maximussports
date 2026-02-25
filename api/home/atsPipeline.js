/**
 * Single shared ATS pipeline. getAtsLeaders() used by /api/home, /api/home/fast, /api/home/slow, /api/ats/warm.
 * Cache TTL 10 min; coalesces concurrent fetches; returns stale when fresh unavailable (never blank when stale exists).
 */

import { coalesce } from '../_cache.js';
import { getAtsLeaders, setAtsLeaders, getAtsLeadersMaybeStale } from './cache.js';
import { computeAtsLeadersFromSources } from './atsLeaders.js';

const ATS_COALESCE_KEY = 'ats:leaders';

/**
 * Compute ATS from sources and write to cache. Used by warm and on cache miss.
 */
async function computeAndSet() {
  const result = await computeAtsLeadersFromSources();
  const { unavailableReason, ...ats } = result;
  const payload = {
    best: ats.best || [],
    worst: ats.worst || [],
    source: ats.source ?? null,
    sourceLabel: ats.sourceLabel ?? 'FULL_LEAGUE',
  };
  if ((payload.best.length || payload.worst.length) > 0) {
    setAtsLeaders(payload);
  }
  return { ...payload, unavailableReason };
}

/**
 * Get ATS leaders. Serves from cache when available; optionally compute (e.g. for cron warm).
 * Never hangs: on compute failure returns stale from cache or empty arrays.
 * @param {{ warm?: boolean }} options - warm: true = compute and populate cache (for /api/ats/warm)
 * @returns {Promise<{ best: array, worst: array, sourceLabel?: string, source?: string, fromCache?: boolean, stale?: boolean, ageMs?: number, unavailableReason?: string }>}
 */
export async function getAtsLeadersPipeline(options = {}) {
  const { warm = false } = options;
  const isDev = typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production';

  if (warm) {
    if (isDev) console.log('[atsPipeline] warm: computing and populating cache');
    const result = await computeAndSet();
    const count = (result.best?.length || 0) + (result.worst?.length || 0);
    if (isDev) console.log('[atsPipeline] warm done', { count, sourceLabel: result.sourceLabel });
    return { ...result, fromCache: false };
  }

  const cached = getAtsLeaders();
  const hasCached = (cached.best?.length || 0) + (cached.worst?.length || 0) > 0;
  if (hasCached) {
    if (isDev) console.log('[atsPipeline] cache hit', { best: cached.best?.length, worst: cached.worst?.length });
    return {
      best: cached.best || [],
      worst: cached.worst || [],
      sourceLabel: cached.sourceLabel ?? 'FULL_LEAGUE',
      source: cached.source ?? null,
      fromCache: true,
    };
  }

  try {
    const result = await coalesce(ATS_COALESCE_KEY, computeAndSet);
    const best = result.best || [];
    const worst = result.worst || [];
    if (isDev) console.log('[atsPipeline] computed', { best: best.length, worst: worst.length, sourceLabel: result.sourceLabel });
    return {
      best,
      worst,
      sourceLabel: result.sourceLabel ?? 'FULL_LEAGUE',
      source: result.source ?? null,
      fromCache: false,
      unavailableReason: result.unavailableReason,
    };
  } catch (err) {
    if (isDev) console.log('[atsPipeline] compute failed, serving stale if any', err?.message);
    const stale = getAtsLeadersMaybeStale();
    if (stale && ((stale.best?.length || 0) + (stale.worst?.length || 0) > 0)) {
      return {
        best: stale.best || [],
        worst: stale.worst || [],
        sourceLabel: stale.sourceLabel ?? 'FULL_LEAGUE',
        source: stale.source ?? null,
        fromCache: true,
        stale: true,
        ageMs: stale.ageMs,
      };
    }
    return {
      best: [],
      worst: [],
      sourceLabel: null,
      fromCache: false,
      unavailableReason: err?.message || 'ATS computation failed',
    };
  }
}
