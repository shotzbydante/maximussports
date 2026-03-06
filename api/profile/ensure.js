/**
 * POST /api/profile/ensure
 *
 * Ensures a minimal profiles row exists for the authenticated user.
 * Uses the Supabase service role key (bypasses RLS), so this is the reliable
 * fallback when the client-side upsert fails due to RLS policy restrictions.
 *
 * Security:
 *   - Requires a valid Supabase JWT (Bearer token).
 *   - Only writes the caller's own row (user ID taken from JWT, never request body).
 *   - Only writes minimal safe defaults — never overwrites existing plan/stripe data.
 *
 * Required env vars (same as other serverless routes):
 *   SUPABASE_URL / VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   SUPABASE_ANON_KEY / VITE_SUPABASE_ANON_KEY
 */

import { verifyUserToken, getSupabaseAdmin } from '../_lib/supabaseAdmin.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  // ── Authenticate ──────────────────────────────────────────────────────────
  const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  if (!token) {
    return res.status(401).json({ ok: false, error: 'Missing authorization token' });
  }

  let caller;
  try {
    caller = await verifyUserToken(token);
  } catch {
    return res.status(503).json({ ok: false, error: 'Auth service unavailable' });
  }

  if (!caller?.id) {
    return res.status(401).json({ ok: false, error: 'Invalid or expired token' });
  }

  // ── Upsert profile shell (service role, bypasses RLS) ────────────────────
  let sb;
  try {
    sb = getSupabaseAdmin();
  } catch {
    return res.status(503).json({ ok: false, error: 'Database service unavailable' });
  }

  // Use ignoreDuplicates so we never overwrite existing plan_tier / stripe fields.
  const { error } = await sb.from('profiles').insert(
    {
      id:                  caller.id,
      email:               caller.email ?? null,
      plan_tier:           'free',
      subscription_status: 'inactive',
      updated_at:          new Date().toISOString(),
    },
    { onConflict: 'id', ignoreDuplicates: true }
  );

  if (error) {
    console.error('[profile/ensure] upsert error:', error.message);
    return res.status(500).json({ ok: false, error: 'Could not ensure profile row' });
  }

  return res.status(200).json({ ok: true });
}
