import { createClient } from '@supabase/supabase-js';
import { getQueryParam } from '../_requestUrl.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY);

function looksLikeEmail(q) {
  return q.includes('@') && q.includes('.');
}

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
 * Exact email lookup via GoTrue admin API.
 * Only returns a user whose email exactly matches (case-insensitive).
 * Never exposes the email in the response — privacy-safe.
 */
async function findUserByExactEmail(email) {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=5&filter=${encodeURIComponent(email)}`,
      {
        headers: {
          'Authorization': `Bearer ${SERVICE_KEY}`,
          'apikey': SERVICE_KEY,
        },
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const users = data.users || [];
    return users.find(u => u.email?.toLowerCase() === email.toLowerCase()) || null;
  } catch {
    return null;
  }
}

/**
 * GET /api/social/search?q=term
 *
 * Searches profiles by username and display_name (partial, case-insensitive).
 * If the query looks like an exact email, also checks auth.users for a match.
 * Results are ranked by relevance, not just follower count.
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
    const profileSearch = supabaseAdmin
      .from('profiles')
      .select('id, username, display_name, plan_tier, preferences, avatar_config')
      .neq('id', user.id)
      .or(`username.ilike.${pattern},display_name.ilike.${pattern}`)
      .order('followers_count', { ascending: false, nullsFirst: false })
      .limit(20);

    const emailLookup = looksLikeEmail(query) ? findUserByExactEmail(query) : null;

    const [{ data: profiles, error }, emailUser] = await Promise.all([
      profileSearch,
      emailLookup,
    ]);

    if (error) throw error;

    const resultMap = new Map();

    for (const p of (profiles || [])) {
      resultMap.set(p.id, p);
    }

    if (emailUser && emailUser.id !== user.id && !resultMap.has(emailUser.id)) {
      const { data: emailProfile } = await supabaseAdmin
        .from('profiles')
        .select('id, username, display_name, plan_tier, preferences, avatar_config')
        .eq('id', emailUser.id)
        .maybeSingle();

      if (emailProfile) {
        emailProfile._emailMatch = true;
        resultMap.set(emailProfile.id, emailProfile);
      }
    }

    const allProfiles = Array.from(resultMap.values());

    if (allProfiles.length === 0) {
      return res.status(200).json({ results: [] });
    }

    const resultIds = allProfiles.map(p => p.id);

    const [{ data: myFollows }, { data: theirFollows }] = await Promise.all([
      supabaseAdmin
        .from('follows')
        .select('following_user_id')
        .eq('follower_user_id', user.id)
        .in('following_user_id', resultIds),
      supabaseAdmin
        .from('follows')
        .select('follower_user_id')
        .eq('following_user_id', user.id)
        .in('follower_user_id', resultIds),
    ]);

    const iFollowSet = new Set((myFollows || []).map(f => f.following_user_id));
    const followsMeSet = new Set((theirFollows || []).map(f => f.follower_user_id));

    const results = allProfiles
      .map(p => {
        const iFollow = iFollowSet.has(p.id);
        const followsMe = followsMeSet.has(p.id);
        let followStatus = 'none';
        if (iFollow && followsMe) followStatus = 'friends';
        else if (iFollow) followStatus = 'following';
        else if (followsMe) followStatus = 'follower';

        const score = p._emailMatch ? 90 : scoreResult(p, query);

        return {
          id: p.id,
          username: p.username,
          displayName: p.display_name || p.username || 'Maximus User',
          avatarConfig: p.avatar_config || p.preferences?.robotConfig || null,
          isPro: p.plan_tier === 'pro',
          followStatus,
          _score: score,
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
