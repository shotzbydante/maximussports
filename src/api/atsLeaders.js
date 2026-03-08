/**
 * Client fetcher for ATS leaders. GET /api/ats/leaders?window=last30|last7|season
 * Per-window de-dupe (inFlightByWindow). Last-known cache only when response was usable (>=5 best or >=5 worst).
 */

const VALID_WINDOWS = ['last30', 'last7', 'season'];
const LAST_KNOWN_TTL_MS = 10 * 60 * 1000;
const MIN_LEADERS_FOR_CACHE = 5;

/** @type {Record<string, Promise<any>>} */
const inFlightByWindow = {};

/** @type {Record<string, { data: any, ts: number }>} */
const lastSuccessByWindow = {};

function hasData(data) {
  const b = data?.atsLeaders?.best?.length ?? 0;
  const w = data?.atsLeaders?.worst?.length ?? 0;
  return b > 0 || w > 0;
}

/** Only treat as "usable" for last-known cache when we have enough leaders. */
function isUsableData(data) {
  const b = data?.atsLeaders?.best?.length ?? 0;
  const w = data?.atsLeaders?.worst?.length ?? 0;
  return b >= MIN_LEADERS_FOR_CACHE || w >= MIN_LEADERS_FOR_CACHE;
}

function isWarming(data) {
  return data?.atsMeta?.reason === 'ats_data_warming' || (data?.atsMeta?.source === 'empty' && !hasData(data));
}

function clientLastKnownMeta(prevMeta) {
  return {
    ...(prevMeta ?? {}),
    source: 'client_last_known',
    reason: 'client_last_known_fallback',
    confidence: 'low',
  };
}

/**
 * @param {'last30'|'last7'|'season'} [window]
 * @param {{ signal?: AbortSignal }} [opts]
 * @returns {Promise<{ atsLeaders: { best: any[], worst: any[] }, atsMeta: object, atsWindow: string, seasonWarming?: boolean }>}
 */
export async function fetchAtsLeaders(window = 'last30', opts = {}) {
  const w = VALID_WINDOWS.includes(window) ? window : 'last30';
  const inFlightKey = `ats:leaders:${w}`;

  // Return the existing in-flight promise if there is one.
  //
  // IMPORTANT: we do NOT forward opts.signal into the shared fetch. The
  // in-flight Promise may be awaited by multiple callers (e.g. Home and
  // Insights both coalescing onto the same request). If we passed the first
  // caller's AbortSignal and that caller unmounts (Home navigating away), the
  // signal fires and aborts the network request for ALL waiters — causing
  // Insights to receive empty atsLeaders from the catch block.
  //
  // Callers that need per-component cancellation should handle it themselves
  // (e.g. the `cancelled` flag in useAtsLeaders prevents stale state updates
  // after unmount, which is sufficient and safer).
  if (inFlightByWindow[inFlightKey]) return inFlightByWindow[inFlightKey];

  inFlightByWindow[inFlightKey] = (async () => {
    try {
      // No signal passed — see note above about shared in-flight promises.
      const res = await fetch(`/api/ats/leaders?window=${w}`);
      if (!res.ok) {
        const last = lastSuccessByWindow[w];
        if (last && Date.now() - last.ts < LAST_KNOWN_TTL_MS) {
          return { ...last.data, atsMeta: clientLastKnownMeta(last.data.atsMeta) };
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
      if (isUsableData(out)) lastSuccessByWindow[w] = { data: out, ts: Date.now() };
      if (isWarming(out)) {
        const last = lastSuccessByWindow[w];
        if (last && Date.now() - last.ts < LAST_KNOWN_TTL_MS) {
          return { ...last.data, atsMeta: clientLastKnownMeta(last.data.atsMeta) };
        }
      }
      return out;
    } catch (err) {
      const last = lastSuccessByWindow[w];
      if (last && Date.now() - last.ts < LAST_KNOWN_TTL_MS) {
        return { ...last.data, atsMeta: clientLastKnownMeta(last.data.atsMeta) };
      }
      return {
        atsLeaders: { best: [], worst: [] },
        atsMeta: { status: 'EMPTY', reason: err?.message || 'fetch_failed', sourceLabel: null, confidence: 'low', generatedAt: new Date().toISOString() },
        atsWindow: w,
        seasonWarming: false,
      };
    } finally {
      delete inFlightByWindow[inFlightKey];
    }
  })();
  return inFlightByWindow[inFlightKey];
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
