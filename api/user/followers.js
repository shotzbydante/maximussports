/**
 * GET /api/user/followers
 *
 * Returns the authenticated user's followers list with profile summaries.
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
    console.error('[followers] Admin client init failed:', err.message);
    return res.status(503).json({ error: 'Service unavailable' });
  }

  try {
    const { data: follows, error } = await admin
      .from('follows')
      .select('follower_user_id, created_at')
      .eq('following_user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      console.error('[followers] follows query error:', error.message, error.code);
      return res.status(500).json({ error: 'Failed to fetch followers' });
    }

    const followerIds = (follows || []).map(f => f.follower_user_id);

    if (followerIds.length === 0) {
      return res.status(200).json({ followers: [], total: 0 });
    }

    const { data: profiles, error: profileErr } = await admin
      .from('profiles')
      .select('id, username, display_name, plan_tier, preferences')
      .in('id', followerIds);

    if (profileErr) {
      console.warn('[followers] profiles query error:', profileErr.message);
    }

    const profileMap = {};
    (profiles || []).forEach(p => { profileMap[p.id] = p; });

    const { data: myFollowing } = await admin
      .from('follows')
      .select('following_user_id')
      .eq('follower_user_id', user.id);

    const followingSet = new Set((myFollowing || []).map(f => f.following_user_id));

    const followers = followerIds.map(id => {
      const iFollow = followingSet.has(id);
      return normalizeUser(id, profileMap[id], iFollow ? 'friends' : 'follower');
    });

    return res.status(200).json({ followers, total: followers.length });
  } catch (err) {
    console.error('[followers] unexpected error:', err);
    return res.status(500).json({ error: 'Internal error fetching followers' });
  }
}
