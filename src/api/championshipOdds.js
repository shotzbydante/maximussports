/**
 * Client fetcher for NCAAB championship winner odds.
 * GET /api/odds/championship — not wired into fetchHomeFast or home fast path.
 * Non-blocking, resilient; used by Bubble Watch and Team page only.
 * Module-level de-dupe: 30s memo + in-flight coalesce to avoid redundant calls when navigating Home → Teams → Team.
 */

const MEMO_MS = 30 * 1000;
let inFlight = null;
let last = { data: null, ts: 0 };

/**
 * @returns {Promise<{ odds: Record<string, { american: number|null, book: string|null, updatedAt: string, source: string, cacheAgeSec: number|null }>, oddsMeta?: object }>}
 */
export async function fetchChampionshipOdds() {
  const now = Date.now();
  if (last.data != null && now - last.ts < MEMO_MS) return last.data;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const res = await fetch('/api/odds/championship');
      if (!res.ok) return { odds: {}, oddsMeta: { stage: 'error', source: 'error' } };
      const data = await res.json();
      const out = { odds: data.odds ?? {}, oddsMeta: data.oddsMeta ?? null };
      last = { data: out, ts: Date.now() };
      return out;
    } catch {
      return { odds: {}, oddsMeta: { stage: 'error', source: 'error' } };
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}
