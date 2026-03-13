/**
 * GET /api/user/following
 *
 * Returns the list of users the authenticated user is following.
 * Currently returns an empty array — will be populated when the
 * follows table is active and the follow feature is enabled.
 *
 * Future: paginated following list with profile summaries.
 */

import { verifyUserToken } from '../_lib/supabaseAdmin.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = req.headers.authorization?.slice(7);
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const user = await verifyUserToken(token).catch(() => null);
  if (!user) return res.status(401).json({ error: 'Invalid token' });

  // Placeholder — returns empty list until social features activate
  return res.status(200).json({
    following: [],
    total: 0,
  });
}
