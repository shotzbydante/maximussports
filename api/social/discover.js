import { getSupabaseAdmin } from '../_lib/supabaseAdmin.js';

const PROFILE_SELECT = 'id, username, display_name, plan_tier, preferences, followers_count';

function mapProfile(p, reason, mutualCount) {
  return {
    id: p.id,
    username: p.username || '',
    displayName: p.display_name || p.username || '',
    avatarConfig: p.preferences?.robotConfig || null,
    isPro: p.plan_tier === 'pro',
    followersCount: p.followers_count || 0,
    followStatus: 'none',
    reason,
    ...(mutualCount > 0 ? { mutualCount } : {}),
  };
}

/**
 * GET /api/social/discover
 *
 * Returns up to 10 suggested users:
 *   Tier 1: Friends-of-friends (users followed by people I follow)
 *   Tier 2: Shared team interest
 *   Tier 3: Random valid users (backfill)
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let sb;
  try {
    sb = getSupabaseAdmin();
  } catch (err) {
    console.error('[discover] Admin client unavailable:', err.message);
    return res.status(503).json({ error: 'Service unavailable' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const token = authHeader.slice(7);
  const { data: { user }, error: authError } = await sb.auth.getUser(token);
  if (authError || !user) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const TARGET = 10;

  try {
    const [{ data: myFollowsRaw }, { data: testAliasIds }] = await Promise.all([
      sb.from('follows').select('following_user_id').eq('follower_user_id', user.id),
      sb.rpc('get_test_alias_user_ids', { email_pattern: 'dantedicicco+%@gmail.com' })
        .then(res => res)
        .catch(() => ({ data: [] })),
    ]);

    const myFollowingIds = (myFollowsRaw || []).map(f => f.following_user_id);
    const aliasIds = (testAliasIds || []).map(r => typeof r === 'string' ? r : r.id);
    const excludeIds = new Set([user.id, ...myFollowingIds, ...aliasIds]);

    let suggestions = [];

    // --- Tier 1: Friends-of-friends ---
    if (myFollowingIds.length > 0) {
      const { data: fofRows } = await sb
        .from('follows')
        .select('following_user_id')
        .in('follower_user_id', myFollowingIds)
        .limit(200);

      if (fofRows && fofRows.length > 0) {
        const fofCounts = new Map();
        for (const row of fofRows) {
          const id = row.following_user_id;
          if (!excludeIds.has(id)) {
            fofCounts.set(id, (fofCounts.get(id) || 0) + 1);
          }
        }

        const fofCandidates = [...fofCounts.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, TARGET);

        if (fofCandidates.length > 0) {
          const fofIds = fofCandidates.map(([id]) => id);
          const { data: fofProfiles } = await sb
            .from('profiles')
            .select(PROFILE_SELECT)
            .in('id', fofIds);

          const mutualMap = Object.fromEntries(fofCandidates);

          for (const p of (fofProfiles || [])) {
            if ((p.username || p.display_name) && !excludeIds.has(p.id)) {
              suggestions.push(mapProfile(p, 'friends_of_friends', mutualMap[p.id] || 0));
              excludeIds.add(p.id);
            }
          }

          suggestions.sort((a, b) => (b.mutualCount || 0) - (a.mutualCount || 0));
        }
      }
    }

    // --- Tier 2: Shared teams ---
    if (suggestions.length < TARGET) {
      const { data: myTeams } = await sb
        .from('user_teams')
        .select('team_slug')
        .eq('user_id', user.id);

      const mySlugs = (myTeams || []).map(t => t.team_slug);

      if (mySlugs.length > 0) {
        const { data: sharedTeamUsers } = await sb
          .from('user_teams')
          .select('user_id')
          .in('team_slug', mySlugs)
          .neq('user_id', user.id)
          .limit(100);

        const teamCandidateIds = [...new Set((sharedTeamUsers || []).map(u => u.user_id))]
          .filter(id => !excludeIds.has(id))
          .slice(0, TARGET - suggestions.length);

        if (teamCandidateIds.length > 0) {
          const { data: teamProfiles } = await sb
            .from('profiles')
            .select(PROFILE_SELECT)
            .in('id', teamCandidateIds);

          for (const p of (teamProfiles || [])) {
            if ((p.username || p.display_name) && !excludeIds.has(p.id)) {
              suggestions.push(mapProfile(p, 'shared_team', 0));
              excludeIds.add(p.id);
            }
          }
        }
      }
    }

    // --- Tier 3: Random backfill ---
    if (suggestions.length < TARGET) {
      const needed = TARGET - suggestions.length;
      const { data: backfill } = await sb
        .from('profiles')
        .select(PROFILE_SELECT)
        .not('id', 'in', `(${[...excludeIds].join(',')})`)
        .not('username', 'is', null)
        .order('created_at', { ascending: false })
        .limit(needed + 10);

      const shuffled = (backfill || [])
        .filter(p => (p.username || p.display_name) && !excludeIds.has(p.id))
        .sort(() => Math.random() - 0.5)
        .slice(0, needed);

      for (const p of shuffled) {
        suggestions.push(mapProfile(p, 'discover', 0));
        excludeIds.add(p.id);
      }
    }

    return res.status(200).json({ suggestions: suggestions.slice(0, TARGET) });
  } catch (err) {
    console.error('[discover] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
