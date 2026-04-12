/**
 * POST /api/teams/pin
 *
 * Server-validated team pin/unpin endpoint.
 * Enforces Free tier limits with grace window.
 *
 * Body:
 *   { action: 'add' | 'remove', slug: string }
 *
 * Auth: Bearer <supabase-access-token>
 *
 * Response:
 *   { ok: true, action, slug, teamCount, graceRemaining }
 *   { ok: false, error, reason: 'limit_exceeded' | 'grace_exceeded' }
 */

import { verifyUserToken, getSupabaseAdmin } from '../_lib/supabaseAdmin.js';
import { validateTeamAdd, incrementGraceCounter, maybeResetGraceCounter, getUserTeamCount } from '../_lib/teamPinValidator.js';

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

  const { action, slug } = req.body || {};
  if (!action || !slug) {
    return res.status(400).json({ ok: false, error: 'Missing action or slug.' });
  }
  if (action !== 'add' && action !== 'remove') {
    return res.status(400).json({ ok: false, error: 'Action must be "add" or "remove".' });
  }

  let sb;
  try { sb = getSupabaseAdmin(); }
  catch { return res.status(503).json({ ok: false, error: 'Database unavailable.' }); }

  // Fetch profile for entitlement check
  const { data: profile } = await sb.from('profiles')
    .select('plan_tier, subscription_status, team_adds_since_limit')
    .eq('id', user.id)
    .maybeSingle();

  if (action === 'add') {
    // Validate against limits
    const currentCount = await getUserTeamCount(sb, user.id);
    const validation = validateTeamAdd(profile, currentCount, 1);

    if (!validation.allowed) {
      console.log(`[teams/pin] BLOCKED add for user=${user.id} slug=${slug} reason=${validation.reason} count=${currentCount}`);
      return res.status(403).json({
        ok: false,
        error: validation.reason === 'grace_exceeded'
          ? 'You\u2019ve reached your free team rotation limit. Upgrade to Pro for unlimited tracking.'
          : 'Free plan supports up to 3 teams. Upgrade to Pro for unlimited tracking.',
        reason: validation.reason,
        teamCount: currentCount,
        graceRemaining: validation.graceRemaining,
      });
    }

    // Persist
    const { error } = await sb.from('user_teams').upsert(
      { user_id: user.id, team_slug: slug },
      { onConflict: 'user_id,team_slug', ignoreDuplicates: true }
    );
    if (error) {
      console.error(`[teams/pin] add failed for user=${user.id}:`, error.message);
      return res.status(500).json({ ok: false, error: 'Failed to pin team.' });
    }

    // Increment grace counter if at/above limit
    const newCount = currentCount + 1;
    await incrementGraceCounter(sb, user.id, newCount);

    console.log(`[teams/pin] ADD user=${user.id} slug=${slug} count=${newCount} grace=${validation.graceRemaining}`);
    return res.status(200).json({
      ok: true, action: 'add', slug,
      teamCount: newCount,
      graceRemaining: validation.graceRemaining,
    });
  }

  if (action === 'remove') {
    const { error } = await sb.from('user_teams')
      .delete()
      .eq('user_id', user.id)
      .eq('team_slug', slug);
    if (error) {
      console.error(`[teams/pin] remove failed for user=${user.id}:`, error.message);
      return res.status(500).json({ ok: false, error: 'Failed to unpin team.' });
    }

    const newCount = await getUserTeamCount(sb, user.id);
    await maybeResetGraceCounter(sb, user.id, newCount);

    console.log(`[teams/pin] REMOVE user=${user.id} slug=${slug} count=${newCount}`);
    return res.status(200).json({
      ok: true, action: 'remove', slug,
      teamCount: newCount,
    });
  }
}
