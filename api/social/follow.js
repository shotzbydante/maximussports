import { getSupabaseAdmin, getUserClient } from '../_lib/supabaseAdmin.js';

/**
 * POST /api/social/follow
 * Body: { targetUserId, action: 'follow' | 'unfollow' }
 *
 * Delegates the write to DB RPCs (follow_user / unfollow_user) which own
 * all persistent side effects: counter updates, notification creation,
 * mutual-friend bookkeeping. This API route only orchestrates auth,
 * validation, RPC invocation, and relationship-status reads.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let sb;
  try {
    sb = getSupabaseAdmin();
  } catch (err) {
    console.error('[follow] Admin client unavailable:', err.message);
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

  const { targetUserId, action } = req.body;
  if (!targetUserId || !['follow', 'unfollow'].includes(action)) {
    return res.status(400).json({ error: 'targetUserId and action (follow|unfollow) required' });
  }

  if (targetUserId === user.id) {
    return res.status(400).json({ error: 'Cannot follow yourself' });
  }

  const userSb = getUserClient(token);

  try {
    if (action === 'follow') {
      const { error: rpcErr } = await userSb.rpc('follow_user', {
        target_user_id: targetUserId,
      });

      if (rpcErr) {
        if (rpcErr.code === '23505' || rpcErr.message?.includes('already')) {
          // Idempotent duplicate — not an error
        } else {
          console.error('[follow] RPC error:', rpcErr.message);
          throw rpcErr;
        }
      }

      const { data: mutual } = await sb
        .from('follows')
        .select('id')
        .eq('follower_user_id', targetUserId)
        .eq('following_user_id', user.id)
        .maybeSingle();

      return res.status(200).json({
        ok: true,
        followStatus: mutual ? 'friends' : 'following',
      });
    }

    if (action === 'unfollow') {
      const { data: theyFollowMe } = await sb
        .from('follows')
        .select('id')
        .eq('follower_user_id', targetUserId)
        .eq('following_user_id', user.id)
        .maybeSingle();

      const { error: rpcErr } = await userSb.rpc('unfollow_user', {
        target_user_id: targetUserId,
      });

      if (rpcErr) {
        console.error('[unfollow] RPC error:', rpcErr.message);
        throw rpcErr;
      }

      return res.status(200).json({
        ok: true,
        followStatus: theyFollowMe ? 'follower' : 'none',
      });
    }
  } catch (err) {
    console.error('[follow] error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
