/**
 * Client fetcher for NBA team board (standings + records).
 * GET /api/nba/team/board
 * Module-level 2-minute memo + in-flight coalesce.
 */

const MEMO_MS = 2 * 60 * 1000;
let inFlight = null;
let last = { data: null, ts: 0 };

export async function fetchNbaTeamBoard() {
  const now = Date.now();
  if (last.data != null && now - last.ts < MEMO_MS) return last.data;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const res = await fetch('/api/nba/team/board');
      if (!res.ok) return { board: [] };
      const data = await res.json();
      const out = { board: data.board ?? [] };
      last = { data: out, ts: Date.now() };
      return out;
    } catch {
      return { board: [] };
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}
