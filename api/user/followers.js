/**
 * GET /api/user/followers
 *
 * Returns the list of users who follow the authenticated user.
 *
 * Architecture: single RPC call via getUserClient(token).
 * This is the exact same client + RPC pattern used by api/social/follow.js
 * for follow_user / unfollow_user — the only pattern proven to work reliably.
 *
 * The get_followers() database function:
 *  - runs as SECURITY DEFINER (bypasses RLS)
 *  - uses auth.uid() from the JWT (no parameter injection)
 *  - joins follows + profiles + reverse-follows in one query
 *  - returns a normalized result set
 *
 * If the RPC does not exist, run docs/follower-list-rpcs.sql in Supabase.
 */

import { getUserClient } from '../_lib/supabaseAdmin.js';

function normalizeRow(row) {
  const avatarConfig = row.avatar_config || row.preferences?.robotConfig || null;
  return {
    id: row.id,
    username: row.username || '',
    displayName: row.display_name || row.username || '',
    avatarConfig,
    isPro: row.plan_tier === 'pro',
    followStatus: row.follow_status || 'follower',
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const sb = getUserClient(token);
    const { data, error } = await sb.rpc('get_followers');

    if (error) {
      console.error('[followers] rpc error:', error.message, error.code);
      if (error.code === '42883') {
        return res.status(500).json({ error: 'get_followers function not found — run docs/follower-list-rpcs.sql' });
      }
      const status = error.message?.includes('JWT') ? 401 : 500;
      return res.status(status).json({ error: error.message || 'Query failed' });
    }

    const followers = (data || []).map(normalizeRow);
    return res.status(200).json({ followers, total: followers.length });
  } catch (err) {
    console.error('[followers] error:', err.message);
    return res.status(500).json({ error: 'Internal error' });
  }
}
