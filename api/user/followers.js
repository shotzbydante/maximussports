/**
 * GET /api/user/followers
 *
 * Returns the authenticated user's followers list with profile summaries.
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
      .select('follower_user_id, created_at')
      .eq('following_user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;

    const followerIds = (follows || []).map(f => f.follower_user_id);

    if (followerIds.length === 0) {
      return res.status(200).json({ followers: [], total: 0 });
    }

    const { data: profiles } = await admin
      .from('profiles')
      .select('id, username, display_name, plan_tier, preferences')
      .in('id', followerIds);

    const profileMap = {};
    (profiles || []).forEach(p => { profileMap[p.id] = p; });

    const { data: myFollowing } = await admin
      .from('follows')
      .select('following_user_id')
      .eq('follower_user_id', user.id);

    const followingSet = new Set((myFollowing || []).map(f => f.following_user_id));

    const followers = followerIds.map(id => {
      const p = profileMap[id] || {};
      const iFollow = followingSet.has(id);
      return {
        id,
        username: p.username || '',
        displayName: p.display_name || p.username || '',
        avatarConfig: p.avatar_config || p.preferences?.robotConfig || null,
        isPro: p.plan_tier === 'pro',
        followStatus: iFollow ? 'friends' : 'follower',
      };
    });

    return res.status(200).json({ followers, total: followers.length });
  } catch (err) {
    console.error('[followers] error:', err);
    return res.status(200).json({ followers: [], total: 0 });
  }
}
