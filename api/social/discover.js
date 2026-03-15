import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * GET /api/social/discover — suggest users to follow based on shared teams / popularity.
 * No contact sync required — works for any authenticated user.
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

  try {
    const { data: alreadyFollowing } = await supabaseAdmin
      .from('follows')
      .select('following_user_id')
      .eq('follower_user_id', user.id);

    const excludeIds = new Set([user.id, ...(alreadyFollowing || []).map(f => f.following_user_id)]);

    const { data: myTeams } = await supabaseAdmin
      .from('user_teams')
      .select('team_slug')
      .eq('user_id', user.id);

    const mySlugs = (myTeams || []).map(t => t.team_slug);

    let suggestions = [];

    if (mySlugs.length > 0) {
      const { data: sharedTeamUsers } = await supabaseAdmin
        .from('user_teams')
        .select('user_id')
        .in('team_slug', mySlugs)
        .neq('user_id', user.id)
        .limit(100);

      const candidateIds = [...new Set((sharedTeamUsers || []).map(u => u.user_id))]
        .filter(id => !excludeIds.has(id))
        .slice(0, 20);

      if (candidateIds.length > 0) {
        const { data: profiles } = await supabaseAdmin
          .from('profiles')
          .select('id, username, display_name, plan_tier, preferences, followers_count')
          .in('id', candidateIds);

        suggestions = (profiles || [])
          .filter(p => p.username || p.display_name)
          .map(p => ({
            id: p.id,
            username: p.username || '',
            displayName: p.display_name || p.username || '',
            avatarConfig: p.avatar_config || p.preferences?.robotConfig || null,
            isPro: p.plan_tier === 'pro',
            followersCount: p.followers_count || 0,
            followStatus: 'none',
            reason: 'shared_team',
          }));
      }
    }

    if (suggestions.length < 10) {
      const existingIds = new Set([...excludeIds, ...suggestions.map(s => s.id)]);
      const { data: popular } = await supabaseAdmin
        .from('profiles')
        .select('id, username, display_name, plan_tier, preferences, followers_count')
        .order('followers_count', { ascending: false })
        .limit(30);

      const additional = (popular || [])
        .filter(p => !existingIds.has(p.id) && (p.username || p.display_name))
        .slice(0, 10 - suggestions.length)
        .map(p => ({
          id: p.id,
          username: p.username || '',
          displayName: p.display_name || p.username || '',
          avatarConfig: p.avatar_config || p.preferences?.robotConfig || null,
          isPro: p.plan_tier === 'pro',
          followersCount: p.followers_count || 0,
          followStatus: 'none',
          reason: 'popular',
        }));

      suggestions = [...suggestions, ...additional];
    }

    return res.status(200).json({ suggestions });
  } catch (err) {
    console.error('[discover] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
