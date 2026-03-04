/**
 * Supabase admin client for server-side use.
 * Uses the service role key — never expose to the browser.
 * Requires env vars: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js';

let _adminClient = null;

export function getSupabaseAdmin() {
  if (_adminClient) return _adminClient;

  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('[supabaseAdmin] VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set.');
  }

  _adminClient = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return _adminClient;
}

/**
 * Verify a user's JWT and return the user object.
 * @param {string} token — Bearer JWT from Authorization header
 * @returns {Promise<object|null>} Supabase user or null
 */
export async function verifyUserToken(token) {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}
