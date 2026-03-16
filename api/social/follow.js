import { getSupabaseAdmin } from '../_lib/supabaseAdmin.js';

async function adjustCounter(sb, userId, column, delta) {
  const { data } = await sb
    .from('profiles')
    .select(column)
    .eq('id', userId)
    .maybeSingle();

  const current = data?.[column] ?? 0;
  const newVal = Math.max(0, current + delta);

  await sb
    .from('profiles')
    .update({ [column]: newVal, updated_at: new Date().toISOString() })
    .eq('id', userId);
}

async function createFollowNotification(sb, actorId, targetId) {
  try {
    await sb.from('notifications').insert({
      user_id: targetId,
      type: 'new_follower',
      actor_id: actorId,
      read: false,
    });
  } catch (err) {
    console.warn('[follow] notification insert failed (table may not exist yet):', err?.message);
  }
}

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

  try {
    if (action === 'follow') {
      const { error: insertErr } = await sb
        .from('follows')
        .insert({
          follower_user_id: user.id,
          following_user_id: targetUserId,
        });

      if (insertErr && insertErr.code !== '23505') {
        throw insertErr;
      }

      const isNewFollow = !insertErr;

      if (isNewFollow) {
        await Promise.allSettled([
          adjustCounter(sb, targetUserId, 'followers_count', 1),
          adjustCounter(sb, user.id, 'following_count', 1),
          createFollowNotification(sb, user.id, targetUserId),
        ]);
      }

      const { data: mutual } = await sb
        .from('follows')
        .select('id')
        .eq('follower_user_id', targetUserId)
        .eq('following_user_id', user.id)
        .maybeSingle();

      const isMutual = !!mutual;

      if (isMutual && isNewFollow) {
        await Promise.allSettled([
          adjustCounter(sb, user.id, 'friends_count', 1),
          adjustCounter(sb, targetUserId, 'friends_count', 1),
        ]);
      }

      return res.status(200).json({
        ok: true,
        followStatus: isMutual ? 'friends' : 'following',
      });
    }

    if (action === 'unfollow') {
      const { data: wasMutual } = await sb
        .from('follows')
        .select('id')
        .eq('follower_user_id', targetUserId)
        .eq('following_user_id', user.id)
        .maybeSingle();

      const { error: deleteErr } = await sb
        .from('follows')
        .delete()
        .eq('follower_user_id', user.id)
        .eq('following_user_id', targetUserId);

      if (deleteErr) throw deleteErr;

      await Promise.allSettled([
        adjustCounter(sb, targetUserId, 'followers_count', -1),
        adjustCounter(sb, user.id, 'following_count', -1),
      ]);

      if (wasMutual) {
        await Promise.allSettled([
          adjustCounter(sb, user.id, 'friends_count', -1),
          adjustCounter(sb, targetUserId, 'friends_count', -1),
        ]);
      }

      return res.status(200).json({
        ok: true,
        followStatus: wasMutual ? 'follower' : 'none',
      });
    }
  } catch (err) {
    console.error('[follow] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
