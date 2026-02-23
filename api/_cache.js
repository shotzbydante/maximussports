/**
 * Shared in-memory cache with TTL for serverless functions.
 * Use for scores, odds, odds-history, news, summary.
 * In-flight request coalescing: same key waits on existing promise instead of duplicate fetch.
 */

export function createCache(ttlMs = 60000) {
  const store = new Map();
  return {
    get(key) {
      const entry = store.get(key);
      if (!entry) return null;
      if (Date.now() - entry.time > ttlMs) {
        store.delete(key);
        return null;
      }
      return entry.value;
    },
    set(key, value) {
      store.set(key, { value, time: Date.now() });
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
