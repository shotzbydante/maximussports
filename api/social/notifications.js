import { getSupabaseAdmin, getUserClient } from '../_lib/supabaseAdmin.js';

const PROFILE_FIELDS = 'id, username, display_name, plan_tier, preferences';

/**
 * GET  /api/social/notifications                          — fetch recent notifications
 * POST /api/social/notifications?action=markRead&id=<uuid> — mark one as read
 * POST /api/social/notifications?action=markAllRead        — mark all as read
 *
 * DB column is `is_read` (boolean). mark-all-read uses the
 * mark_notifications_read RPC so auth.uid() scoping is enforced in the DB.
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
        .select('id, type, actor_id, data, is_read, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('[notifications] fetch error:', error.message);
        return res.status(500).json({ error: 'Failed to load notifications' });
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

      const unreadCount = (notifications || []).filter(n => !n.is_read).length;

      const items = (notifications || []).map(n => ({
        id: n.id,
        type: n.type,
        actor: actorMap[n.actor_id] || null,
        data: n.data,
        isRead: n.is_read,
        createdAt: n.created_at,
      }));

      return res.status(200).json({ notifications: items, unreadCount });
    }

    if (req.method === 'POST') {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const action = url.searchParams.get('action');
      const userSb = getUserClient(token);

      if (action === 'markRead') {
        const id = url.searchParams.get('id');
        if (!id) return res.status(400).json({ error: 'id required' });

        const { error: rpcErr } = await userSb.rpc('mark_notifications_read', {
          notification_ids: [id],
        });
        if (rpcErr) {
          console.error('[notifications] markRead RPC error:', rpcErr.message);
          return res.status(500).json({ error: 'Failed to mark notification as read' });
        }
        return res.status(200).json({ ok: true });
      }

      if (action === 'markAllRead') {
        const { data: unread } = await sb
          .from('notifications')
          .select('id')
          .eq('user_id', user.id)
          .eq('is_read', false);

        const ids = (unread || []).map(n => n.id);
        if (ids.length > 0) {
          const { error: rpcErr } = await userSb.rpc('mark_notifications_read', {
            notification_ids: ids,
          });
          if (rpcErr) {
            console.error('[notifications] markAllRead RPC error:', rpcErr.message);
            return res.status(500).json({ error: 'Failed to mark notifications as read' });
          }
        }
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
