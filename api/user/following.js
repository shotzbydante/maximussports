/**
 * GET /api/user/following
 *
 * Returns the list of users the authenticated user is following with profile summaries.
 */

import { verifyUserToken } from '../_lib/supabaseAdmin.js';
import { getSupabaseAdmin } from '../_lib/supabaseAdmin.js';

/** Normalize a profile row + followStatus into the dropdown contract. */
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
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = req.headers.authorization?.slice(7);
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const user = await verifyUserToken(token).catch(() => null);
  if (!user) return res.status(401).json({ error: 'Invalid token' });

  let admin;
  try {
    admin = getSupabaseAdmin();
  } catch (err) {
    console.error('[following] Admin client init failed:', err.message);
    return res.status(503).json({ error: 'Service unavailable' });
  }

  try {
    const { data: follows, error } = await admin
      .from('follows')
      .select('following_user_id, created_at')
      .eq('follower_user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      console.error('[following] follows query error:', error.message, error.code);
      return res.status(500).json({ error: 'Failed to fetch following' });
    }

    const followingIds = (follows || []).map(f => f.following_user_id);

    if (followingIds.length === 0) {
      return res.status(200).json({ following: [], total: 0 });
    }

    const { data: profiles, error: profileErr } = await admin
      .from('profiles')
      .select('id, username, display_name, plan_tier, preferences')
      .in('id', followingIds);

    if (profileErr) {
      console.warn('[following] profiles query error:', profileErr.message);
    }

    const profileMap = {};
    (profiles || []).forEach(p => { profileMap[p.id] = p; });

    const { data: myFollowers } = await admin
      .from('follows')
      .select('follower_user_id')
      .eq('following_user_id', user.id);

    const followerSet = new Set((myFollowers || []).map(f => f.follower_user_id));

    const following = followingIds.map(id => {
      const followsMe = followerSet.has(id);
      return normalizeUser(id, profileMap[id], followsMe ? 'friends' : 'following');
    });

    return res.status(200).json({ following, total: following.length });
  } catch (err) {
    console.error('[following] unexpected error:', err);
    return res.status(500).json({ error: 'Internal error fetching following' });
  }
}
