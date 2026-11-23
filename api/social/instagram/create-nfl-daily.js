/**
 * GET /api/social/instagram/create-nfl-daily
 *
 * Builds the NFL daily post every morning (cron, 14:00 UTC, 6 AM Pacific)
 * and leaves it in the Content Studio as a draft: three slide images in
 * storage and the caption, one row in social_posts. It does not publish.
 * A person reviews it in Post History and posts it.
 *
 * The slides are screenshots of /render/nfl-daily, the same components and
 * payload the studio previews, so the draft is what the studio would show.
 *
 * Once per Pacific day. ?force=1 makes another.
 * Auth: Vercel cron secret.
 */
import { randomUUID } from 'node:crypto';
import { getSupabaseAdmin } from '../../_lib/supabaseAdmin.js';
import { hasCronSecret } from '../../_lib/requireAuth.js';
import { internalBaseUrl } from '../../_lib/siteUrl.js';
import { renderSlidesWithBrowser } from '../../_lib/mlbBrowserRenderer.js';
import { isSeasonActive, WorkspaceId } from '../../../src/workspaces/config.js';

const SECTION = 'nfl-daily';

function ptDateKey(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export default async function handler(req, res) {
  if (!hasCronSecret(req)) return res.status(401).json({ ok: false, error: 'unauthorized' });

  const requestId = randomUUID().slice(0, 8);
  const log = {
    info: (...a) => console.log(`[nfl-daily ${requestId}]`, ...a),
    warn: (...a) => console.warn(`[nfl-daily ${requestId}]`, ...a),
    error: (...a) => console.error(`[nfl-daily ${requestId}]`, ...a),
  };
  const url = new URL(req.url, 'http://localhost');
  const force = url.searchParams.get('force') === '1';
  const dateKey = ptDateKey();
  const title = `NFL The Daily — ${dateKey}`;

  let seasonOn = true;
  try { seasonOn = isSeasonActive(WorkspaceId.NFL); } catch { /* config shape changed: carry on */ }
  if (!seasonOn) return res.status(200).json({ ok: true, skipped: 'nfl_not_in_season', dateKey });

  const supabase = getSupabaseAdmin();
  if (!force) {
    const { data: existing } = await supabase.from('social_posts')
      .select('id').eq('content_studio_section', SECTION).eq('title', title).in('lifecycle_status', ['draft', 'posted']).limit(1);
    if (existing?.length) return res.status(200).json({ ok: true, skipped: 'already_created_today', dateKey, id: existing[0].id });
  }

  const record = async (lifecycle_status, extra) => {
    const { data, error } = await supabase.from('social_posts').insert([{
      platform: 'instagram', lifecycle_status, content_type: 'carousel', title,
      content_studio_section: SECTION, template_type: SECTION,
      generated_by: 'daily_cron', triggered_by: force ? 'manual_force' : 'cron_daily', ...extra,
    }]).select('id').single();
    if (error) log.error('social_posts insert failed:', error.message);
    return data?.id || null;
  };

  try {
    const baseUrl = internalBaseUrl(req);
    const buffers = await renderSlidesWithBrowser(baseUrl, null, log, {
      route: '/render/nfl-daily',
      collect: () => window.__POST__ || null,
    });
    const post = buffers?.extra;
    if (!buffers || buffers.length < 3) throw new Error('slides did not render');
    if (!post?.ready || !post.caption) {
      const id = await record('skipped', { error_message: 'Nothing to post: no graded wins, no game today and no schedule ahead.' });
      return res.status(200).json({ ok: true, skipped: 'nothing_to_post', dateKey, id });
    }

    const stamp = Date.now();
    const urls = [];
    for (let i = 0; i < buffers.length; i++) {
      const filename = `${stamp}_${requestId}_nfl-daily_${dateKey}_slide${i + 1}.png`;
      const { error } = await supabase.storage.from('social-assets')
        .upload(filename, buffers[i], { contentType: 'image/png', upsert: false, cacheControl: '31536000' });
      if (error) throw new Error(`upload failed: ${error.message}`);
      urls.push(supabase.storage.from('social-assets').getPublicUrl(filename).data.publicUrl);
    }

    const caption = [post.caption.longCaption, (post.caption.hashtags || []).join(' ')].filter(Boolean).join('\n\n');
    const id = await record('draft', {
      caption, caption_snapshot: caption, image_url: urls[0], image_snapshot_url: urls[0],
      status_detail: JSON.stringify({ slides: urls, shortCaption: post.caption.shortCaption, summary: post.summary, week: post.week }),
    });
    log.info('draft created', JSON.stringify({ id, summary: post.summary }));
    return res.status(200).json({ ok: true, id, dateKey, slides: urls, caption, summary: post.summary });
  } catch (err) {
    log.error('failed:', err?.message);
    await record('failed', { error_message: String(err?.message || err).slice(0, 500) });
    return res.status(500).json({ ok: false, error: err?.message, dateKey });
  }
}
