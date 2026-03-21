/**
 * Client fetcher for MLB World Series championship odds.
 * GET /api/mlb/odds/championship
 * Module-level 30s memo + in-flight coalesce (mirrors NCAAB pattern).
 */

const MEMO_MS = 30 * 1000;
let inFlight = null;
let last = { data: null, ts: 0 };

export async function fetchMlbChampionshipOdds() {
  const now = Date.now();
  if (last.data != null && now - last.ts < MEMO_MS) return last.data;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const res = await fetch('/api/mlb/odds/championship');
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
