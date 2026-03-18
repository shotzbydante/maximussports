/**
 * Shared server-side cache for ATS leaders and headlines.
 * Single module = single cache instance. Used by:
 * - /api/home/fast: read (getAtsLeaders, getHeadlines) + write via warmers (setAtsLeaders, setHeadlines)
 * - /api/home/slow: write after computing (setAtsLeaders, setHeadlines)
 * Warmers in fast write into this same cache so the next fast request gets warm data.
 */

import { createCache } from '../_cache.js';

const ATS_TTL_MS = 15 * 60 * 1000;  // 15 min
const HEADLINES_TTL_MS = 5 * 60 * 1000;  // 5 min
const ATS_UNAVAILABLE_TTL_MS = 2 * 60 * 1000;  // 2 min

const atsCache = createCache(ATS_TTL_MS);
const headlinesCache = createCache(HEADLINES_TTL_MS);
const atsUnavailableCache = createCache(ATS_UNAVAILABLE_TTL_MS);

const ATS_KEY = 'home:atsLeaders';
const HEADLINES_KEY = 'home:headlines';
const ATS_UNAVAILABLE_KEY = 'home:atsUnavailableReason';

/**
 * Cached value: { best, worst, timestamp?, source?, sourceLabel?, status?, reason?, confidence?, generatedAt? }
 */
export function getAtsLeaders() {
  const cached = atsCache.get(ATS_KEY);
  if (!cached) return { best: [], worst: [], atsMeta: null };
  const atsMeta = {
    status: cached.status ?? (cached.best?.length || cached.worst?.length ? 'FULL' : 'EMPTY'),
    reason: cached.reason ?? null,
    sourceLabel: cached.sourceLabel ?? null,
    confidence: cached.confidence ?? (cached.status === 'FULL' ? 'high' : cached.status === 'FALLBACK' ? 'medium' : 'low'),
    generatedAt: cached.generatedAt ?? null,
  };
  return {
    best: cached.best || [],
    worst: cached.worst || [],
    timestamp: cached.timestamp ?? null,
    source: cached.source ?? null,
    sourceLabel: cached.sourceLabel ?? null,
    atsMeta,
  };
}

/**
 * Return ATS from cache even if expired (stale-while-revalidate). Safe fallback when fresh unavailable.
 */
export function getAtsLeadersMaybeStale() {
  const entry = atsCache.getMaybeStale(ATS_KEY);
  if (!entry?.value) return null;
  const cached = entry.value;
  const atsMeta = {
    status: cached.status ?? (cached.best?.length || cached.worst?.length ? 'FULL' : 'EMPTY'),
    reason: cached.reason ?? null,
    sourceLabel: cached.sourceLabel ?? null,
    confidence: cached.confidence ?? (cached.status === 'FULL' ? 'high' : cached.status === 'FALLBACK' ? 'medium' : 'low'),
    generatedAt: cached.generatedAt ?? null,
  };
  return {
    best: cached.best || [],
    worst: cached.worst || [],
    timestamp: cached.timestamp ?? null,
    source: cached.source ?? null,
    sourceLabel: cached.sourceLabel ?? null,
    atsMeta,
    ageMs: entry.ageMs,
    stale: entry.stale,
  };
}

/**
 * Whether the cache currently has a result we should not overwrite with EMPTY.
 */
export function hasAtsFallbackOrFull() {
  const cached = atsCache.get(ATS_KEY);
  if (!cached) return false;
  const status = cached.status ?? (cached.best?.length || cached.worst?.length ? 'FULL' : 'EMPTY');
  return status === 'FALLBACK' || status === 'FULL' || (cached.best?.length || 0) + (cached.worst?.length || 0) > 0;
}

/**
 * Store ATS leaders and meta. Does not overwrite existing FALLBACK/FULL with EMPTY (keeps last good cache).
 */
export function setAtsLeaders(atsLeaders) {
  if (!atsLeaders) return;
  const best = atsLeaders.best || [];
  const worst = atsLeaders.worst || [];
  const status = atsLeaders.status ?? (best.length || worst.length ? 'FULL' : 'EMPTY');
  if (status === 'EMPTY' && (best.length === 0 && worst.length === 0) && hasAtsFallbackOrFull()) {
    return;
  }
  const now = new Date().toISOString();
  atsCache.set(ATS_KEY, {
    best,
    worst,
    timestamp: Date.now(),
    source: atsLeaders.source ?? null,
    sourceLabel: atsLeaders.sourceLabel ?? null,
    status,
    reason: atsLeaders.reason ?? null,
    confidence: atsLeaders.confidence ?? (status === 'FULL' ? 'high' : status === 'FALLBACK' ? 'medium' : 'low'),
    generatedAt: atsLeaders.generatedAt ?? now,
  });
  if (atsLeaders.reason) {
    atsUnavailableCache.set(ATS_UNAVAILABLE_KEY, atsLeaders.reason);
  } else if (best.length > 0 || worst.length > 0) {
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
