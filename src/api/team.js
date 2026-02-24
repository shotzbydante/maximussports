/**
 * Team API: single team (Team page) and batched (pinned teams only).
 * fetchTeamPage(slug) — /api/team/:slug.
 * fetchTeamBatch(slugs) — chunked by 5, coalesced, client cache (5 min stale).
 */

const BATCH_MAX = 5;
const PINNED_CACHE_STALE_MS = 5 * 60 * 1000; // 5 min
const inFlight = new Map();
const batchCache = new Map(); // key -> { data, timestamp }

function coalesce(key, fetcher) {
  const existing = inFlight.get(key);
  if (existing) return existing;
  const promise = fetcher().finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, promise);
  return promise;
}

function batchKey(slugs) {
  return slugs.slice(0, BATCH_MAX).sort().join(',');
}

function getCachedBatch(key) {
  const entry = batchCache.get(key);
  if (!entry) return null;
  return { data: entry.data, isStale: Date.now() - entry.timestamp > PINNED_CACHE_STALE_MS };
}

function setCachedBatch(key, data) {
  batchCache.set(key, { data, timestamp: Date.now() });
}

/**
 * Fetch team batch (max 5 slugs per request). Chunks into groups of 5, coalesces by key.
 * If cached (even stale), returns cached immediately and optionally refreshes in background.
 * @param {string[]} slugs
 * @param {{ backgroundRefresh?: boolean }} options
 * @returns {Promise<{ teams: Record<string, { team, schedule, oddsHistory, teamNews, rank, ats }> }>}
 */
export async function fetchTeamBatch(slugs, options = {}) {
  const { backgroundRefresh = true } = options;
  if (!Array.isArray(slugs) || slugs.length === 0) {
    return { teams: {} };
  }
  const chunks = [];
  for (let i = 0; i < slugs.length; i += BATCH_MAX) {
    chunks.push(slugs.slice(i, i + BATCH_MAX));
  }
  const keys = chunks.map((c) => batchKey(c));
  const cachedByKey = {};
  let allCached = true;
  let anyStale = false;
  for (let i = 0; i < keys.length; i++) {
    const c = getCachedBatch(keys[i]);
    if (c) {
      cachedByKey[keys[i]] = c;
      if (c.isStale) anyStale = true;
    } else {
      allCached = false;
    }
  }
  if (allCached && !(backgroundRefresh && anyStale)) {
    const teams = {};
    keys.forEach((k) => {
      const c = cachedByKey[k];
      if (c?.data?.teams) Object.assign(teams, c.data.teams);
    });
    return { teams };
  }
  if (allCached && anyStale && backgroundRefresh) {
    const teams = {};
    keys.forEach((k) => {
      const c = cachedByKey[k];
      if (c?.data?.teams) Object.assign(teams, c.data.teams);
    });
    fetchTeamBatch(slugs, { backgroundRefresh: false }).then((fresh) => {
      if (!fresh?.teams) return;
      chunks.forEach((chunk, i) => {
        const subset = {};
        chunk.forEach((slug) => {
          if (fresh.teams[slug]) subset[slug] = fresh.teams[slug];
        });
        if (Object.keys(subset).length) setCachedBatch(keys[i], { teams: subset });
      });
    }).catch(() => {});
    return { teams };
  }

  const fetchChunk = (chunk) => {
    const key = batchKey(chunk);
    return coalesce(`team:batch:${key}`, async () => {
      const res = await fetch(`/api/team/batch?slugs=${chunk.map((s) => encodeURIComponent(s)).join(',')}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setCachedBatch(key, data);
      return data;
    });
  };

  const results = await Promise.all(chunks.map(fetchChunk));
  const teams = {};
  results.forEach((r) => {
    if (r?.teams && typeof r.teams === 'object') Object.assign(teams, r.teams);
  });
  return { teams };
}

export async function fetchTeamPage(slug) {
  if (!slug) return Promise.resolve({ schedule: { events: [] }, oddsHistory: { games: [] }, teamNews: [], rank: null, teamId: null });
  const key = `team:${slug}`;
  return coalesce(key, async () => {
    if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development') {
      console.time(`[client] fetchTeamPage ${slug}`);
    }
    const res = await fetch(`/api/team/${encodeURIComponent(slug)}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    const data = await res.json();
    if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development') {
      console.timeEnd(`[client] fetchTeamPage ${slug}`);
    }
    return data;
  });
}
