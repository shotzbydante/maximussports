/**
 * GET /api/user/following
 *
 * Returns the list of users the authenticated user is following with profile summaries.
 */

import { verifyUserToken } from '../_lib/supabaseAdmin.js';
import { getSupabaseAdmin } from '../_lib/supabaseAdmin.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = req.headers.authorization?.slice(7);
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const user = await verifyUserToken(token).catch(() => null);
  if (!user) return res.status(401).json({ error: 'Invalid token' });

  try {
    const admin = getSupabaseAdmin();

    const { data: follows, error } = await admin
      .from('follows')
      .select('following_user_id, created_at')
      .eq('follower_user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;

    const followingIds = (follows || []).map(f => f.following_user_id);

    if (followingIds.length === 0) {
      return res.status(200).json({ following: [], total: 0 });
    }

    const { data: profiles } = await admin
      .from('profiles')
      .select('id, username, display_name, plan_tier, preferences')
      .in('id', followingIds);

    const profileMap = {};
    (profiles || []).forEach(p => { profileMap[p.id] = p; });

    const { data: myFollowers } = await admin
      .from('follows')
      .select('follower_user_id')
      .eq('following_user_id', user.id);

    const followerSet = new Set((myFollowers || []).map(f => f.follower_user_id));

    const following = followingIds.map(id => {
      const p = profileMap[id] || {};
      const followsMe = followerSet.has(id);
      return {
        id,
        username: p.username || '',
        displayName: p.display_name || p.username || '',
        avatarConfig: p.preferences?.robotConfig || null,
        isPro: p.plan_tier === 'pro',
        followStatus: followsMe ? 'friends' : 'following',
      };
    });

    return res.status(200).json({ following, total: following.length });
  } catch (err) {
    console.error('[following] error:', err);
    return res.status(200).json({ following: [], total: 0 });
  }
}
