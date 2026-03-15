import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function adjustCounter(userId, column, delta) {
  const { data } = await supabaseAdmin
    .from('profiles')
    .select(column)
    .eq('id', userId)
    .maybeSingle();

  const current = data?.[column] ?? 0;
  const newVal = Math.max(0, current + delta);

  await supabaseAdmin
    .from('profiles')
    .update({ [column]: newVal, updated_at: new Date().toISOString() })
    .eq('id', userId);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
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

  const { targetUserId, action } = req.body;
  if (!targetUserId || !['follow', 'unfollow'].includes(action)) {
    return res.status(400).json({ error: 'targetUserId and action (follow|unfollow) required' });
  }

  if (targetUserId === user.id) {
    return res.status(400).json({ error: 'Cannot follow yourself' });
  }

  try {
    if (action === 'follow') {
      const { error: insertErr } = await supabaseAdmin
        .from('follows')
        .insert({
          follower_user_id: user.id,
          following_user_id: targetUserId,
        });

      if (insertErr && insertErr.code !== '23505') {
        throw insertErr;
      }

      if (!insertErr) {
        await Promise.allSettled([
          adjustCounter(targetUserId, 'followers_count', 1),
          adjustCounter(user.id, 'following_count', 1),
        ]);
      }

      const { data: mutual } = await supabaseAdmin
        .from('follows')
        .select('id')
        .eq('follower_user_id', targetUserId)
        .eq('following_user_id', user.id)
        .maybeSingle();

      const isMutual = !!mutual;

      if (isMutual && !insertErr) {
        await Promise.allSettled([
          adjustCounter(user.id, 'friends_count', 1),
          adjustCounter(targetUserId, 'friends_count', 1),
        ]);
      }

      return res.status(200).json({
        ok: true,
        followStatus: isMutual ? 'friends' : 'following',
      });
    }

    if (action === 'unfollow') {
      const { data: wasMutual } = await supabaseAdmin
        .from('follows')
        .select('id')
        .eq('follower_user_id', targetUserId)
        .eq('following_user_id', user.id)
        .maybeSingle();

      const { error: deleteErr, count } = await supabaseAdmin
        .from('follows')
        .delete()
        .eq('follower_user_id', user.id)
        .eq('following_user_id', targetUserId);

      if (deleteErr) throw deleteErr;

      await Promise.allSettled([
        adjustCounter(targetUserId, 'followers_count', -1),
        adjustCounter(user.id, 'following_count', -1),
      ]);

      if (wasMutual) {
        await Promise.allSettled([
          adjustCounter(user.id, 'friends_count', -1),
          adjustCounter(targetUserId, 'friends_count', -1),
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
