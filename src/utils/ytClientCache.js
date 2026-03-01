/**
 * Module-level in-memory cache for team video results.
 * Survives component unmount/remount during client-side navigation.
 * TTL: 5 minutes per team slug.
 */

const TTL_MS = 5 * 60 * 1000;

/** @type {Map<string, { data: any[], ts: number }>} */
const cache = new Map();

/**
 * Return cached items for teamSlug if fresh, otherwise null.
 * @param {string} teamSlug
 * @returns {any[]|null}
 */
export function getCachedVideos(teamSlug) {
  const entry = cache.get(teamSlug);
  if (!entry) return null;
  if (Date.now() - entry.ts > TTL_MS) {
    cache.delete(teamSlug);
    return null;
  }
  return entry.data;
}

/**
 * Store items for teamSlug with current timestamp.
 * @param {string} teamSlug
 * @param {any[]} data
 */
export function setCachedVideos(teamSlug, data) {
  cache.set(teamSlug, { data, ts: Date.now() });
}
