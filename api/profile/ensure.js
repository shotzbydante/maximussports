/**
 * POST /api/profile/ensure
 *
 * Ensures a minimal profiles row exists for the authenticated user.
 * Uses the Supabase service role key (bypasses RLS).
 *
 * Writes: id, plan_tier, subscription_status, preferences, updated_at,
 *         display_name (derived from auth metadata for discoverability).
 *
 * NEVER writes: email (not a column in profiles — email is in auth.users),
 *               stripe_customer_id, cancel_at_period_end, etc.
 *
 * Uses ignoreDuplicates so existing Pro state is never overwritten.
 * After insert, backfills display_name for existing rows that lack one.
 *
 * Security:
 *   - Requires valid Supabase JWT (Bearer token).
 *   - Only writes the caller's own row (user ID from JWT, never request body).
 */

import { verifyUserToken, getSupabaseAdmin } from '../_lib/supabaseAdmin.js';
import { DEFAULT_EMAIL_PREFS } from '../_lib/emailDefaults.js';
import { captureAccountCreated } from '../_lib/posthogServer.js';

function extractDisplayName(authUser) {
  const meta = authUser.user_metadata || {};
  return (
    meta.full_name ||
    meta.name ||
    meta.display_name ||
    (authUser.email ? authUser.email.split('@')[0] : null)
  );
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

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

  let sb;
  try {
    sb = getSupabaseAdmin();
  } catch {
    return res.status(503).json({ ok: false, error: 'Database service unavailable' });
  }

  const defaultPrefs = { ...DEFAULT_EMAIL_PREFS };
  const now = new Date().toISOString();
  const derivedName = extractDisplayName(caller);

  const insertRow = {
    id:                  caller.id,
    plan_tier:           'free',
    subscription_status: 'inactive',
    preferences:         defaultPrefs,
    updated_at:          now,
  };
  if (derivedName) insertRow.display_name = derivedName;

  const { error } = await sb.from('profiles').insert(
    insertRow,
    { onConflict: 'id', ignoreDuplicates: true }
  );

  let existed = false;
  if (error) {
    const isDuplicate = error.code === '23505' || /duplicate key/i.test(error.message ?? '');
    if (isDuplicate) {
      existed = true;
    } else {
      console.error(`[profile/ensure] Upsert error for user=${caller.id}:`, error.message);
      return res.status(500).json({ ok: false, error: 'Could not ensure profile row' });
    }
  }

  if (existed && derivedName) {
    try {
      const { data: existing } = await sb
        .from('profiles')
        .select('display_name')
        .eq('id', caller.id)
        .maybeSingle();

      if (existing && !existing.display_name) {
        await sb
          .from('profiles')
          .update({ display_name: derivedName, updated_at: now })
          .eq('id', caller.id);
        console.log(`[profile/ensure] Backfilled display_name="${derivedName}" for user=${caller.id}`);
      }
    } catch (err) {
      console.warn(`[profile/ensure] Backfill warning for user=${caller.id}:`, err.message);
    }
  }

  if (existed) {
    return res.status(200).json({ ok: true, existed: true });
  }

  // Fire server-side PostHog account_created (canonical, guaranteed event).
  // Awaited so the event is sent before the Vercel function terminates.
  let posthogTracked = false;
  try {
    posthogTracked = await captureAccountCreated(caller, {
      sourcePath: 'server_ensure',
    });
  } catch (err) {
    console.warn(`[profile/ensure] PostHog capture failed for user=${caller.id}:`, err?.message);
  }

  console.log(`[profile/ensure] Created profile for user=${caller.id} display_name="${derivedName || '(none)'}" posthog=${posthogTracked}`);
  return res.status(200).json({ ok: true, created: true, posthog_tracked: posthogTracked });
}
