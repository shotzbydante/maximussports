import { getSupabase } from './supabaseClient';

/**
 * Authorization header for the signed-in user, for calls to privileged
 * serverless routes. Returns {} when there is no session, in which case the
 * route responds 401.
 */
export async function getAuthHeaders() {
  try {
    const sb = getSupabase();
    if (!sb) return {};
    const { data } = await sb.auth.getSession();
    const token = data?.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}
