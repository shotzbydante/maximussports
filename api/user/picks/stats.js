/**
 * GET /api/user/picks/stats
 *
 * Returns the authenticated user's pick performance stats.
 * Currently returns zeros — will be populated when pick tracking activates.
 *
 * Future: real-time pick stats, streaks, win rates, category breakdowns.
 * This endpoint will power the profile picks card, public profile stats,
 * and leaderboard entries.
 */

import { verifyUserToken, getSupabaseAdmin } from '../../_lib/supabaseAdmin.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = req.headers.authorization?.slice(7);
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const user = await verifyUserToken(token).catch(() => null);
  if (!user) return res.status(401).json({ error: 'Invalid token' });

  const defaultStats = {
    ats:    { wins: 0, losses: 0 },
    pickem: { wins: 0, losses: 0 },
    totals: { wins: 0, losses: 0 },
  };

  try {
    const sb = getSupabaseAdmin();
    const { data: stats } = await sb
      .from('user_pick_stats')
      .select('ats_wins, ats_losses, pickem_wins, pickem_losses, totals_wins, totals_losses')
      .eq('user_id', user.id)
      .maybeSingle();

    if (stats) {
      return res.status(200).json({
        pickStats: {
          ats:    { wins: stats.ats_wins || 0, losses: stats.ats_losses || 0 },
          pickem: { wins: stats.pickem_wins || 0, losses: stats.pickem_losses || 0 },
          totals: { wins: stats.totals_wins || 0, losses: stats.totals_losses || 0 },
        },
      });
    }
  } catch {
    // user_pick_stats table may not exist yet — fall through to defaults
  }

  return res.status(200).json({ pickStats: defaultStats });
}
