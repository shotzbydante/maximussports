/**
 * POST /api/social/instagram/publish-carousel
 *
 * Instagram CAROUSEL publishing route for Maximus Sports Content Studio.
 *
 * Flow:
 *   1. Validate request body (imageUrls array, caption)
 *   2. Pre-flight: HEAD-check each image URL
 *   3. Insert a `pending` social_posts record
 *   4. For each image:
 *        a. POST /{id}/media with image_url + is_carousel_item=true → childId
 *        b. POLL GET /{childId}?fields=status_code until FINISHED
 *   5. Create parent carousel container:
 *        POST /{id}/media with media_type=CAROUSEL, children=[ids], caption
 *   6. Poll parent container until FINISHED
 *   7. POST /{id}/media_publish → publishedMediaId
 *   8. Fetch permalink, update DB record
 *
 * Request body:
 *   imageUrls  {string[]}  — array of public HTTPS URLs (2-10 images)
 *   caption    {string}    — full caption text
 *   metadata   {object}    — optional audit fields
 */

import { getSupabaseAdmin } from '../../_lib/supabaseAdmin.js';
import { randomUUID } from 'node:crypto';

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS  = 90_000;
const IG_API_VERSION   = 'v23.0';

function createLogger(requestId) {
  const short = requestId.slice(0, 8);
  const prefix = `[social/carousel req=${short}]`;
  return {
    info:  (...args) => console.log(prefix, ...args),
    warn:  (...args) => console.warn(prefix, ...args),
    error: (...args) => console.error(prefix, ...args),
  };
}

