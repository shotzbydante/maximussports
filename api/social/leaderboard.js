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

  const type = getQueryParam(req, 'type', 'friends');

  try {
    let userIds = [user.id];

    if (type === 'friends') {
      const { data: following } = await supabaseAdmin
        .from('follows')
        .select('following_user_id')
        .eq('follower_user_id', user.id);

      const { data: followers } = await supabaseAdmin
        .from('follows')
        .select('follower_user_id')
        .eq('following_user_id', user.id);

      const followingIds = new Set((following || []).map(f => f.following_user_id));
      const mutualIds = (followers || [])
        .filter(f => followingIds.has(f.follower_user_id))
        .map(f => f.follower_user_id);

      userIds = [...new Set([user.id, ...mutualIds])];
    }

    let stats = [];
    try {
      const { data, error } = await supabaseAdmin
        .from('user_pick_stats')
        .select('user_id, ats_wins, ats_losses, pickem_wins, pickem_losses, totals_wins, totals_losses')
        .in('user_id', userIds);
      if (!error) stats = data || [];
    } catch {
      // user_pick_stats may not exist yet
    }

    const { data: profiles } = await supabaseAdmin
      .from('profiles')
      .select('id, username, display_name, plan_tier, preferences')
      .in('id', userIds);

    const profileMap = {};
    (profiles || []).forEach(p => { profileMap[p.id] = p; });

    const leaderboard = stats.map(s => {
      const p = profileMap[s.user_id] || {};
      const totalWins = s.ats_wins + s.pickem_wins + s.totals_wins;
      const totalLosses = s.ats_losses + s.pickem_losses + s.totals_losses;
      const totalGames = totalWins + totalLosses;
      const accuracy = totalGames > 0 ? Math.round((totalWins / totalGames) * 100) : 0;

      return {
        userId: s.user_id,
        username: p.username || 'Unknown',
        displayName: p.display_name || p.username || 'Unknown',
        avatarConfig: p.avatar_config || p.preferences?.robotConfig || null,
        isPro: p.plan_tier === 'pro',
        isCurrentUser: s.user_id === user.id,
        stats: {
          ats: { wins: s.ats_wins, losses: s.ats_losses },
          pickem: { wins: s.pickem_wins, losses: s.pickem_losses },
          totals: { wins: s.totals_wins, losses: s.totals_losses },
        },
        totalWins,
        totalLosses,
        accuracy,
      };
    });

    leaderboard.sort((a, b) => b.accuracy - a.accuracy || b.totalWins - a.totalWins);

    leaderboard.forEach((entry, i) => { entry.rank = i + 1; });

    return res.status(200).json({ leaderboard });
  } catch (err) {
    console.error('[leaderboard] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
