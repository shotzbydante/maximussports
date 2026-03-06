/**
 * POST /api/profile/ensure
 *
 * Ensures a minimal profiles row exists for the authenticated user.
 * Uses the Supabase service role key (bypasses RLS).
 *
 * Writes ONLY columns that are guaranteed to exist in all deployments:
 *   id, plan_tier, subscription_status, updated_at
 *
 * NEVER writes: email (not a column in profiles — email is in auth.users),
 *               stripe_customer_id, cancel_at_period_end, etc.
 *
 * Uses ignoreDuplicates so existing Pro state is never overwritten.
 *
 * Security:
 *   - Requires valid Supabase JWT (Bearer token).
 *   - Only writes the caller's own row (user ID from JWT, never request body).
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

  // ignoreDuplicates: true — never overwrites existing plan_tier / stripe fields.
  // Only writes confirmed-safe columns: id, plan_tier, subscription_status, updated_at.
  const { error } = await sb.from('profiles').insert(
    {
      id:                  caller.id,
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
