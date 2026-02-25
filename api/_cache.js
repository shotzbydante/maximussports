/**
 * Shared in-memory cache with TTL for serverless functions.
 * Supports stale-while-revalidate: getMaybeStale() returns value + age/stale so callers
 * can serve stale immediately while revalidating. In-memory cache may reset on cold starts.
 * In-flight request coalescing: same key waits on existing promise instead of duplicate fetch.
 */

export function createCache(ttlMs = 60000) {
  const store = new Map();
  return {
    get(key) {
      const entry = store.get(key);
      if (!entry) return null;
      const ageMs = Date.now() - entry.time;
      if (ageMs > ttlMs) {
        store.delete(key);
        return null;
      }
      return entry.value;
    },
    set(key, value) {
      store.set(key, { value, time: Date.now() });
    },
    /**
     * Return cached value with metadata. Does not delete when expired; caller can serve stale.
     * @returns {{ value: any, ageMs: number, stale: boolean } | null}
     */
    getMaybeStale(key, ttlMsOverride = ttlMs) {
      const entry = store.get(key);
      if (!entry) return null;
      const ageMs = Date.now() - entry.time;
      const stale = ageMs > ttlMsOverride;
      return { value: entry.value, ageMs, stale };
    },
  };
}

const inFlight = new Map();

/**
 * Run a fetcher for key; if the same key is already in flight, await that promise instead.
 * @param {string} key - Unique key (e.g. endpoint + query)
 * @param {() => Promise<any>} fetcher
 * @returns {Promise<any>}
 */
export async function coalesce(key, fetcher) {
  const existing = inFlight.get(key);
  if (existing) return existing;

  const promise = fetcher()
    .finally(() => {
      inFlight.delete(key);
    });
  inFlight.set(key, promise);
  return promise;
}

/**
 * Build response metadata for CDN/cache debugging.
 * @param {{ hit: boolean, ageMs?: number, stale?: boolean }} cache
 * @param {{ generatedAt: string, partial?: boolean, sourceLabel?: string, errors?: string[] }} opts
 */
export function buildCacheMeta(cache, opts = {}) {
  const meta = {
    generatedAt: new Date().toISOString(),
    cache: {
      hit: !!cache?.hit,
      ageMs: cache?.ageMs ?? null,
      stale: !!cache?.stale,
    },
    partial: opts.partial ?? false,
    sourceLabel: opts.sourceLabel ?? null,
    errors: Array.isArray(opts.errors) ? opts.errors : (opts.errors ? [opts.errors] : []),
  };
  if (meta.errors.length === 0) delete meta.errors;
  return meta;
}
