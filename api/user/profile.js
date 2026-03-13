/**
 * GET /api/user/profile
 *
 * Returns the authenticated user's full profile data, including identity,
 * plan state, social counts, and pick stats. This is the canonical profile
 * endpoint used by sidebar, header chip, settings, and future public profile.
 *
 * Response shape matches the UserProfile type in src/types/social.js.
 */

import { verifyUserToken, getSupabaseAdmin } from '../_lib/supabaseAdmin.js';

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

    let profile = null;
    try {
      const { data, error } = await sb
        .from('profiles')
        .select('username, display_name, favorite_number, plan_tier, followers_count, following_count, public_profile_enabled, avatar_config')
        .eq('id', user.id)
        .maybeSingle();
      if (error) {
        // Fallback: if new columns don't exist yet, query core columns only
        const { data: fallback } = await sb
          .from('profiles')
          .select('username, display_name, favorite_number, plan_tier')
          .eq('id', user.id)
          .maybeSingle();
        profile = fallback;
      } else {
        profile = data;
      }
    } catch (dbErr) {
      console.error('[user/profile] DB error:', dbErr.message);
    }

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
      avatarConfig:         p.avatar_config || null,
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
