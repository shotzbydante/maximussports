/**
 * Client fetcher for NBA championship odds.
 * GET /api/nba/odds/championship
 * Module-level 30s memo + in-flight coalesce.
 */

const MEMO_MS = 30 * 1000;
let inFlight = null;
let last = { data: null, ts: 0 };

export async function fetchNbaChampionshipOdds() {
  const now = Date.now();
  if (last.data != null && now - last.ts < MEMO_MS) return last.data;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const res = await fetch('/api/nba/odds/championship');
      if (!res.ok) return { odds: {} };
      const data = await res.json();
      const out = { odds: data.odds ?? {} };
      last = { data: out, ts: Date.now() };
      return out;
    } catch {
      return { odds: {} };
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}
