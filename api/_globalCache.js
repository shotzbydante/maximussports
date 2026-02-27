/**
 * Vercel KV wrapper for shared ATS leaders cache.
 * Windowed keys: ats:leaders:last30:v1, ats:leaders:last7:v1, ats:leaders:season:v1
 * Last-known keys (longer TTL): ats:leaders:lastKnown:last30:v1, ats:leaders:lastKnown:last7:v1, ats:leaders:lastKnown:season:v1
 * Payload: { atsLeaders: { best, worst }, atsMeta: { status, confidence, reason?, sourceLabel?, generatedAt, cacheNote? } }
 * TTL: fresh 5 min, max 60 min. Never overwrite existing value with EMPTY (enforced by callers).
 * When KV is not configured (e.g. local dev), getJson returns null and setJson no-ops.
 */

const ATS_LEADERS_LAST30_KEY = 'ats:leaders:last30:v1';
const ATS_LEADERS_LAST7_KEY = 'ats:leaders:last7:v1';
const ATS_LEADERS_SEASON_KEY = 'ats:leaders:season:v1';

// Long-lived last-known copies used when fresh KV is missing.
const ATS_LEADERS_LASTKNOWN_LAST30_KEY = 'ats:leaders:lastKnown:last30:v1';
const ATS_LEADERS_LASTKNOWN_LAST7_KEY = 'ats:leaders:lastKnown:last7:v1';
const ATS_LEADERS_LASTKNOWN_SEASON_KEY = 'ats:leaders:lastKnown:season:v1';

/** @deprecated Use getAtsLeadersKeyForWindow instead. Kept for backward compatibility during migration. */
const ATS_LEADERS_KEY = ATS_LEADERS_LAST30_KEY;

const FRESH_SECONDS = 5 * 60;   // 5 min
const MAX_TTL_SECONDS = 60 * 60; // 60 min
const LAST_KNOWN_TTL_SECONDS = 14 * 24 * 60 * 60; // 14 days

/**
 * @param {'last30'|'last7'|'season'} window
 * @returns {string}
 */
function getAtsLeadersKeyForWindow(window) {
  if (window === 'last7') return ATS_LEADERS_LAST7_KEY;
  if (window === 'season') return ATS_LEADERS_SEASON_KEY;
  return ATS_LEADERS_LAST30_KEY;
}

/**
 * @param {'last30'|'last7'|'season'} window
 * @returns {string}
 */
function getAtsLeadersLastKnownKeyForWindow(window) {
  if (window === 'last7') return ATS_LEADERS_LASTKNOWN_LAST7_KEY;
  if (window === 'season') return ATS_LEADERS_LASTKNOWN_SEASON_KEY;
  return ATS_LEADERS_LASTKNOWN_LAST30_KEY;
}

let kv; // undefined = not yet attempted; null = attempted and unavailable
async function getKv() {
  if (kv !== undefined) return kv; // return cached client (or null if previously failed)
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

const LOCK_TTL_SECONDS = 60;

/**
 * Try to acquire a distributed lock atomically. Uses NX if supported, else token-verify.
 * Lock release is by TTL only; no explicit release required.
 * @param {string} lockKey
 * @param {number} [ttlSec]
 * @returns {Promise<boolean>} true if lock acquired, false if already held
 */
export async function tryAcquireLock(lockKey, ttlSec = LOCK_TTL_SECONDS) {
  const client = await getKv();
  if (!client) return false;
  try {
    const result = await client.set(lockKey, '1', { nx: true, ex: ttlSec });
    if (result === 'OK' || result === true) return true;
    return false;
  } catch (_) {
    /* NX may not be supported; fall through to token-verify */
  }
  try {
    const token = `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
    const payload = JSON.stringify({ token, createdAt: Date.now() });
    await client.set(lockKey, payload, { ex: ttlSec });
    const raw = await client.get(lockKey);
    const stored = (typeof raw === 'string' && raw.startsWith('{')) ? JSON.parse(raw) : raw;
    if (stored && stored.token === token) return true;
    return false;
  } catch (err) {
    console.warn('[globalCache] tryAcquireLock error:', err?.message);
    return false;
  }
}

/**
 * Returns cached payload with age/stale for SWR. Uses generatedAt from payload for age.
 * When generatedAt is missing, ageSeconds is null and stale is false (caller should set reason='unknown_age').
 * @param {string} key
 * @returns {Promise<{ value: object, ageSeconds: number|null, stale: boolean } | null>}
 */
export async function getWithMeta(key) {
  const value = await getJson(key);
  if (!value) return null;
  const generatedAt = value.atsMeta?.generatedAt;
  const ageSeconds = generatedAt != null
    ? Math.floor((Date.now() - new Date(generatedAt).getTime()) / 1000)
    : null;
  const stale = ageSeconds != null && ageSeconds > FRESH_SECONDS;
  return { value, ageSeconds, stale };
}

/**
 * Returns true when a KV client is reachable.
 * Fast-fails (no module import) when none of the known env var sets are present.
 * Checks all four known naming conventions used by Vercel / Upstash integrations.
 */
export async function isKvAvailable() {
  const e = process.env ?? {};
  const hasVars = Boolean(
    (e.KV_REST_API_URL && e.KV_REST_API_TOKEN) ||
    e.KV_URL ||
    (e.UPSTASH_REDIS_REST_URL && e.UPSTASH_REDIS_REST_TOKEN) ||
    e.REDIS_URL,
  );
  if (!hasVars) return false;
  return (await getKv()) != null;
}

export {
  ATS_LEADERS_KEY,
  ATS_LEADERS_LAST30_KEY,
  ATS_LEADERS_LAST7_KEY,
  ATS_LEADERS_SEASON_KEY,
  getAtsLeadersKeyForWindow,
  FRESH_SECONDS,
  MAX_TTL_SECONDS,
  ATS_LEADERS_LASTKNOWN_LAST30_KEY,
  ATS_LEADERS_LASTKNOWN_LAST7_KEY,
  ATS_LEADERS_LASTKNOWN_SEASON_KEY,
  getAtsLeadersLastKnownKeyForWindow,
  LAST_KNOWN_TTL_SECONDS,
};
