/**
 * Shared server-side cache for ATS leaders and headlines.
 * Single module = single cache instance. Used by:
 * - /api/home/fast: read (getAtsLeaders, getHeadlines) + write via warmers (setAtsLeaders, setHeadlines)
 * - /api/home/slow: write after computing (setAtsLeaders, setHeadlines)
 * Warmers in fast write into this same cache so the next fast request gets warm data.
 */

import { createCache } from '../_cache.js';

const ATS_TTL_MS = 10 * 60 * 1000;  // 10 min
const HEADLINES_TTL_MS = 5 * 60 * 1000;  // 5 min
const ATS_UNAVAILABLE_TTL_MS = 2 * 60 * 1000;  // 2 min

const atsCache = createCache(ATS_TTL_MS);
const headlinesCache = createCache(HEADLINES_TTL_MS);
const atsUnavailableCache = createCache(ATS_UNAVAILABLE_TTL_MS);

const ATS_KEY = 'home:atsLeaders';
const HEADLINES_KEY = 'home:headlines';
const ATS_UNAVAILABLE_KEY = 'home:atsUnavailableReason';

/**
 * Cached value: { best, worst, timestamp?, source?, sourceLabel? }
 */
export function getAtsLeaders() {
  const cached = atsCache.get(ATS_KEY);
  if (!cached) return { best: [], worst: [] };
  return {
    best: cached.best || [],
    worst: cached.worst || [],
    timestamp: cached.timestamp ?? null,
    source: cached.source ?? null,
    sourceLabel: cached.sourceLabel ?? null,
  };
}

export function setAtsLeaders(atsLeaders) {
  if (!atsLeaders) return;
  const best = atsLeaders.best || [];
  const worst = atsLeaders.worst || [];
  if (best.length > 0 || worst.length > 0) {
    atsCache.set(ATS_KEY, {
      best,
      worst,
      timestamp: Date.now(),
      source: atsLeaders.source ?? null,
      sourceLabel: atsLeaders.sourceLabel ?? null,
    });
    atsUnavailableCache.set(ATS_UNAVAILABLE_KEY, null);
  }
}

export function getAtsUnavailableReason() {
  return atsUnavailableCache.get(ATS_UNAVAILABLE_KEY) ?? null;
}

export function setAtsUnavailableReason(reason) {
  if (reason) atsUnavailableCache.set(ATS_UNAVAILABLE_KEY, reason);
}

export function getHeadlines() {
  const items = headlinesCache.get(HEADLINES_KEY);
  return Array.isArray(items) ? items : [];
}

export function setHeadlines(items) {
  if (Array.isArray(items) && items.length > 0) {
    headlinesCache.set(HEADLINES_KEY, items);
  }
}
