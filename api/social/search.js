import { getSupabaseAdmin, getEnvStatus } from '../_lib/supabaseAdmin.js';
import { getQueryParam } from '../_requestUrl.js';

const PROFILE_SELECT = 'id, username, display_name, plan_tier, preferences';

function scoreResult(profile, q) {
  const lower = q.toLowerCase();
  const u = (profile.username || '').toLowerCase();
  const d = (profile.display_name || '').toLowerCase();
  if (u === lower) return 100;
  if (u.startsWith(lower)) return 80;
  if (d === lower) return 60;
  if (d.startsWith(lower)) return 40;
  if (u.includes(lower)) return 20;
  if (d.includes(lower)) return 10;
  return 5;
}

/**
 * GET /api/social/search?q=term
 *
 * Lightweight live search — designed for keystroke-speed responses.
 * Searches profiles table only by username and display_name.
 *
 * Deliberately excludes:
 *   - GoTrue admin email scanning (too slow for interactive search)
 *   - Auto-creation of missing profile rows (belongs in admin backfill)
 *   - Any auth.admin.listUsers() calls
 *
 * Architecture: 2 sequential network hops max:
 *   1. auth.getUser (JWT verification)
 *   2. profiles ilike query + follow enrichment (parallel)
 */
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let sb;
  try {
    sb = getSupabaseAdmin();
  } catch (err) {
    console.error('[search] Admin client unavailable:', err.message, getEnvStatus());
    return res.status(503).json({ error: 'Search service unavailable' });
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

  const query = (getQueryParam(req, 'q') || '').trim();
  if (!query || query.length < 2) {
    return res.status(200).json({ results: [] });
  }

  const sanitized = query.replace(/[%_*\\]/g, c => '\\' + c);
  const pattern = `*${sanitized}*`;

  try {
    const usernameSearch = sb
      .from('profiles')
      .select(PROFILE_SELECT)
      .neq('id', user.id)
      .ilike('username', pattern)
      .limit(15);

    const displayNameSearch = sb
      .from('profiles')
      .select(PROFILE_SELECT)
      .neq('id', user.id)
      .ilike('display_name', pattern)
      .limit(15);

    const [usernameResult, displayNameResult] = await Promise.all([
      usernameSearch,
      displayNameSearch,
    ]);

    if (usernameResult.error) {
      console.error('[search] username query error:', usernameResult.error.message);
    }
    if (displayNameResult.error) {
      console.error('[search] display_name query error:', displayNameResult.error.message);
    }

    const resultMap = new Map();
    for (const p of (usernameResult.data || [])) {
      p._matchedBy = 'username';
      resultMap.set(p.id, p);
    }
    for (const p of (displayNameResult.data || [])) {
      if (!resultMap.has(p.id)) {
        p._matchedBy = 'display_name';
        resultMap.set(p.id, p);
      }
    }

    const allProfiles = Array.from(resultMap.values());

    if (allProfiles.length === 0) {
      return res.status(200).json({ results: [] });
    }

    const resultIds = allProfiles.map(p => p.id);

    let iFollowSet = new Set();
    let followsMeSet = new Set();
    try {
      const [{ data: myFollows }, { data: theirFollows }] = await Promise.all([
        sb.from('follows').select('following_user_id').eq('follower_user_id', user.id).in('following_user_id', resultIds),
        sb.from('follows').select('follower_user_id').eq('following_user_id', user.id).in('follower_user_id', resultIds),
      ]);
      iFollowSet = new Set((myFollows || []).map(f => f.following_user_id));
      followsMeSet = new Set((theirFollows || []).map(f => f.follower_user_id));
    } catch (followErr) {
      console.warn('[search] follow enrichment failed, returning results without follow status:', followErr?.message);
    }

    const results = allProfiles
      .map(p => {
        const iFollow = iFollowSet.has(p.id);
        const followsMe = followsMeSet.has(p.id);
        let followStatus = 'none';
        if (iFollow && followsMe) followStatus = 'friends';
        else if (iFollow) followStatus = 'following';
        else if (followsMe) followStatus = 'follower';

        return {
          id: p.id,
          username: p.username,
          displayName: p.display_name || p.username || 'Maximus User',
          avatarConfig: p.preferences?.robotConfig || null,
          isPro: p.plan_tier === 'pro',
          followStatus,
          _score: scoreResult(p, query),
        };
      })
      .sort((a, b) => b._score - a._score)
      .map(({ _score, ...rest }) => rest);

    return res.status(200).json({ results });
  } catch (err) {
    console.error('[search] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
