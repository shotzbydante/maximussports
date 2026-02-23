/**
 * Batch Home API: one call for scores + odds + rankings + headlines + dataStatus.
 * Use for initial load to reduce round trips.
 */

const inFlight = new Map();

function coalesce(key, fetcher) {
  const existing = inFlight.get(key);
  if (existing) return existing;
  const promise = fetcher().finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, promise);
  return promise;
}

export async function fetchHome() {
  const key = 'home';
  return coalesce(key, async () => {
    if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development') {
      console.time('[client] fetchHome');
    }
    const res = await fetch('/api/home');
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    const data = await res.json();
    if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development') {
      console.timeEnd('[client] fetchHome');
    }
    return data;
  });
}
