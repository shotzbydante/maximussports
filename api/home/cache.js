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

const atsCache = createCache(ATS_TTL_MS);
const headlinesCache = createCache(HEADLINES_TTL_MS);

const ATS_KEY = 'home:atsLeaders';
const HEADLINES_KEY = 'home:headlines';

export function getAtsLeaders() {
  return atsCache.get(ATS_KEY) ?? { best: [], worst: [] };
}

export function setAtsLeaders(atsLeaders) {
  if (atsLeaders && (atsLeaders.best?.length > 0 || atsLeaders.worst?.length > 0)) {
    atsCache.set(ATS_KEY, { best: atsLeaders.best || [], worst: atsLeaders.worst || [] });
  }
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
