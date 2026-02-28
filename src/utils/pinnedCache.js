/**
 * Module-level in-memory cache for pinned team data.
 * Lives outside React, so it survives route-change unmount/remount cycles.
 * TTL: 5 minutes — after which a slug is considered stale and re-fetched.
 */

const PINNED_TTL_MS = 5 * 60 * 1000;

/** @type {Map<string, { data: unknown, fetchedAt: number }>} */
const _cache = new Map();

/** Return cached data if present and fresh, otherwise null. */
export function getPinnedCache(slug) {
  const entry = _cache.get(slug);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > PINNED_TTL_MS) {
    _cache.delete(slug);
    return null;
  }
  return entry.data;
}

/** Store data for a slug with the current timestamp. */
export function setPinnedCache(slug, data) {
  _cache.set(slug, { data, fetchedAt: Date.now() });
}

/** Return true if slug has a fresh (non-stale) cache entry. */
export function hasFreshPinnedCache(slug) {
  return getPinnedCache(slug) !== null;
}
