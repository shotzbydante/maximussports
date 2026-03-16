import { createClient } from '@supabase/supabase-js';
import { getQueryParam } from '../_requestUrl.js';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authHeader.slice(7);
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const limit = Math.min(parseInt(getQueryParam(req, 'limit', '20')) || 20, 50);
  const offset = parseInt(getQueryParam(req, 'offset', '0')) || 0;

  try {
    const { data: following } = await supabaseAdmin
      .from('follows')
      .select('following_user_id')
      .eq('follower_user_id', user.id);

    const friendIds = (following || []).map(f => f.following_user_id);

    if (friendIds.length === 0) {
      return res.status(200).json({ activities: [], hasMore: false });
    }

    let activities = [];
    try {
      const { data, error } = await supabaseAdmin
        .from('friend_activity')
        .select(`
          id,
          user_id,
          activity_type,
          title,
          subtitle,
          metadata,
          created_at
        `)
        .in('user_id', friendIds)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);
      if (!error) activities = data || [];
    } catch {
      // friend_activity table may not exist yet
    }

    const userIds = [...new Set(activities.map(a => a.user_id))];
    const { data: profiles } = await supabaseAdmin
      .from('profiles')
      .select('id, username, display_name, plan_tier, preferences')
      .in('id', userIds);

    const profileMap = {};
    (profiles || []).forEach(p => {
      profileMap[p.id] = {
        username: p.username,
        displayName: p.display_name || p.username,
        avatarConfig: p.preferences?.robotConfig || null,
        isPro: p.plan_tier === 'pro',
      };
    });

    const enriched = activities.map(a => ({
      ...a,
      user: profileMap[a.user_id] || { username: 'Unknown', displayName: 'Unknown' },
    }));

    return res.status(200).json({
      activities: enriched,
      hasMore: activities.length === limit,
    });
  } catch (err) {
    console.error('[friends-feed] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
