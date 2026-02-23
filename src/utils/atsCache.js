/**
 * In-memory cache for ATS results per team slug.
 * TTL 7 minutes — return instantly when cache hit.
 * Shape: { season, last30, last7 } (each { w, l, p, total, coverPct } or null).
 */

const CACHE_TTL_MS = 7 * 60 * 1000; // 7 min
const store = new Map(); // slug -> { data, expires }

export function getAtsCache(slug) {
  if (!slug) return null;
  const entry = store.get(slug);
  if (!entry || Date.now() > entry.expires) return null;
  return entry.data;
}

export function setAtsCache(slug, data) {
  if (!slug || !data) return;
  store.set(slug, { data, expires: Date.now() + CACHE_TTL_MS });
}
