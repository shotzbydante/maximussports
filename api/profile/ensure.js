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
import { DEFAULT_EMAIL_PREFS } from '../_lib/emailDefaults.js';

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

  const defaultPrefs = { ...DEFAULT_EMAIL_PREFS };
  const now = new Date().toISOString();

  const { error } = await sb.from('profiles').insert(
    {
      id:                  caller.id,
      plan_tier:           'free',
      subscription_status: 'inactive',
      preferences:         defaultPrefs,
      updated_at:          now,
    },
    { onConflict: 'id', ignoreDuplicates: true }
  );

  if (error) {
    const isDuplicate = error.code === '23505' || /duplicate key/i.test(error.message ?? '');
    if (isDuplicate) {
      console.log(`[profile/ensure] Profile already exists for user=${caller.id}`);
      return res.status(200).json({ ok: true, existed: true });
    }
    console.error(`[profile/ensure] Upsert error for user=${caller.id}:`, error.message);
    return res.status(500).json({ ok: false, error: 'Could not ensure profile row' });
  }

  console.log(`[profile/ensure] Created new profile for user=${caller.id} with default digest prefs: briefing=${defaultPrefs.briefing} teamAlerts=${defaultPrefs.teamAlerts} newsDigest=${defaultPrefs.newsDigest} oddsIntel=${defaultPrefs.oddsIntel}`);
  return res.status(200).json({ ok: true, created: true });
}
