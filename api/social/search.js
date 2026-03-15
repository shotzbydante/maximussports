import { getSupabaseAdmin, getEnvStatus } from '../_lib/supabaseAdmin.js';
import { getQueryParam } from '../_requestUrl.js';

const PROFILE_SELECT = 'id, username, display_name, plan_tier, preferences, avatar_config';

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

function extractDisplayName(authUser) {
  const meta = authUser.user_metadata || {};
  return (
    meta.full_name ||
    meta.name ||
    meta.display_name ||
    (authUser.email ? authUser.email.split('@')[0] : null)
  );
}

/**
 * Exact email lookup via GoTrue admin REST API.
 * Returns the auth user if the email matches exactly (case-insensitive).
 */
async function findUserByExactEmail(sb, email) {
  try {
    const { data, error } = await sb.auth.admin.listUsers({ page: 1, perPage: 50 });
    if (error || !data?.users) return null;
    return data.users.find(u => u.email?.toLowerCase() === email.toLowerCase()) || null;
  } catch (err) {
    console.error('[search] GoTrue email lookup error:', err?.message);
    return null;
  }
}

/**
 * If a GoTrue user has no profile row, create a minimal one so they
 * are discoverable. Uses service-role client (bypasses RLS).
 */
async function ensureProfileForAuthUser(sb, authUser) {
  const displayName = extractDisplayName(authUser);
  const now = new Date().toISOString();
  try {
    const row = {
      id: authUser.id,
      plan_tier: 'free',
      subscription_status: 'inactive',
      preferences: {},
      updated_at: now,
    };
    if (displayName) row.display_name = displayName;

    const { error } = await sb.from('profiles').insert(row, {
      onConflict: 'id',
      ignoreDuplicates: true,
    });
    if (error && error.code !== '23505') {
      console.warn('[search] ensureProfileForAuthUser insert error:', error.message);
    }
  } catch (err) {
    console.warn('[search] ensureProfileForAuthUser exception:', err?.message);
  }
}

/**
 * GET /api/social/search?q=term[&_debug=1]
 *
 * Search pipeline:
 *   1. Two parallel ilike queries — one on username, one on display_name
 *      (separate queries avoid .or() PostgREST encoding edge cases)
 *   2. If query looks like an email, exact GoTrue lookup in parallel
 *   3. If GoTrue finds a user without a profile, auto-creates a profile stub
 *   4. Results ranked by relevance
 *   5. Follow status enrichment
 *
 * Uses PostgREST * wildcards (not %) to avoid URL percent-encoding ambiguity.
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

  const debug = getQueryParam(req, '_debug') === '1';
  const log = [];

  const sanitized = query.replace(/[%_*\\]/g, c => '\\' + c);
  const pattern = `*${sanitized}*`;

  try {
    log.push(`query="${query}" pattern="${pattern}" caller=${user.id.slice(0, 8)}`);

    const usernameSearch = sb
      .from('profiles')
      .select(PROFILE_SELECT)
      .neq('id', user.id)
      .ilike('username', pattern)
      .order('followers_count', { ascending: false, nullsFirst: false })
      .limit(20);

    const displayNameSearch = sb
      .from('profiles')
      .select(PROFILE_SELECT)
      .neq('id', user.id)
      .ilike('display_name', pattern)
      .order('followers_count', { ascending: false, nullsFirst: false })
      .limit(20);

    const emailLookupPromise = looksLikeEmail(query)
      ? findUserByExactEmail(sb, query)
      : Promise.resolve(null);

    const [usernameResult, displayNameResult, emailUser] = await Promise.all([
      usernameSearch,
      displayNameSearch,
      emailLookupPromise,
    ]);

    if (usernameResult.error) {
      log.push(`username_query_error: ${usernameResult.error.message}`);
      console.error('[search] username query error:', usernameResult.error.message);
    }
    if (displayNameResult.error) {
      log.push(`display_name_query_error: ${displayNameResult.error.message}`);
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

    log.push(`username_hits=${(usernameResult.data || []).length} display_name_hits=${(displayNameResult.data || []).length}`);

    if (emailUser && emailUser.id !== user.id && !resultMap.has(emailUser.id)) {
      log.push(`email_auth_match=true auth_id=${emailUser.id.slice(0, 8)}`);

      const { data: emailProfile } = await sb
        .from('profiles')
        .select(PROFILE_SELECT)
        .eq('id', emailUser.id)
        .maybeSingle();

      if (emailProfile) {
        emailProfile._matchedBy = 'exact_email';
        resultMap.set(emailProfile.id, emailProfile);
        log.push('email_profile_found=true');
      } else {
        log.push('email_profile_found=false, auto-creating profile stub');
        await ensureProfileForAuthUser(sb, emailUser);

        const { data: newProfile } = await sb
          .from('profiles')
          .select(PROFILE_SELECT)
          .eq('id', emailUser.id)
          .maybeSingle();

        if (newProfile) {
          newProfile._matchedBy = 'exact_email';
          resultMap.set(newProfile.id, newProfile);
          log.push('email_auto_created_profile=true');
        } else {
          log.push('email_auto_created_profile=false');
        }
      }
    } else if (looksLikeEmail(query)) {
      log.push(`email_auth_match=${emailUser ? 'self_or_duplicate' : 'false'}`);
    }

    const allProfiles = Array.from(resultMap.values());
    log.push(`total_unique_results=${allProfiles.length}`);

    if (allProfiles.length === 0) {
      console.log(`[search] q="${query}" → 0 results | ${log.join(' | ')}`);
      return res.status(200).json({ results: [], ...(debug ? { _debug: log } : {}) });
    }

    const resultIds = allProfiles.map(p => p.id);

    const [{ data: myFollows }, { data: theirFollows }] = await Promise.all([
      sb.from('follows').select('following_user_id').eq('follower_user_id', user.id).in('following_user_id', resultIds),
      sb.from('follows').select('follower_user_id').eq('following_user_id', user.id).in('follower_user_id', resultIds),
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

        const score = p._matchedBy === 'exact_email' ? 90 : scoreResult(p, query);

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

    console.log(`[search] q="${query}" → ${results.length} results | ${log.join(' | ')}`);
    return res.status(200).json({ results, ...(debug ? { _debug: log } : {}) });
  } catch (err) {
    console.error('[search] error:', err, '| debug:', log.join(' | '));
    return res.status(500).json({ error: 'Internal server error', ...(debug ? { _debug: log } : {}) });
  }
}
