/**
 * POST / GET /api/bracketology/picks
 *
 * Save and load user bracket picks. Requires authenticated user.
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
  const token = auth.slice(7);
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  const sb = createClient(url, anonKey);
  const { data: { user }, error } = await sb.auth.getUser(token);
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

  // Diagnostic: log which Supabase project we're connecting to
  const supaUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const projectRef = supaUrl.match(/https:\/\/([^.]+)\./)?.[1] || 'unknown';
  console.log(`[bracketology/picks] ${req.method} — project: ${projectRef}`);

  if (req.method === 'GET') {
    return handleGet(req, res, sb, user);
  }
  if (req.method === 'POST') {
    return handlePost(req, res, sb, user);
  }
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleGet(req, res, sb, user) {
  try {
    const { data, error } = await sb
      .from('user_brackets')
      .select('*')
      .eq('user_id', user.id)
      .eq('year', 2026)
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(200).json({ bracket: null });
      }
      const isTableMissing = error.message?.includes('schema cache')
        || error.message?.includes('user_brackets')
        || error.code === '42P01'
        || error.code === 'PGRST204';
      if (isTableMissing) {
        console.warn(`[bracketology/picks] user_brackets not in schema cache — project: ${projectRef}, code: ${error.code}, msg: ${error.message}`);
        return res.status(200).json({ bracket: null, _tablesMissing: true, _diag: { project: projectRef, code: error.code } });
      }
      console.error('[bracketology/picks] GET error:', error.code, error.message);
      return res.status(200).json({ bracket: null });
    }

    return res.status(200).json({ bracket: data || null });
  } catch (err) {
    console.error('[bracketology/picks] GET exception:', err.message);
    return res.status(200).json({ bracket: null });
  }
}

async function handlePost(req, res, sb, user) {
  try {
    const { picks, pickOrigins, bracketName } = req.body || {};

    if (!picks || typeof picks !== 'object') {
      return res.status(400).json({ error: 'Missing picks data' });
    }

    const { data: existing } = await sb
      .from('user_brackets')
      .select('id')
      .eq('user_id', user.id)
      .eq('year', 2026)
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();

    const payload = {
      user_id: user.id,
      year: 2026,
      picks,
      pick_origins: pickOrigins || {},
      bracket_name: bracketName || 'My Bracket',
      updated_at: new Date().toISOString(),
    };

    let result;
    if (existing?.id) {
      result = await sb
        .from('user_brackets')
        .update(payload)
        .eq('id', existing.id)
        .select()
        .single();
    } else {
      payload.created_at = new Date().toISOString();
      result = await sb
        .from('user_brackets')
        .insert(payload)
        .select()
        .single();
    }

    if (result.error) {
      // Table doesn't exist — return a helpful message instead of a 500
      const isTableMissing = result.error.message?.includes('schema cache')
        || result.error.message?.includes('user_brackets')
        || result.error.code === '42P01'
        || result.error.code === 'PGRST204';
      if (isTableMissing) {
        console.warn(`[bracketology/picks] POST save skipped — table not in schema cache. project: ${projectRef}, code: ${result.error.code}`);
        return res.status(200).json({ ok: false, _tablesMissing: true, _diag: { project: projectRef, code: result.error.code } });
      }
      console.error('[bracketology/picks] POST error:', result.error.message);
      return res.status(500).json({ error: 'Failed to save bracket' });
    }

    return res.status(200).json({ ok: true, bracket: result.data });
  } catch (err) {
    console.error('[bracketology/picks] POST exception:', err.message);
    return res.status(500).json({ error: 'Internal error' });
  }
}
