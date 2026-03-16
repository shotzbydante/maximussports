/**
 * GET /api/user/following
 *
 * Returns the list of users the authenticated user is following.
 *
 * Uses getUserClient (user-scoped JWT) for follows queries — this matches
 * the pattern in api/social/follow.js and works reliably with RLS.
 * Admin client is used only for cross-user profile reads (profiles RLS
 * restricts to own row, so service role is needed for other users' data).
 */

import { verifyUserToken, getUserClient, getSupabaseAdmin } from '../_lib/supabaseAdmin.js';

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

  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const user = await verifyUserToken(token).catch(() => null);
  if (!user) return res.status(401).json({ error: 'Invalid token' });

  try {
    const userSb = getUserClient(token);

    const { data: follows, error: followsErr } = await userSb
      .from('follows')
      .select('following_user_id')
      .eq('follower_user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100);

    if (followsErr) {
      console.error('[following] follows query failed:', followsErr.message, followsErr.code);
      return res.status(500).json({ error: 'Failed to query follows' });
    }

    const ids = (follows || []).map(f => f.following_user_id);
    if (ids.length === 0) {
      return res.status(200).json({ following: [], total: 0 });
    }

    const [profilesResult, reverseResult] = await Promise.allSettled([
      fetchProfiles(ids),
      userSb.from('follows').select('follower_user_id').eq('following_user_id', user.id).in('follower_user_id', ids),
    ]);

    const profileMap = {};
    if (profilesResult.status === 'fulfilled') {
      (profilesResult.value || []).forEach(p => { profileMap[p.id] = p; });
    }

    const mutualSet = new Set();
    if (reverseResult.status === 'fulfilled' && reverseResult.value?.data) {
      reverseResult.value.data.forEach(r => mutualSet.add(r.follower_user_id));
    }

    const following = ids.map(id =>
      normalizeUser(id, profileMap[id], mutualSet.has(id) ? 'friends' : 'following')
    );

    return res.status(200).json({ following, total: following.length });
  } catch (err) {
    console.error('[following] unexpected error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}

async function fetchProfiles(ids) {
  try {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from('profiles')
      .select('id, username, display_name, plan_tier, preferences')
      .in('id', ids);
    if (error) {
      console.warn('[following] profiles query warning:', error.message);
      return [];
    }
    return data || [];
  } catch (err) {
    console.warn('[following] admin client unavailable for profiles:', err.message);
    return [];
  }
}
