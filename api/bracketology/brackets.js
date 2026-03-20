/**
 * GET / POST / PATCH / DELETE /api/bracketology/brackets
 *
 * Multi-bracket operations: list, create, rename, delete.
 */

import { createClient } from '@supabase/supabase-js';

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

async function getAuthUser(req) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return null;
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  const sb = createClient(url, anonKey);
  const { data: { user }, error } = await sb.auth.getUser(auth.slice(7));
  if (error || !user) return null;
  return user;
}

export default async function handler(req, res) {
  const user = await getAuthUser(req);
  if (!user?.email) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const sb = getSupabaseAdmin();
  if (!sb) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  if (req.method === 'GET') return handleList(req, res, sb, user);
  if (req.method === 'POST') return handleCreate(req, res, sb, user);
  if (req.method === 'PATCH') return handleRename(req, res, sb, user);
  if (req.method === 'DELETE') return handleDelete(req, res, sb, user);
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleList(req, res, sb, user) {
  try {
    const { data, error } = await sb
      .from('user_brackets')
      .select('id, bracket_name, picks, pick_origins, created_at, updated_at')
      .eq('user_id', user.id)
      .eq('year', 2026)
      .order('updated_at', { ascending: false });

    if (error) {
      const isTableMissing = error.message?.includes('schema cache')
        || error.message?.includes('user_brackets')
        || error.code === '42P01'
        || error.code === 'PGRST204';
      if (isTableMissing) {
        return res.status(200).json({ brackets: [], _tablesMissing: true });
      }
      return res.status(200).json({ brackets: [] });
    }

    return res.status(200).json({ brackets: data || [] });
  } catch (err) {
    console.error('[bracketology/brackets] GET exception:', err.message);
    return res.status(200).json({ brackets: [] });
  }
}

async function handleCreate(req, res, sb, user) {
  try {
    const { bracketName, picks, pickOrigins } = req.body || {};
    const now = new Date().toISOString();

    const { data, error } = await sb
      .from('user_brackets')
      .insert({
        user_id: user.id,
        year: 2026,
        bracket_name: bracketName || 'My Bracket',
        picks: picks || {},
        pick_origins: pickOrigins || {},
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();

    if (error) {
      console.error('[bracketology/brackets] POST error:', error.message);
      return res.status(500).json({ error: 'Failed to create bracket' });
    }

    return res.status(200).json({ ok: true, bracket: data });
  } catch (err) {
    console.error('[bracketology/brackets] POST exception:', err.message);
    return res.status(500).json({ error: 'Internal error' });
  }
}

async function handleRename(req, res, sb, user) {
  try {
    const { bracketId, bracketName } = req.body || {};
    if (!bracketId || !bracketName) {
      return res.status(400).json({ error: 'Missing bracketId or bracketName' });
    }

    const { data, error } = await sb
      .from('user_brackets')
      .update({ bracket_name: bracketName, updated_at: new Date().toISOString() })
      .eq('id', bracketId)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) {
      console.error('[bracketology/brackets] PATCH error:', error.message);
      return res.status(500).json({ error: 'Failed to rename bracket' });
    }

    return res.status(200).json({ ok: true, bracket: data });
  } catch (err) {
    console.error('[bracketology/brackets] PATCH exception:', err.message);
    return res.status(500).json({ error: 'Internal error' });
  }
}

async function handleDelete(req, res, sb, user) {
  try {
    const bracketId = req.query?.bracketId || req.body?.bracketId;
    if (!bracketId) {
      return res.status(400).json({ error: 'Missing bracketId' });
    }

    const { error } = await sb
      .from('user_brackets')
      .delete()
      .eq('id', bracketId)
      .eq('user_id', user.id);

    if (error) {
      console.error('[bracketology/brackets] DELETE error:', error.message);
      return res.status(500).json({ error: 'Failed to delete bracket' });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[bracketology/brackets] DELETE exception:', err.message);
    return res.status(500).json({ error: 'Internal error' });
  }
}
