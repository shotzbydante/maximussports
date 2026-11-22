/**
 * Browser side of the stadium flyovers (Google Maps Aerial View).
 *
 * `fetchFlyoverCoverage` says which venues have a video; it is free and
 * shared by every game module on the page. `fetchFlyover` gets the video
 * links for one venue. Each of those is a billed lookup, so the result is
 * reused for a few minutes within the visit, and only requested when a
 * module is actually on screen. Links are held in memory only: Google's
 * terms do not allow storing them, and they expire.
 */

const coverage = new Map(); // sport → Promise<{ venues, capped }>
const flyovers = new Map(); // "sport:team" → { at, promise }
const REUSE_MS = 8 * 60 * 1000;

async function getJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`flyover ${r.status}`);
  return r.json();
}

/** @returns {Promise<{ venues: Record<string, { state: string, name: string }>, capped: boolean }>} */
export function fetchFlyoverCoverage(sport) {
  if (!coverage.has(sport)) {
    const p = getJson(`/api/venues/aerial?sport=${encodeURIComponent(sport)}`)
      .then((d) => ({ venues: d?.venues || {}, capped: !!d?.capped }))
      .catch(() => {
        coverage.delete(sport); // a failed check may be retried by the next module
        return { venues: {}, capped: false };
      });
    coverage.set(sport, p);
  }
  return coverage.get(sport);
}

/** @returns {Promise<{ state: string, name?, poster?, mp4Low?, mp4Medium?, durationSec? }>} */
export function fetchFlyover(sport, team, { fresh = false } = {}) {
  const key = `${sport}:${team}`;
  const hit = flyovers.get(key);
  if (!fresh && hit && Date.now() - hit.at < REUSE_MS) return hit.promise;
  const promise = getJson(`/api/venues/aerial?sport=${encodeURIComponent(sport)}&team=${encodeURIComponent(team)}`)
    .catch(() => ({ state: 'error' }));
  flyovers.set(key, { at: Date.now(), promise });
  return promise;
}

/** Test hook. */
export function _resetFlyoverCache() {
  coverage.clear();
  flyovers.clear();
}
