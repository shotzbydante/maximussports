/**
 * Client fetcher for ATS leaders. GET /api/ats/leaders?window=last30|last7|season
 * Module-level de-dupe (inFlight) so tab/period switches do not pile up requests.
 * Optional AbortController for cancellation.
 */

const VALID_WINDOWS = ['last30', 'last7', 'season'];

let inFlight = null;

/**
 * @param {'last30'|'last7'|'season'} [window]
 * @param {{ signal?: AbortSignal }} [opts]
 * @returns {Promise<{ atsLeaders: { best: any[], worst: any[] }, atsMeta: object, atsWindow: string, seasonWarming?: boolean }>}
 */
export async function fetchAtsLeaders(window = 'last30', opts = {}) {
  const w = VALID_WINDOWS.includes(window) ? window : 'last30';
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const res = await fetch(`/api/ats/leaders?window=${w}`, { signal: opts?.signal });
      if (!res.ok) {
        return {
          atsLeaders: { best: [], worst: [] },
          atsMeta: { status: 'EMPTY', reason: 'fetch_failed', sourceLabel: null, confidence: 'low', generatedAt: new Date().toISOString() },
          atsWindow: w,
          seasonWarming: false,
        };
      }
      const data = await res.json();
      return {
        atsLeaders: data.atsLeaders ?? { best: [], worst: [] },
        atsMeta: data.atsMeta ?? { status: 'EMPTY', reason: null, sourceLabel: null, confidence: 'low', generatedAt: new Date().toISOString() },
        atsWindow: data.atsWindow ?? w,
        seasonWarming: data.seasonWarming ?? false,
      };
    } catch (err) {
      if (opts?.signal?.aborted) {
        return {
          atsLeaders: { best: [], worst: [] },
          atsMeta: { status: 'EMPTY', reason: 'aborted', sourceLabel: null, confidence: 'low', generatedAt: new Date().toISOString() },
          atsWindow: w,
          seasonWarming: false,
        };
      }
      return {
        atsLeaders: { best: [], worst: [] },
        atsMeta: { status: 'EMPTY', reason: err?.message || 'fetch_failed', sourceLabel: null, confidence: 'low', generatedAt: new Date().toISOString() },
        atsWindow: w,
        seasonWarming: false,
      };
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/**
 * POST /api/ats/refresh?window=... to trigger server compute and KV write. Fire-and-forget.
 * @param {'last30'|'last7'|'season'} window
 */
export function fetchAtsRefresh(window = 'last30') {
  const w = VALID_WINDOWS.includes(window) ? window : 'last30';
  fetch(`/api/ats/refresh?window=${w}`, { method: 'POST' }).catch(() => {});
}