function sanitizeEnv(value) {
  if (value == null) return '';
  let s = String(value).trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

function safeMetaError(raw) {
  const e = raw?.error ?? raw ?? {};
  return {
    message:       e.message        ?? 'Unknown error',
    type:          e.type           ?? null,
    code:          e.code           ?? null,
    error_subcode: e.error_subcode  ?? null,
    fbtrace_id:    e.fbtrace_id     ?? null,
  };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function pollContainerStatus(containerId, accessToken, log) {
  const pollEndpoint = `https://graph.instagram.com/${IG_API_VERSION}/${containerId}`;
  const params = new URLSearchParams({ fields: 'status_code,status', access_token: accessToken });
  const startMs = Date.now();
  const pollLog = [];

  while (Date.now() - startMs < POLL_TIMEOUT_MS) {
    await sleep(POLL_INTERVAL_MS);
    try {
      const res = await fetch(`${pollEndpoint}?${params}`);
      const data = await res.json();
      const statusCode = data.status_code ?? data.status ?? 'UNKNOWN';
      pollLog.push({ ts: Date.now() - startMs, statusCode });

      if (statusCode === 'FINISHED') {
        return { ready: true, statusCode, elapsed: Date.now() - startMs, pollLog, error: null };
      }
      if (statusCode === 'ERROR' || statusCode === 'EXPIRED') {
        return { ready: false, statusCode, elapsed: Date.now() - startMs, pollLog, error: data.status ?? statusCode };
      }
    } catch (err) {
      pollLog.push({ ts: Date.now() - startMs, error: err.message });
    }
  }

  return { ready: false, statusCode: 'TIMEOUT', elapsed: Date.now() - startMs, pollLog, error: 'Polling timed out' };
}

async function fetchPermalink(mediaId, accessToken, log) {
  try {
    const url = `https://graph.instagram.com/${IG_API_VERSION}/${mediaId}?fields=permalink&access_token=${accessToken}`;
    const res = await fetch(url);
    const data = await res.json();
    return data.permalink ?? null;
  } catch {
    log.warn('permalink fetch failed (non-blocking)');
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const requestId = randomUUID();
  const log = createLogger(requestId);
  const startTs = Date.now();

  const { imageUrls, caption, metadata = {} } = req.body ?? {};

  // ── Validate ──
  if (!Array.isArray(imageUrls) || imageUrls.length < 2 || imageUrls.length > 10) {
    return res.status(400).json({
      ok: false, stage: 'validation', requestId,
      error: 'imageUrls must be an array of 2-10 public HTTPS image URLs.',
    });
  }
  if (!caption || typeof caption !== 'string') {
    return res.status(400).json({
      ok: false, stage: 'validation', requestId,
      error: 'caption is required.',
    });
  }

  const accountId   = sanitizeEnv(process.env.INSTAGRAM_ACCOUNT_ID);
  const accessToken = sanitizeEnv(process.env.INSTAGRAM_ACCESS_TOKEN);

  if (!accountId || !accessToken) {
    log.error('missing INSTAGRAM_ACCOUNT_ID or INSTAGRAM_ACCESS_TOKEN');
    return res.status(500).json({
      ok: false, stage: 'config', requestId,
      error: 'Instagram API credentials are not configured.',
    });
  }

  // ── Supabase (best-effort audit trail) ──
  let supabase = null;
  let postId = null;
  try {
    supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('social_posts')
      .insert([{
        platform:               'instagram',
        lifecycle_status:       'pending',
        title:                  metadata.title              ?? null,
        content_type:           'carousel',
        caption:                caption,
        caption_snapshot:       caption,
        image_url:              imageUrls[0],
        image_snapshot_url:     imageUrls[0],
        team_slug:              metadata.teamSlug           ?? null,
        team_name:              metadata.teamName           ?? null,
        content_studio_section: metadata.contentStudioSection ?? null,
        generated_by:           metadata.generatedBy        ?? 'content_studio',
        template_type:          metadata.templateType       ?? null,
        triggered_by:           metadata.triggered_by ?? 'manual_ui',
        route_used:             '/api/social/instagram/publish-carousel',
        asset_version:          requestId,
        status_detail:          JSON.stringify({ imageCount: imageUrls.length }),
      }])
      .select('id')
      .single();

    if (!error && data) postId = data.id;
  } catch (e) {
    log.warn('DB audit trail setup failed (non-blocking):', e.message);
  }

  const failAndReturn = (status, stage, errDetail, extra = {}) => {
    const classified = { category: 'unknown', userMessage: errDetail.message };
    if (supabase && postId) {
      supabase.from('social_posts').update({
        lifecycle_status: 'failed',
        response_stage: stage,
        error_message: errDetail.message,
        status_detail: JSON.stringify({ ...extra, error: errDetail }),
        updated_at: new Date().toISOString(),
      }).eq('id', postId).then(() => {});
    }
    return res.status(status).json({
      ok: false, stage, requestId, postId,
      error: { ...errDetail, ...classified },
    });
  };

  log.info(`carousel publish start: ${imageUrls.length} images, caption_length=${caption.length}`);

  // ── Step 1: Create child containers (one per image) ──
  const childIds = [];
  for (let i = 0; i < imageUrls.length; i++) {
    const imageUrl = imageUrls[i];
    log.info(`creating child container ${i + 1}/${imageUrls.length}: ${imageUrl.slice(0, 100)}`);

    try {
      const createRes = await fetch(`https://graph.instagram.com/${IG_API_VERSION}/${accountId}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          image_url: imageUrl.trim(),
          is_carousel_item: 'true',
          access_token: accessToken,
        }).toString(),
      });
      const createData = await createRes.json();

      if (!createRes.ok || createData.error) {
        const err = safeMetaError(createData);
        log.error(`child ${i + 1} creation failed:`, err.message);
        return failAndReturn(502, 'create_child', err, { childIndex: i });
      }

      const childId = createData.id ?? null;
      if (!childId) {
        return failAndReturn(502, 'create_child', { message: `Child ${i + 1} created but no id returned` });
      }
      childIds.push(childId);
      log.info(`child ${i + 1} created: ${childId}`);
    } catch (err) {
      return failAndReturn(500, 'create_child', { message: err.message }, { childIndex: i });
    }
  }

  // ── Step 2: Poll each child until FINISHED ──
  for (let i = 0; i < childIds.length; i++) {
    log.info(`polling child ${i + 1}/${childIds.length}: ${childIds[i]}`);
    const poll = await pollContainerStatus(childIds[i], accessToken, log);
    if (!poll.ready) {
      log.error(`child ${i + 1} did not finish: ${poll.statusCode}`);
      return failAndReturn(502, 'poll_child', {
        message: `Child container ${i + 1} failed: ${poll.statusCode}`,
      }, { childIndex: i, pollLog: poll.pollLog });
    }
    log.info(`child ${i + 1} FINISHED (${poll.elapsed}ms)`);
  }

  // ── Step 3: Create parent carousel container ──
  log.info('creating parent carousel container...');
  let parentId = null;
  try {
    const parentRes = await fetch(`https://graph.instagram.com/${IG_API_VERSION}/${accountId}/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        media_type: 'CAROUSEL',
        children: childIds.join(','),
        caption: caption.trim(),
        access_token: accessToken,
      }).toString(),
    });
    const parentData = await parentRes.json();

    if (!parentRes.ok || parentData.error) {
      const err = safeMetaError(parentData);
      log.error('parent container creation failed:', err.message);
      return failAndReturn(502, 'create_parent', err);
    }

    parentId = parentData.id ?? null;
    if (!parentId) {
      return failAndReturn(502, 'create_parent', { message: 'Parent container created but no id returned' });
    }
    log.info(`parent container created: ${parentId}`);
  } catch (err) {
    return failAndReturn(500, 'create_parent', { message: err.message });
  }

  // ── Step 4: Poll parent container ──
  log.info('polling parent container...');
  const parentPoll = await pollContainerStatus(parentId, accessToken, log);
  if (!parentPoll.ready) {
    return failAndReturn(502, 'poll_parent', {
      message: `Parent container failed: ${parentPoll.statusCode}`,
    }, { parentId, pollLog: parentPoll.pollLog });
  }
  log.info(`parent FINISHED (${parentPoll.elapsed}ms)`);

  // ── Step 5: Publish ──
  let publishedMediaId = null;
  try {
    log.info('publishing carousel...');
    const publishRes = await fetch(`https://graph.instagram.com/${IG_API_VERSION}/${accountId}/media_publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        creation_id: parentId,
        access_token: accessToken,
      }).toString(),
    });
    const publishData = await publishRes.json();

    if (!publishRes.ok || publishData.error) {
      const err = safeMetaError(publishData);
      return failAndReturn(502, 'publish_media', err, { parentId });
    }

    publishedMediaId = publishData.id ?? null;
    log.info('carousel published — mediaId:', publishedMediaId);
  } catch (err) {
    return failAndReturn(500, 'publish_media', { message: err.message }, { parentId });
  }

  // ── Step 6: Critical status update (before permalink — prevents timeout-induced stale pending) ──
  const durationMs = Date.now() - startTs;

  if (supabase && postId) {
    try {
      const { error: critUpdateErr } = await supabase.from('social_posts').update({
        lifecycle_status:   'posted',
        creation_id:        parentId,
        published_media_id: publishedMediaId,
        response_stage:     'ok',
        posted_at:          new Date().toISOString(),
        updated_at:         new Date().toISOString(),
      }).eq('id', postId);

      if (critUpdateErr) {
        log.warn('critical status update returned error:', critUpdateErr.message);
      } else {
        log.info('critical status update: lifecycle_status=posted');
      }
    } catch (e) {
      log.warn('critical status update exception:', e.message);
    }
  }

  // ── Step 7: Permalink fetch (best-effort — post is already marked as posted) ──
  let permalink = null;
  if (publishedMediaId) {
    permalink = await fetchPermalink(publishedMediaId, accessToken, log);
  }

  log.info(`carousel publish complete: ${durationMs}ms, permalink=${permalink ?? 'n/a'}`);

  // ── Step 8: Final enrichment update (permalink stored inside status_detail JSON) ──
  // NOTE: `permalink` is NOT a top-level column on social_posts.
  // It is persisted inside the status_detail JSON blob.
  if (supabase && postId) {
    try {
      const { error: enrichErr } = await supabase.from('social_posts').update({
        status_detail: JSON.stringify({
          childIds,
          parentId,
          permalink: permalink ?? null,
          imageCount: imageUrls.length,
          durationMs,
        }),
      }).eq('id', postId);

      if (enrichErr) {
        log.warn('status_detail enrichment returned error:', enrichErr.message);
      }
    } catch (e) {
      log.warn('status_detail enrichment failed (non-blocking):', e.message);
    }
  }

  return res.status(200).json({
    ok: true,
    stage: 'ok',
    postId,
    requestId,
    publishedMediaId,
    permalink,
    durationMs,
    debug: { childIds, parentId, imageCount: imageUrls.length },
  });
}
