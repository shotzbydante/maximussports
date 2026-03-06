/**
 * Module-level in-memory cache for YouTube video results.
 * Survives component unmount/remount during client-side navigation.
 *
 * All cache entries support per-entry TTL via setCached(key, data, ttlMs).
 * Defaults to DEFAULT_TTL_MS (5 min).
 */

const DEFAULT_TTL_MS = 5 * 60 * 1000;

/** @type {Map<string, { data: any, ts: number, ttl: number }>} */
const cache = new Map();

// ─── Generic API ─────────────────────────────────────────────────────────────

/**
 * Return cached value for key if still within TTL, otherwise null.
 * @param {string} key
 * @returns {any|null}
 */
export function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > entry.ttl) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

/**
 * Return the age in milliseconds of a cache entry.
 * Returns Infinity if the key is missing or expired.
 * @param {string} key
 * @returns {number}
 */
export function getCacheAge(key) {
  const entry = cache.get(key);
  if (!entry) return Infinity;
  if (Date.now() - entry.ts > entry.ttl) {
    cache.delete(key);
    return Infinity;
  }
  return Date.now() - entry.ts;
}

/**
 * Store value under key with an optional TTL (defaults to 5 min).
 * @param {string} key
 * @param {any} data
 * @param {number} [ttlMs]
 */
export function setCached(key, data, ttlMs = DEFAULT_TTL_MS) {
  cache.set(key, { data, ts: Date.now(), ttl: ttlMs });
}

// ─── Team-specific helpers (backward compatible) ─────────────────────────────

/**
 * Return cached items for teamSlug if fresh, otherwise null.
 * @param {string} teamSlug
 * @returns {any[]|null}
 */
export function getCachedVideos(teamSlug) {
  return getCached(`team:${teamSlug}`);
}

/**
 * Return the age (ms) of the live video cache for teamSlug.
 * Returns Infinity when missing or expired.
 * @param {string} teamSlug
 * @returns {number}
 */
export function getCachedVideosAge(teamSlug) {
  return getCacheAge(`team:${teamSlug}`);
}

/**
 * Store items for teamSlug (5-min TTL).
 * @param {string} teamSlug
 * @param {any[]} data
 */
export function setCachedVideos(teamSlug, data) {
  setCached(`team:${teamSlug}`, data, DEFAULT_TTL_MS);
}

// ─── Intel feed stale helpers (6 h TTL) ──────────────────────────────────────

const INTEL_STALE_TTL_MS = 6 * 60 * 60 * 1000;
const INTEL_STALE_KEY    = 'yt:news:intelFeed:stale';

/**
 * Return the last-known-good intel feed list (up to 6 h old).
 * Used as a graceful fallback when a live fetch fails or returns empty.
 */
export function getStaleIntelFeed() {
  return getCached(INTEL_STALE_KEY);
}

/** Persist the intel feed as a last-known-good snapshot. */
export function setStaleIntelFeed(items) {
  setCached(INTEL_STALE_KEY, items, INTEL_STALE_TTL_MS);
}

/** Age in ms of the stale intel feed snapshot. Returns Infinity when missing. */
export function getStaleIntelFeedAge() {
  return getCacheAge(INTEL_STALE_KEY);
}

// ─── Home feed stale helpers (6 h TTL) ───────────────────────────────────────
// Mirrors the intel-feed stale pattern; used by the dashboard "Top Videos" widget.

const HOME_FEED_STALE_TTL_MS = 6 * 60 * 60 * 1000;
const HOME_FEED_STALE_KEY    = 'yt:home:topVideos:stale';

/** Return the last-known-good home feed video list (up to 6 h old). */
export function getStaleHomeFeedVideos() {
  return getCached(HOME_FEED_STALE_KEY);
}

/** Persist the home feed video list as a last-known-good snapshot. */
export function setStaleHomeFeedVideos(items) {
  setCached(HOME_FEED_STALE_KEY, items, HOME_FEED_STALE_TTL_MS);
}

/** Age in ms of the stale home feed snapshot. Returns Infinity when missing. */
export function getStaleHomeFeedVideosAge() {
  return getCacheAge(HOME_FEED_STALE_KEY);
}

// ─── Stale-while-revalidate helpers (24 h TTL) ───────────────────────────────

const STALE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Return the last-known-good video list for teamSlug (up to 24 h old).
 * Used as a graceful fallback when a live fetch fails or returns empty.
 * @param {string} teamSlug
 * @returns {any[]|null}
 */
export function getStaleVideos(teamSlug) {
  return getCached(`team:stale:${teamSlug}`);
}

/**
 * Return the age (ms) of the stale video cache for teamSlug.
 * @param {string} teamSlug
 * @returns {number}
 */
export function getStaleVideosAge(teamSlug) {
  return getCacheAge(`team:stale:${teamSlug}`);
}

/**
 * Persist a last-known-good video list with a 24 h TTL.
 * Call this alongside setCachedVideos whenever a successful non-empty fetch arrives.
 * @param {string} teamSlug
 * @param {any[]} data
 */
export function setStaleVideos(teamSlug, data) {
  setCached(`team:stale:${teamSlug}`, data, STALE_TTL_MS);
}
