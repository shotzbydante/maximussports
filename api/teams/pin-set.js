/**
 * POST /api/teams/pin-set
 *
 * Server-validated FULL SET replacement for pinned teams.
 * Used by onboarding bulk insert, sync hydration, and any other flow
 * that needs to persist a full team set instead of single add/remove.
 *
 * Enforces the free-tier cap (3 teams) against the ENTIRE resulting set —
 * this validator rejects regardless of grace window, because grace only
 * applies to single-add rotational replacement, not full-set writes.
 *
 * Body:
 *   { slugs: string[], source?: 'onboarding' | 'sync' | 'settings' | ... }
 *
 * Auth: Bearer <supabase-access-token>
 *
 * Response:
 *   { ok: true, slugs, teamCount, plan_tier }
 *   { ok: false, error, reason, limit, attemptedCount }
 */

import { verifyUserToken, getSupabaseAdmin } from '../_lib/supabaseAdmin.js';
import {
  validatePinnedTeamsSet,
  maybeResetGraceCounter,
  getUserTeamCount,
  logTeamsValidation,
} from '../_lib/teamPinValidator.js';
import { effectivePlanTier } from '../_lib/entitlements.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Auth
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (!token) return res.status(401).json({ ok: false, error: 'Not signed in.' });

  let user;
  try { user = await verifyUserToken(token); }
  catch { return res.status(503).json({ ok: false, error: 'Auth unavailable.' }); }
  if (!user) return res.status(401).json({ ok: false, error: 'Invalid session.' });

  const { slugs, source } = req.body || {};
  if (!Array.isArray(slugs)) {
    return res.status(400).json({ ok: false, error: 'slugs must be an array.' });
  }

  // Dedupe + filter empties
  const cleanSlugs = [...new Set(slugs.filter(s => typeof s === 'string' && s.trim().length > 0))];

  let sb;
  try { sb = getSupabaseAdmin(); }
  catch { return res.status(503).json({ ok: false, error: 'Database unavailable.' }); }

  // Fetch profile for entitlement check
  const { data: profile } = await sb.from('profiles')
    .select('plan_tier, subscription_status, team_adds_since_limit')
    .eq('id', user.id)
    .maybeSingle();

  const planTier = effectivePlanTier(profile);
  const currentCount = await getUserTeamCount(sb, user.id);

  // Validate the full resulting set
  const validation = validatePinnedTeamsSet(profile, cleanSlugs);

  logTeamsValidation('pin-set', {
    user_id: user.id,
    plan_tier: planTier,
    source: source || 'unknown',
    attempted_count: validation.attemptedCount,
    backend_current_count: currentCount,
    limit: validation.limit === Infinity ? 'unlimited' : validation.limit,
    allowed: validation.allowed,
    reason: validation.reason,
  });

  if (!validation.allowed) {
    return res.status(403).json({
      ok: false,
      error: `Free plan supports up to ${validation.limit} teams. Upgrade to Pro for unlimited tracking.`,
      reason: validation.reason,
      limit: validation.limit,
      attemptedCount: validation.attemptedCount,
      teamCount: currentCount,
    });
  }

  // Persist: idempotent full replacement inside a single logical operation.
  // (Supabase JS client does not expose transactions; we do delete-then-insert,
  // tolerating the brief window — this endpoint is only called from trusted
  // flows and the validator has already accepted the set.)
  try {
    const { error: delErr } = await sb.from('user_teams')
      .delete()
      .eq('user_id', user.id);
    if (delErr) throw delErr;

    if (cleanSlugs.length > 0) {
      const rows = cleanSlugs.map((slug, i) => ({
        user_id: user.id,
        team_slug: slug,
        is_primary: i === 0,
        created_at: new Date().toISOString(),
      }));
      const { error: insErr } = await sb.from('user_teams').insert(rows);
      if (insErr) throw insErr;
    }
  } catch (err) {
    console.error(`[teams/pin-set] persist failed for user=${user.id}:`, err.message);
    return res.status(500).json({ ok: false, error: 'Failed to save teams.' });
  }

  // Reset or leave grace counter based on final count
  await maybeResetGraceCounter(sb, user.id, cleanSlugs.length);

  // Re-read authoritative count for response + downstream analytics
  const newCount = await getUserTeamCount(sb, user.id);

  return res.status(200).json({
    ok: true,
    slugs: cleanSlugs,
    teamCount: newCount,
    plan_tier: planTier,
  });
}
