import { createClient } from '@supabase/supabase-js';
import { getQueryParam } from '../_requestUrl.js';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * GET /api/social/search?q=term
 * Case-insensitive search by username or display_name.
 * Returns up to 20 results with follow relationship status.
 */
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

  const query = (getQueryParam(req, 'q') || '').trim();
  if (!query || query.length < 2) {
    return res.status(200).json({ results: [] });
  }

  const sanitized = query.replace(/[%_\\]/g, c => '\\' + c);
  const pattern = `%${sanitized}%`;

  try {
    const { data: profiles, error } = await supabaseAdmin
      .from('profiles')
      .select('id, username, display_name, plan_tier, preferences')
      .neq('id', user.id)
      .or(`username.ilike.${pattern},display_name.ilike.${pattern}`)
      .order('followers_count', { ascending: false, nullsFirst: false })
      .limit(20);

    if (error) throw error;

    if (!profiles || profiles.length === 0) {
      return res.status(200).json({ results: [] });
    }

    const resultIds = profiles.map(p => p.id);

    const { data: myFollows } = await supabaseAdmin
      .from('follows')
      .select('following_user_id')
      .eq('follower_user_id', user.id)
      .in('following_user_id', resultIds);

    const { data: theirFollows } = await supabaseAdmin
      .from('follows')
      .select('follower_user_id')
      .eq('following_user_id', user.id)
      .in('follower_user_id', resultIds);

    const iFollowSet = new Set((myFollows || []).map(f => f.following_user_id));
    const followsMeSet = new Set((theirFollows || []).map(f => f.follower_user_id));

    const results = profiles.map(p => {
      const iFollow = iFollowSet.has(p.id);
      const followsMe = followsMeSet.has(p.id);
      let followStatus = 'none';
      if (iFollow && followsMe) followStatus = 'friends';
      else if (iFollow) followStatus = 'following';
      else if (followsMe) followStatus = 'follower';

      return {
        id: p.id,
        username: p.username,
        displayName: p.display_name || p.username,
        avatarConfig: p.avatar_config || p.preferences?.robotConfig || null,
        isPro: p.plan_tier === 'pro',
        followStatus,
      };
    });

    return res.status(200).json({ results });
  } catch (err) {
    console.error('[search] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
