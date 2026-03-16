/**
 * Supabase server-side clients.
 *
 * Two separate clients:
 *
 *  verifyUserToken(jwt)  — uses the ANON key to validate a caller's JWT.
 *    Requires: SUPABASE_URL (or VITE_SUPABASE_URL) + SUPABASE_ANON_KEY (or VITE_SUPABASE_ANON_KEY)
 *    ↑ JWT verification does NOT need the service role key.
 *
 *  getSupabaseAdmin()    — uses the SERVICE ROLE key for privileged server operations
 *                          (e.g. auth.admin.listUsers in run-daily.js).
 *    Requires: SUPABASE_URL (or VITE_SUPABASE_URL) + SUPABASE_SERVICE_ROLE_KEY
 *
 * Env var fallbacks let both VITE_* (Vite-prefixed) and plain names work so the same
 * variables set in Vercel work for both the frontend build and serverless functions.
 */

import { createClient } from '@supabase/supabase-js';

// ── Env resolution (never log values — only their presence) ─────────────────
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

/** Safe snapshot for diagnostic logs — booleans only, no secret values. */
export function getEnvStatus() {
  return {
    hasUrl:            Boolean(SUPABASE_URL),
    urlHost:           SUPABASE_URL ? new URL(SUPABASE_URL).host : '(missing)',
    hasAnonKey:        Boolean(SUPABASE_ANON_KEY),
    hasServiceRoleKey: Boolean(SERVICE_ROLE_KEY),
  };
}

// ── Lightweight anon-key client used only for JWT verification ───────────────
let _anonClient = null;

function getAnonClient() {
  if (_anonClient) return _anonClient;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    const err = new Error(
      'Supabase URL or anon key not configured. ' +
      'Set SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_ANON_KEY (or VITE_SUPABASE_ANON_KEY) in Vercel.'
    );
    err.code = 'AUTH_UNAVAILABLE';
    throw err;
  }
  _anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return _anonClient;
}

/**
 * Verify a caller's JWT and return the Supabase user object, or null on failure.
 * Uses the anon key — does NOT require the service role key.
 *
 * @param {string} token — raw JWT from Authorization: Bearer <token>
 * @returns {Promise<object|null>}
 */
export async function verifyUserToken(token) {
  const sb = getAnonClient(); // throws with code='AUTH_UNAVAILABLE' if misconfigured
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

// ── User-scoped client (for RPCs that rely on auth.uid()) ────────────────────

/**
 * Creates a Supabase client authenticated as the given user via their JWT.
 * Use for calling DB RPCs (follow_user, unfollow_user, mark_notifications_read)
 * that reference auth.uid() internally.
 * NOT cached — one per request.
 */
export function getUserClient(jwt) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    const err = new Error('Supabase URL or anon key not configured.');
    err.code = 'AUTH_UNAVAILABLE';
    throw err;
  }
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
}

// ── Service-role admin client (privileged operations only) ───────────────────
let _adminClient = null;

/**
 * Returns a Supabase client with the service role key.
 * Only required for privileged operations like auth.admin.listUsers().
 * Throws if SUPABASE_SERVICE_ROLE_KEY is not set.
 */
export function getSupabaseAdmin() {
  if (_adminClient) return _adminClient;
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    const err = new Error(
      'Supabase URL or service role key not configured. ' +
      'Set SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY in Vercel.'
    );
    err.code = 'AUTH_UNAVAILABLE';
    throw err;
  }
  _adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return _adminClient;
}
