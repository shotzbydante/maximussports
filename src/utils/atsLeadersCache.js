/**
 * In-memory cache for ATS leaderboard (best/worst). Stale time 5 min.
 * Show cached first; refresh in background.
 */

const STALE_MS = 10 * 60 * 1000;
let cached = null;
let cachedAt = 0;

export function getAtsLeadersCache() {
  if (!cached) return null;
  if (Date.now() - cachedAt > STALE_MS) return null;
  return cached;
}

export function getAtsLeadersCacheMaybeStale() {
  if (!cached) return null;
  return { data: cached, isStale: Date.now() - cachedAt > STALE_MS };
}

export function setAtsLeadersCache(data) {
  if (!data) return;
  cached = { best: data.best || [], worst: data.worst || [] };
  cachedAt = Date.now();
}
