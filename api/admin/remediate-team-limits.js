/**
 * POST /api/admin/remediate-team-limits
 *
 * Remediation for existing free users who exceeded the 3-team cap via
 * historical bypass paths (onboarding bulk insert, unvalidated client
 * upserts, stale-localStorage merge). These paths are now hardened, but
 * existing invalid users must be remediated.
 *
 * Strategy:
 *   - Query all profiles where effective plan is free
 *   - For each, count user_teams rows
 *   - If count > 3, keep the 3 oldest (by created_at ASC) and delete the rest
 *   - Reset team_adds_since_limit to 0 (their rotation window resets)
 *
 * Auth:
 *   Requires service-role secret in X-Admin-Secret header.
 *   Set env MAXIMUS_ADMIN_SECRET — reject any call without match.
 *
 * Query params:
 *   ?dryRun=1  → report counts only, do NOT delete (default)
 *   ?dryRun=0  → actually delete
 *
 * Response:
 *   { ok, dryRun, scanned, invalidUsers, totalExcessTeams, trimmed, report }
 */

import { getSupabaseAdmin } from '../_lib/supabaseAdmin.js';
import { effectivePlanTier } from '../_lib/entitlements.js';

const FREE_LIMIT = 3;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Service-secret auth (never expose to client)
  const providedSecret = req.headers['x-admin-secret'];
  const expectedSecret = process.env.MAXIMUS_ADMIN_SECRET;
  if (!expectedSecret) {
    return res.status(503).json({ ok: false, error: 'Admin secret not configured.' });
  }
  if (!providedSecret || providedSecret !== expectedSecret) {
    return res.status(401).json({ ok: false, error: 'Unauthorized.' });
  }

  const dryRun = req.query?.dryRun !== '0'; // default: dry run

  let sb;
  try { sb = getSupabaseAdmin(); }
  catch { return res.status(503).json({ ok: false, error: 'Database unavailable.' }); }

  // Scan all profiles
  const { data: profiles, error: profErr } = await sb
    .from('profiles')
    .select('id, plan_tier, subscription_status, team_adds_since_limit');

  if (profErr) {
    return res.status(500).json({ ok: false, error: profErr.message });
  }

  let scanned = 0;
  const invalidUsers = [];
  let totalExcessTeams = 0;
  let trimmed = 0;
  const report = [];

  for (const profile of profiles || []) {
    scanned++;
    const tier = effectivePlanTier(profile);
    if (tier === 'pro') continue; // pro users have unlimited

    const { data: teams, error: teamsErr } = await sb
      .from('user_teams')
      .select('id, team_slug, created_at, is_primary')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: true });

    if (teamsErr) {
      report.push({ user_id: profile.id, error: teamsErr.message });
      continue;
    }

    const count = teams?.length || 0;
    if (count <= FREE_LIMIT) continue;

    invalidUsers.push({
      user_id: profile.id,
      plan_tier: tier,
      team_count: count,
      excess: count - FREE_LIMIT,
    });
    totalExcessTeams += (count - FREE_LIMIT);

    // Keep the first 3 (oldest), trim the rest.
    const keep = teams.slice(0, FREE_LIMIT);
    const drop = teams.slice(FREE_LIMIT);
    const dropIds = drop.map(t => t.id);

    report.push({
      user_id: profile.id,
      team_count: count,
      kept: keep.map(t => t.team_slug),
      dropped: drop.map(t => t.team_slug),
    });

    if (!dryRun) {
      // Delete excess rows
      const { error: delErr } = await sb
        .from('user_teams')
        .delete()
        .in('id', dropIds);

      if (delErr) {
        report[report.length - 1].error = delErr.message;
        continue;
      }

      trimmed += dropIds.length;

      // Reset grace counter since user is now back below limit
      await sb.from('profiles')
        .update({ team_adds_since_limit: 0, updated_at: new Date().toISOString() })
        .eq('id', profile.id);
    }
  }

  console.log('[admin/remediate-team-limits]', {
    dryRun, scanned, invalid: invalidUsers.length, excess: totalExcessTeams, trimmed,
  });

  return res.status(200).json({
    ok: true,
    dryRun,
    scanned,
    invalidUsers,
    totalExcessTeams,
    trimmed,
    report,
  });
}
