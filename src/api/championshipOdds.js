/**
 * Client fetcher for NCAAB championship winner odds.
 * GET /api/odds/championship — not wired into fetchHomeFast or home fast path.
 * Non-blocking, resilient; used by Bubble Watch and Team page only.
 */

/**
 * @returns {Promise<{ odds: Record<string, { american: number|null, book: string|null, updatedAt: string, source: string, cacheAgeSec: number|null }>, oddsMeta?: object }>}
 */
export async function fetchChampionshipOdds() {
  try {
    const res = await fetch('/api/odds/championship');
    if (!res.ok) return { odds: {}, oddsMeta: { stage: 'error', source: 'error' } };
    const data = await res.json();
    return {
      odds: data.odds ?? {},
      oddsMeta: data.oddsMeta ?? null,
    };
  } catch {
    return { odds: {}, oddsMeta: { stage: 'error', source: 'error' } };
  }
}
