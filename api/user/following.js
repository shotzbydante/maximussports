/**
 * GET /api/user/following
 *
 * Returns the list of users the authenticated user is following.
 *
 * Uses getSupabaseAdmin() (service-role client) for ALL queries — this is the
 * exact same client pattern used by the working api/social/follow.js endpoint.
 * The service role bypasses RLS, eliminating dependency on whether RLS SELECT
 * policies have been applied to the follows/profiles tables.
 *
 * Profile enrichment and reverse-follow status are optional — if they fail,
 * the route still returns the core list with safe defaults.
 */

import { getSupabaseAdmin, getEnvStatus } from '../_lib/supabaseAdmin.js';

function normalizeUser(id, profile, followStatus) {
  return {
    id,
    username: profile?.username || '',
    displayName: profile?.display_name || profile?.username || '',
    avatarConfig: profile?.preferences?.robotConfig || null,
    isPro: profile?.plan_tier === 'pro',
    followStatus,
  };
}

export default async function handler(req, res) {
  const t0 = Date.now();

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  let sb;
  try {
    sb = getSupabaseAdmin();
  } catch (err) {
    const env = getEnvStatus();
    console.error('[following] admin client init failed:', err.message, JSON.stringify(env));
    return res.status(503).json({ error: 'Service unavailable' });
  }

  // Auth — same pattern as the working api/social/follow.js
  const t1 = Date.now();
  const { data: authData, error: authErr } = await sb.auth.getUser(token);
  if (authErr || !authData?.user) {
    console.warn('[following] auth failed after', Date.now() - t1, 'ms:', authErr?.message);
    return res.status(401).json({ error: 'Invalid token' });
  }
  const userId = authData.user.id;

  try {
    // Primary query — who am I following?
    const t2 = Date.now();
    const { data: follows, error: followsErr } = await sb
      .from('follows')
      .select('following_user_id')
      .eq('follower_user_id', userId);

    console.log('[following] follows query:', Date.now() - t2, 'ms, rows:', follows?.length ?? 'null', followsErr ? `err=${followsErr.message}` : 'ok');

    if (followsErr) {
      return res.status(500).json({ error: 'Failed to query follows' });
    }

    const ids = (follows || []).map(f => f.following_user_id);
    if (!ids.length) {
      console.log('[following] empty list, total:', Date.now() - t0, 'ms');
      return res.status(200).json({ following: [], total: 0 });
    }

    // Enrichment — profiles + reverse follows (parallel, non-blocking)
    let profileMap = {};
    let mutualSet = new Set();

    const t3 = Date.now();
    try {
      const [profilesRes, reverseRes] = await Promise.all([
        sb.from('profiles')
          .select('id, username, display_name, plan_tier, preferences')
          .in('id', ids),
        sb.from('follows')
          .select('follower_user_id')
          .eq('following_user_id', userId)
          .in('follower_user_id', ids),
      ]);

      if (profilesRes.data) {
        profilesRes.data.forEach(p => { profileMap[p.id] = p; });
      }
      if (profilesRes.error) {
        console.warn('[following] profiles query warning:', profilesRes.error.message);
      }
      if (reverseRes.data) {
        reverseRes.data.forEach(r => { mutualSet.add(r.follower_user_id); });
      }
      if (reverseRes.error) {
        console.warn('[following] reverse query warning:', reverseRes.error.message);
      }
    } catch (enrichErr) {
      console.warn('[following] enrichment failed after', Date.now() - t3, 'ms:', enrichErr.message);
    }
    console.log('[following] enrichment:', Date.now() - t3, 'ms, profiles:', Object.keys(profileMap).length, 'mutuals:', mutualSet.size);

    const following = ids.map(id =>
      normalizeUser(id, profileMap[id], mutualSet.has(id) ? 'friends' : 'following')
    );

    console.log('[following] done, total:', Date.now() - t0, 'ms, count:', following.length);
    return res.status(200).json({ following, total: following.length });
  } catch (err) {
    console.error('[following] unexpected error after', Date.now() - t0, 'ms:', err.message, err.stack);
    return res.status(500).json({ error: 'Internal error' });
  }
}
