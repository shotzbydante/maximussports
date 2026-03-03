/**
 * Lazy Supabase client — never initialises at module load.
 *
 * Call getSupabase() wherever you need the client.
 * Returns null (and logs a warning) when env vars are absent,
 * so the app always boots even without Supabase configured.
 *
 * DO NOT export a top-level `supabase` instance.
 * DO NOT call createClient outside of getSupabase().
 */

import { createClient } from '@supabase/supabase-js';

/** @type {import('@supabase/supabase-js').SupabaseClient | null} */
let _client = null;

/**
 * Returns the singleton Supabase client, initialising it on first call.
 * Returns null if VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY are missing.
 */
export function getSupabase() {
  if (_client) return _client;

  const url  = import.meta.env.VITE_SUPABASE_URL;
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !anon) {
    console.warn('[Supabase] Not configured — auth features disabled. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to enable.');
    return null;
  }

  _client = createClient(url, anon);
  return _client;
}
