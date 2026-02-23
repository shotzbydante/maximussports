/**
 * Batch Team API: one call for schedule + odds history + team news + rank.
 * ATS computed client-side from schedule + oddsHistory.
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
