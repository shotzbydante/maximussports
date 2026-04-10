/**
 * Client fetcher for NBA news headlines.
 * GET /api/nba/news/headlines
 * Module-level 2-minute memo + in-flight coalesce.
 */

const MEMO_MS = 2 * 60 * 1000;
let inFlight = null;
let last = { data: null, ts: 0 };

export async function fetchNbaHeadlines() {
  const now = Date.now();
  if (last.data != null && now - last.ts < MEMO_MS) return last.data;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const res = await fetch('/api/nba/news/headlines');
      if (!res.ok) return { headlines: [] };
      const data = await res.json();
      const out = { headlines: data.headlines ?? [] };
      last = { data: out, ts: Date.now() };
      return out;
    } catch {
      return { headlines: [] };
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}
