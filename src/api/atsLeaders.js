/**
 * Client fetcher for ATS leaders. GET /api/ats/leaders?window=last30|last7|season
 * Module-level de-dupe (inFlight). Last-known cache (10 min) returned when GET is warming/empty.
 */

const VALID_WINDOWS = ['last30', 'last7', 'season'];
const LAST_KNOWN_TTL_MS = 10 * 60 * 1000;

let inFlight = null;
const lastSuccessByWindow = {};

function hasData(data) {
  const b = data?.atsLeaders?.best?.length ?? 0;
  const w = data?.atsLeaders?.worst?.length ?? 0;
  return b > 0 || w > 0;
}

function isWarming(data) {
  return data?.atsMeta?.reason === 'ats_data_warming' || (data?.atsMeta?.source === 'empty' && !hasData(data));
}

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
        const last = lastSuccessByWindow[w];
        if (last && Date.now() - last.ts < LAST_KNOWN_TTL_MS) {
          return { ...last.data, atsMeta: { ...last.data.atsMeta, source: 'client_last_known', confidence: 'low' } };
        }
        return {
          atsLeaders: { best: [], worst: [] },
          atsMeta: { status: 'EMPTY', reason: 'fetch_failed', sourceLabel: null, confidence: 'low', generatedAt: new Date().toISOString() },
          atsWindow: w,
          seasonWarming: false,
        };
      }
      const data = await res.json();
      const out = {
        atsLeaders: data.atsLeaders ?? { best: [], worst: [] },
        atsMeta: data.atsMeta ?? { status: 'EMPTY', reason: null, sourceLabel: null, confidence: 'low', generatedAt: new Date().toISOString() },
        atsWindow: data.atsWindow ?? w,
        seasonWarming: data.seasonWarming ?? false,
      };
      if (hasData(out)) lastSuccessByWindow[w] = { data: out, ts: Date.now() };
      if (isWarming(out)) {
        const last = lastSuccessByWindow[w];
        if (last && Date.now() - last.ts < LAST_KNOWN_TTL_MS) {
          return { ...last.data, atsMeta: { ...last.data.atsMeta, source: 'client_last_known', confidence: 'low' } };
        }
      }
      return out;
    } catch (err) {
      const last = lastSuccessByWindow[w];
      if (last && Date.now() - last.ts < LAST_KNOWN_TTL_MS) {
        return { ...last.data, atsMeta: { ...last.data.atsMeta, source: 'client_last_known', confidence: 'low' } };
      }
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
 * POST /api/ats/refresh?window=... Returns status so client can branch (locked vs failed).
 * @param {'last30'|'last7'|'season'} window
 * @returns {Promise<{ status: 'ok'|'locked'|'failed' }>}
 */
export async function fetchAtsRefresh(window = 'last30') {
  const w = VALID_WINDOWS.includes(window) ? window : 'last30';
  try {
    const res = await fetch(`/api/ats/refresh?window=${w}`, { method: 'POST' });
    const body = await res.json().catch(() => ({}));
    if (res.status === 202) return { status: 'locked' };
    return { status: body.status === 'ok' ? 'ok' : 'failed' };
  } catch {
    return { status: 'failed' };
  }
}
