import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
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

  const { phoneHashes } = req.body;
  if (!Array.isArray(phoneHashes) || phoneHashes.length === 0) {
    return res.status(400).json({ error: 'phoneHashes array required' });
  }

  const capped = phoneHashes.slice(0, 500);

  try {
    const { data: matchedProfiles, error } = await supabaseAdmin
      .from('profiles')
      .select('id, username, display_name, plan_tier, preferences, phone_hash')
      .in('phone_hash', capped)
      .neq('id', user.id);

    if (error) {
      console.error('[contact-match] query error:', error);
      return res.status(200).json({ matchedUsers: [], unmatchedHashes: capped });
    }

    const matchedHashSet = new Set((matchedProfiles || []).map(p => p.phone_hash));
    const unmatchedHashes = capped.filter(h => !matchedHashSet.has(h));

    const { data: follows } = await supabaseAdmin
      .from('follows')
      .select('following_user_id')
      .eq('follower_user_id', user.id);

    const followingSet = new Set((follows || []).map(f => f.following_user_id));

    const { data: followers } = await supabaseAdmin
      .from('follows')
      .select('follower_user_id')
      .eq('following_user_id', user.id);

    const followerSet = new Set((followers || []).map(f => f.follower_user_id));

    const matchedUsers = (matchedProfiles || []).map(p => {
      const isFollowing = followingSet.has(p.id);
      const isFollower = followerSet.has(p.id);
      let status = 'none';
      if (isFollowing && isFollower) status = 'friends';
      else if (isFollowing) status = 'following';
      else if (isFollower) status = 'follower';

      return {
        id: p.id,
        username: p.username,
        displayName: p.display_name || p.username,
        avatarConfig: p.avatar_config || p.preferences?.robotConfig || null,
        isPro: p.plan_tier === 'pro',
        followStatus: status,
      };
    });

    return res.status(200).json({ matchedUsers, unmatchedHashes });
  } catch (err) {
    console.error('[contact-match] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
