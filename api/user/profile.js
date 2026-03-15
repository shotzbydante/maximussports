/**
 * GET /api/user/profile
 *
 * Returns the authenticated user's full profile data, including identity,
 * plan state, social counts, and pick stats. This is the canonical profile
 * endpoint used by sidebar, header chip, settings, and future public profile.
 *
 * Response shape matches the UserProfile type in src/types/social.js.
 *
 * Schema detection: remembers whether avatar_config / social columns exist
 * so we don't fire a failing query on every request.
 */

import { verifyUserToken, getSupabaseAdmin } from '../_lib/supabaseAdmin.js';

const CORE_COLS = 'username, display_name, favorite_number, plan_tier';
const FULL_COLS = CORE_COLS + ', followers_count, following_count, public_profile_enabled, avatar_config';

let _hasFullSchema = null;

async function fetchProfile(sb, uid) {
  if (_hasFullSchema === true) {
    const { data, error } = await sb.from('profiles').select(FULL_COLS).eq('id', uid).maybeSingle();
    if (error) {
      _hasFullSchema = null;
      const { data: fb } = await sb.from('profiles').select(CORE_COLS).eq('id', uid).maybeSingle();
      return fb;
    }
    return data;
  }

  if (_hasFullSchema === false) {
    const { data } = await sb.from('profiles').select(CORE_COLS).eq('id', uid).maybeSingle();
    return data;
  }

  // Probe once
  const { data, error } = await sb.from('profiles').select(FULL_COLS).eq('id', uid).maybeSingle();
  if (!error) {
    _hasFullSchema = true;
    return data;
  }
  _hasFullSchema = false;
  const { data: fb } = await sb.from('profiles').select(CORE_COLS).eq('id', uid).maybeSingle();
  return fb;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = req.headers.authorization?.slice(7);
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const user = await verifyUserToken(token).catch(() => null);
  if (!user) return res.status(401).json({ error: 'Invalid token' });

  try {
    const sb = getSupabaseAdmin();
    const profile = await fetchProfile(sb, user.id);
    const p = profile || {};

    // Fetch pick stats if the table exists
    let pickStats = { ats: { wins: 0, losses: 0 }, pickem: { wins: 0, losses: 0 }, totals: { wins: 0, losses: 0 } };
    try {
      const { data: stats } = await sb
        .from('user_pick_stats')
        .select('ats_wins, ats_losses, pickem_wins, pickem_losses, totals_wins, totals_losses')
        .eq('user_id', user.id)
        .maybeSingle();

      if (stats) {
        pickStats = {
          ats:    { wins: stats.ats_wins || 0, losses: stats.ats_losses || 0 },
          pickem: { wins: stats.pickem_wins || 0, losses: stats.pickem_losses || 0 },
          totals: { wins: stats.totals_wins || 0, losses: stats.totals_losses || 0 },
        };
      }
    } catch {
      // user_pick_stats table may not exist yet — return zeros
    }

    return res.status(200).json({
      id:                   user.id,
      username:             p.username || '',
      displayName:          p.display_name || p.username || '',
      handle:               p.username ? `@${p.username}` : '',
      avatarUrl:            user.user_metadata?.avatar_url || null,
      favoriteNumber:       p.favorite_number ?? null,
      avatarConfig:         p.avatar_config || p.preferences?.robotConfig || null,
      email:                user.email || '',
      isPro:                p.plan_tier === 'pro',
      social: {
        followers:          p.followers_count || 0,
        following:          p.following_count || 0,
      },
      pickStats,
      publicProfileEnabled: p.public_profile_enabled ?? false,
    });
  } catch (err) {
    console.error('[user/profile] Error:', err.message);
    return res.status(500).json({ error: 'Could not retrieve profile' });
  }
}
