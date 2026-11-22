/**
 * Instagram credentials and token upkeep (Instagram API with Instagram Login).
 *
 * A long-lived Instagram user token lasts 60 days. It can be refreshed for
 * another 60 as long as it is at least 24 hours old and has not expired; once
 * it expires the only fix is a new token from the Meta App Dashboard. Nothing
 * refreshed the original token, so it lapsed 60 days after it was pasted in.
 *
 *   getInstagramCredentials()  the account id and the freshest token we hold
 *   refreshInstagramToken()    extend the token; called weekly by cron
 *   describeInstagramError()   turn a Graph error into something actionable
 *
 * Environment variables cannot be rewritten at runtime, so a refreshed token
 * is kept in KV next to a fingerprint of INSTAGRAM_ACCESS_TOKEN. Pasting a new
 * token into Vercel changes the fingerprint, and the stored one is ignored.
 */

import { createHash } from 'node:crypto';
import { getJson, setJson } from '../_globalCache.js';

const GRAPH = 'https://graph.instagram.com';
const KV_KEY = 'instagram:token:v1';
const DAY = 86400;

function sanitizeEnv(value) {
  if (value == null) return '';
  let s = String(value).trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) s = s.slice(1, -1).trim();
  return s;
}

function fingerprint(token) {
  return createHash('sha256').update(token).digest('hex').slice(0, 16);
}

function daysUntil(iso) {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  return Number.isFinite(ms) ? Math.floor(ms / (DAY * 1000)) : null;
}

/**
 * @returns {Promise<{accountId:string, accessToken:string, source:'kv'|'env'|'none', expiresAt:string|null, refreshedAt:string|null, daysLeft:number|null}>}
 */
export async function getInstagramCredentials() {
  const accountId = sanitizeEnv(process.env.INSTAGRAM_ACCOUNT_ID);
  const envToken = sanitizeEnv(process.env.INSTAGRAM_ACCESS_TOKEN);
  if (!envToken) return { accountId, accessToken: '', source: 'none', expiresAt: null, refreshedAt: null, daysLeft: null };

  let stored = null;
  try { stored = await getJson(KV_KEY); } catch { /* KV is optional */ }

  if (stored?.accessToken && stored.envFingerprint === fingerprint(envToken)) {
    return {
      accountId,
      accessToken: stored.accessToken,
      source: 'kv',
      expiresAt: stored.expiresAt || null,
      refreshedAt: stored.refreshedAt || null,
      daysLeft: daysUntil(stored.expiresAt),
    };
  }
  return { accountId, accessToken: envToken, source: 'env', expiresAt: null, refreshedAt: null, daysLeft: null };
}

/** Classify a Graph API error. Never includes the token. */
export function describeInstagramError(raw) {
  const e = raw?.error ?? raw ?? {};
  const message = String(e.message || e.error_message || 'Unknown Instagram API error');
  const code = e.code ?? null;
  const expired = /expired/i.test(message) || e.error_subcode === 463;
  const invalid = code === 190;
  let action = 'Check the Instagram API status and try again.';
  if (expired) {
    action = 'The access token has expired and cannot be refreshed. Generate a new long-lived token in the Meta App Dashboard (Instagram > API setup with Instagram login > Generate token), set INSTAGRAM_ACCESS_TOKEN in Vercel, and redeploy.';
  } else if (invalid) {
    action = 'The access token was rejected. Confirm INSTAGRAM_ACCESS_TOKEN is an Instagram Login user token for this account, with no quotes or spaces, then redeploy.';
  }
  return { message, code, type: e.type ?? null, expired, invalid: invalid || expired, action };
}

/**
 * Extend the current token by 60 days and store it.
 * @returns {Promise<{ok:true, expiresAt:string, daysLeft:number, stored:boolean}|{ok:false, stage:string, error:object}>}
 */
export async function refreshInstagramToken({ fetchImpl = fetch } = {}) {
  const creds = await getInstagramCredentials();
  if (!creds.accessToken) {
    return { ok: false, stage: 'config', error: { message: 'INSTAGRAM_ACCESS_TOKEN is not set', action: 'Set INSTAGRAM_ACCESS_TOKEN in Vercel.' } };
  }

  let data;
  try {
    const res = await fetchImpl(`${GRAPH}/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(creds.accessToken)}`);
    data = await res.json();
    if (!res.ok || data?.error || !data?.access_token) {
      return { ok: false, stage: 'instagram_api', error: describeInstagramError(data) };
    }
  } catch (err) {
    return { ok: false, stage: 'network', error: { message: err?.message || 'Network error contacting Instagram', action: 'Retry; the next scheduled run will try again.' } };
  }

  const expiresIn = Number(data.expires_in) || 60 * DAY;
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
  const record = {
    accessToken: data.access_token,
    expiresAt,
    refreshedAt: new Date().toISOString(),
    envFingerprint: fingerprint(sanitizeEnv(process.env.INSTAGRAM_ACCESS_TOKEN)),
  };

  // setJson swallows errors, so read back to know whether the token was kept.
  await setJson(KV_KEY, record, { exSeconds: expiresIn + DAY });
  let stored = false;
  try { stored = (await getJson(KV_KEY))?.refreshedAt === record.refreshedAt; } catch { /* reported below */ }

  return { ok: true, expiresAt, daysLeft: daysUntil(expiresAt), stored };
}
