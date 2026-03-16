import { getSupabaseAdmin } from '../_lib/supabaseAdmin.js';

const PROFILE_FIELDS = 'id, username, display_name, plan_tier, preferences';

/**
 * GET  /api/social/notifications          — fetch recent notifications
 * POST /api/social/notifications?action=markRead&id=<uuid> — mark one as read
 * POST /api/social/notifications?action=markAllRead      — mark all as read
 */
export default async function handler(req, res) {
  let sb;
  try {
    sb = getSupabaseAdmin();
  } catch (err) {
    console.error('[notifications] Admin client unavailable:', err.message);
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

  try {
    if (req.method === 'GET') {
      const { data: notifications, error } = await sb
        .from('notifications')
        .select('id, type, actor_id, data, read, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('[notifications] fetch error:', error.message);
        return res.status(200).json({ notifications: [], unreadCount: 0 });
      }

      const actorIds = [...new Set((notifications || []).map(n => n.actor_id).filter(Boolean))];
      let actorMap = {};

      if (actorIds.length > 0) {
        const { data: actors } = await sb
          .from('profiles')
          .select(PROFILE_FIELDS)
          .in('id', actorIds);

        for (const a of (actors || [])) {
          actorMap[a.id] = {
            id: a.id,
            username: a.username || '',
            displayName: a.display_name || a.username || 'Maximus User',
            avatarConfig: a.preferences?.robotConfig || null,
            isPro: a.plan_tier === 'pro',
          };
        }
      }

      const unreadCount = (notifications || []).filter(n => !n.read).length;

      const items = (notifications || []).map(n => ({
        id: n.id,
        type: n.type,
        actor: actorMap[n.actor_id] || null,
        data: n.data,
        read: n.read,
        createdAt: n.created_at,
      }));

      return res.status(200).json({ notifications: items, unreadCount });
    }

    if (req.method === 'POST') {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const action = url.searchParams.get('action');

      if (action === 'markRead') {
        const id = url.searchParams.get('id');
        if (!id) return res.status(400).json({ error: 'id required' });
        await sb
          .from('notifications')
          .update({ read: true })
          .eq('id', id)
          .eq('user_id', user.id);
        return res.status(200).json({ ok: true });
      }

      if (action === 'markAllRead') {
        await sb
          .from('notifications')
          .update({ read: true })
          .eq('user_id', user.id)
          .eq('read', false);
        return res.status(200).json({ ok: true });
      }

      return res.status(400).json({ error: 'Unknown action' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[notifications] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
