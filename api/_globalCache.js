/**
 * Vercel KV wrapper for shared ATS leaders cache.
 * Windowed keys: ats:leaders:last30:v1, ats:leaders:last7:v1, ats:leaders:season:v1
 * Payload: { atsLeaders: { best, worst }, atsMeta: { status, confidence, reason?, sourceLabel?, generatedAt, cacheNote? } }
 * TTL: fresh 5 min, max 60 min. Never overwrite existing value with EMPTY (enforced by callers).
 * When KV is not configured (e.g. local dev), getJson returns null and setJson no-ops.
 */

const ATS_LEADERS_LAST30_KEY = 'ats:leaders:last30:v1';
const ATS_LEADERS_LAST7_KEY = 'ats:leaders:last7:v1';
const ATS_LEADERS_SEASON_KEY = 'ats:leaders:season:v1';

/** @deprecated Use getAtsLeadersKeyForWindow instead. Kept for backward compatibility during migration. */
const ATS_LEADERS_KEY = ATS_LEADERS_LAST30_KEY;

const FRESH_SECONDS = 5 * 60;   // 5 min
const MAX_TTL_SECONDS = 60 * 60; // 60 min

/**
 * @param {'last30'|'last7'|'season'} window
 * @returns {string}
 */
function getAtsLeadersKeyForWindow(window) {
  if (window === 'last7') return ATS_LEADERS_LAST7_KEY;
  if (window === 'season') return ATS_LEADERS_SEASON_KEY;
  return ATS_LEADERS_LAST30_KEY;
}

let kv = null;
async function getKv() {
  if (kv !== undefined) return kv;
  try {
    const mod = await import('@vercel/kv');
    kv = mod.kv ?? mod.default;
    return kv;
  } catch (err) {
    console.warn('[globalCache] KV not available:', err?.message);
    kv = null;
    return null;
  }
}

/**
 * @param {string} key
 * @returns {Promise<any | null>}
 */
export async function getJson(key) {
  const client = await getKv();
  if (!client) return null;
  try {
    const raw = await client.get(key);
    if (raw == null) return null;
    return typeof raw === 'object' ? raw : JSON.parse(String(raw));
  } catch (err) {
    console.warn('[globalCache] getJson error:', err?.message);
    return null;
  }
}

/**
 * @param {string} key
 * @param {any} value
 * @param {{ exSeconds?: number }} [opts]
 */
export async function setJson(key, value, opts = {}) {
  const client = await getKv();
  if (!client) return;
  try {
    const ex = opts.exSeconds ?? MAX_TTL_SECONDS;
    const payload = typeof value === 'string' ? value : JSON.stringify(value);
    await client.set(key, payload, { ex });
  } catch (err) {
    console.warn('[globalCache] setJson error:', err?.message);
  }
}

/**
 * Returns cached payload with age/stale for SWR. Uses generatedAt from payload for age.
 * @param {string} key
 * @returns {Promise<{ value: object, ageSeconds: number, stale: boolean } | null>}
 */
export async function getWithMeta(key) {
  const value = await getJson(key);
  if (!value) return null;
  const generatedAt = value.atsMeta?.generatedAt;
  const ageSeconds = generatedAt
    ? Math.floor((Date.now() - new Date(generatedAt).getTime()) / 1000)
    : 0;
  const stale = ageSeconds > FRESH_SECONDS;
  return { value, ageSeconds, stale };
}

export {
  ATS_LEADERS_KEY,
  ATS_LEADERS_LAST30_KEY,
  ATS_LEADERS_LAST7_KEY,
  ATS_LEADERS_SEASON_KEY,
  getAtsLeadersKeyForWindow,
  FRESH_SECONDS,
  MAX_TTL_SECONDS,
};
