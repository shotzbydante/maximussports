/**
 * GET /api/social/posts
 *
 * Returns paginated social post history from Supabase, sorted newest-first.
 * Used by the Post History panel in the Content Studio dashboard.
 *
 * Query params (all optional):
 *   platform  — filter by platform (default: all)
 *   status    — filter by lifecycle_status ('draft'|'pending'|'posted'|'failed')
 *   team      — filter by team_slug
 *   limit     — max records to return (default: 50, max: 200)
 *
 * Response:
 *   { ok: true, posts: SocialPost[], total: number }
 */

import { getSupabaseAdmin } from '../_lib/supabaseAdmin.js';
import { getQuery } from '../_requestUrl.js';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT     = 200;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch (err) {
    return res.status(500).json({
      ok:    false,
      error: err.message ?? 'Supabase admin client unavailable',
    });
  }

  const { platform, status, team, limit: rawLimit } = getQuery(req);
  const limit = Math.min(parseInt(rawLimit ?? DEFAULT_LIMIT, 10) || DEFAULT_LIMIT, MAX_LIMIT);

  let query = supabase
    .from('social_posts')
    .select(`
      id,
      platform,
      lifecycle_status,
      content_type,
      title,
      caption_snapshot,
      image_snapshot_url,
      created_at,
      updated_at,
      posted_at,
      published_media_id,
      creation_id,
      error_message,
      team_slug,
      team_name,
      content_studio_section,
      template_type,
      triggered_by,
      response_stage
    `)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (platform) query = query.eq('platform', platform);
  if (status)   query = query.eq('lifecycle_status', status);
  if (team)     query = query.eq('team_slug', team);

  const { data, error, count } = await query;

  if (error) {
    const msg = error.message ?? 'Database query failed';
    const isMissingTable =
      /could not find.*social_posts.*schema cache/i.test(msg) ||
      /relation.*social_posts.*does not exist/i.test(msg);

    if (isMissingTable) {
      return res.status(503).json({
        ok:    false,
        stage: 'schema_missing',
        error: "Social posts storage is not initialized: missing Supabase table 'public.social_posts'. " +
               'Run the migration in docs/social-posts-migration.sql via the Supabase SQL editor.',
      });
    }

    return res.status(502).json({
      ok:    false,
      stage: 'db_error',
      error: msg,
    });
  }

  return res.status(200).json({
    ok:    true,
    posts: data ?? [],
    total: count ?? (data?.length ?? 0),
  });
}
