/**
 * POST /api/social/instagram/publish
 *
 * Production Instagram publishing route for Maximus Sports Content Studio.
 *
 * Flow:
 *   1. Validate request body
 *   2. Pre-flight: HEAD-check the image URL to confirm it is fetchable
 *   3. Insert a `pending` social_posts record (audit trail starts immediately)
 *   4. Three-step Instagram Login API publish:
 *        a. POST  /{id}/media        → creationId  (container creation)
 *        b. POLL  GET /{creationId}?fields=status_code  until FINISHED
 *        c. POST  /{id}/media_publish → publishedMediaId
 *   5. Update the record to `posted` or `failed`
 *   6. Return safe response JSON
 *
 * Request body (JSON):
 *   imageUrl  {string}   — public HTTPS URL (must be reachable by Meta's servers)
 *   caption   {string}   — full caption text including hashtags
 *   metadata  {object}   — optional audit / context fields:
 *     title, contentType, teamSlug, teamName,
 *     contentStudioSection, generatedBy, templateType
 *
 * Response:
 *   { ok, stage, postId, creationId, publishedMediaId, debug }
 *
 * Required env vars:
 *   INSTAGRAM_ACCOUNT_ID   — numeric Instagram user ID
 *   INSTAGRAM_ACCESS_TOKEN — Instagram Login API access token
 *   SUPABASE_URL / VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { getSupabaseAdmin } from '../../_lib/supabaseAdmin.js';

// ── Constants ───────────────────────────────────────────────────────────────
const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS  = 90_000;
const IG_API_VERSION   = 'v23.0';

// ── Env sanitization (same pattern as /api/instagram/status) ────────────────
function sanitizeEnv(value) {
  if (value == null) return '';
  let s = String(value).trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

// ── Safe Meta error extractor ────────────────────────────────────────────────
function safeMetaError(raw) {
  const e = raw?.error ?? raw ?? {};
  return {
    message:    e.message    ?? 'Unknown error',
    type:       e.type       ?? null,
    code:       e.code       ?? null,
    fbtrace_id: e.fbtrace_id ?? null,
  };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Supabase helpers ─────────────────────────────────────────────────────────

async function insertPendingRecord(supabase, fields) {
  const { data, error } = await supabase
    .from('social_posts')
    .insert([{
      platform:               'instagram',
      lifecycle_status:       'pending',
      title:                  fields.title              ?? null,
      content_type:           fields.contentType        ?? null,
      caption:                fields.caption            ?? null,
      caption_snapshot:       fields.caption            ?? null,
      image_url:              fields.imageUrl           ?? null,
      image_snapshot_url:     fields.imageUrl           ?? null,
      team_slug:              fields.teamSlug           ?? null,
      team_name:              fields.teamName           ?? null,
      content_studio_section: fields.contentStudioSection ?? null,
      generated_by:           fields.generatedBy        ?? null,
      template_type:          fields.templateType       ?? null,
      triggered_by:           'manual_ui',
      route_used:             '/api/social/instagram/publish',
    }])
    .select('id')
    .single();

  if (error) throw new Error(`DB insert failed: ${error.message}`);
  return data.id;
}

async function updateRecord(supabase, id, patch) {
  const { error } = await supabase
    .from('social_posts')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) console.error('[social/publish] DB update failed:', error.message);
}

// ── Pre-flight image check ──────────────────────────────────────────────────

async function verifyImageUrl(url) {
  try {
    const resp = await fetch(url, { method: 'HEAD' });
    const ct = resp.headers.get('content-type') ?? '';
    return {
      reachable:   resp.ok,
      status:      resp.status,
      contentType: ct,
      isImage:     ct.startsWith('image/'),
    };
  } catch (err) {
    return { reachable: false, status: 0, contentType: null, isImage: false, error: err.message };
  }
}

// ── Container status polling ────────────────────────────────────────────────

async function pollContainerStatus(containerId, accessToken) {
  const endpoint = `https://graph.instagram.com/${IG_API_VERSION}/${containerId}`;
  const start = Date.now();
  const pollLog = [];

  while (Date.now() - start < POLL_TIMEOUT_MS) {
    await sleep(POLL_INTERVAL_MS);
    const elapsed = Date.now() - start;

    let statusCode, rawData;
    try {
      const resp = await fetch(
        `${endpoint}?fields=status_code,status&access_token=${encodeURIComponent(accessToken)}`,
      );
      rawData = await resp.json();
      statusCode = rawData.status_code ?? rawData.status ?? null;
    } catch (err) {
      pollLog.push({ elapsed, error: err.message });
      continue;
    }

    const entry = { elapsed, statusCode, id: rawData.id ?? containerId };
    if (rawData.status) entry.statusDetail = rawData.status;
    pollLog.push(entry);

    console.log(`[social/publish] poll container ${containerId}: ${statusCode} (${elapsed}ms)`);

    if (statusCode === 'FINISHED') {
      return { ready: true, statusCode, elapsed, pollLog };
    }

    if (statusCode === 'ERROR' || statusCode === 'EXPIRED') {
      return {
        ready: false,
        statusCode,
        elapsed,
        pollLog,
        error: rawData.status ?? `Container entered ${statusCode} state`,
      };
    }
  }

  return {
    ready: false,
    statusCode: 'TIMEOUT',
    elapsed: Date.now() - start,
    pollLog,
    error: `Container did not reach FINISHED within ${POLL_TIMEOUT_MS / 1000}s`,
  };
}

// ── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  // --- Stage: env ---
  const envCheck = {
    INSTAGRAM_ACCOUNT_ID:   !!process.env.INSTAGRAM_ACCOUNT_ID,
    INSTAGRAM_ACCESS_TOKEN: !!process.env.INSTAGRAM_ACCESS_TOKEN,
  };

  if (!envCheck.INSTAGRAM_ACCOUNT_ID || !envCheck.INSTAGRAM_ACCESS_TOKEN) {
    return res.status(500).json({
      ok: false,
      stage: 'env',
      error: 'Missing required Instagram environment variables',
      envCheck,
    });
  }

  const accountId   = sanitizeEnv(process.env.INSTAGRAM_ACCOUNT_ID);
  const accessToken = sanitizeEnv(process.env.INSTAGRAM_ACCESS_TOKEN);

  const debug = {
    tokenLength:              accessToken.length,
    tokenPrefix:              accessToken.slice(0, 8),
    tokenHasWhitespace:       /\s/.test(accessToken),
    tokenHasNewline:          /[\r\n]/.test(accessToken),
    instagramAccountIdLength: accountId.length,
    deploymentEnv:            process.env.VERCEL_ENV ?? null,
    vercelUrl:                process.env.VERCEL_URL ?? null,
    tokenHostFamily:          'instagram_login_candidate',
  };

  // --- Stage: validate ---
  const { imageUrl, caption, metadata = {} } = req.body ?? {};

  if (!imageUrl || typeof imageUrl !== 'string' || imageUrl.trim() === '') {
    return res.status(400).json({
      ok: false, stage: 'validate',
      error: 'imageUrl is required and must be a non-empty string', debug,
    });
  }

  if (!imageUrl.startsWith('https://')) {
    return res.status(400).json({
      ok: false, stage: 'validate',
      error: 'imageUrl must be a public HTTPS URL so Instagram can fetch it',
      debug,
    });
  }

  if (!caption || typeof caption !== 'string' || caption.trim() === '') {
    return res.status(400).json({
      ok: false, stage: 'validate',
      error: 'caption is required and must be a non-empty string', debug,
    });
  }

  // --- Stage: preflight (verify image URL is reachable) ---
  const imgCheck = await verifyImageUrl(imageUrl.trim());
  debug.imageUrlCheck = imgCheck;
  console.log('[social/publish] image preflight:', imgCheck);

  if (!imgCheck.reachable) {
    return res.status(400).json({
      ok: false, stage: 'preflight',
      error: `Image URL is not reachable (HTTP ${imgCheck.status}). Instagram will not be able to fetch it.`,
      debug,
    });
  }
  if (!imgCheck.isImage) {
    console.warn(`[social/publish] image URL Content-Type is "${imgCheck.contentType}", expected image/*`);
  }

  // --- Init Supabase ---
  let supabase = null;
  try {
    supabase = getSupabaseAdmin();
  } catch {
    supabase = null;
  }

  // --- Insert pending record ---
  let postId = null;
  if (supabase) {
    try {
      postId = await insertPendingRecord(supabase, {
        imageUrl:              imageUrl.trim(),
        caption:               caption.trim(),
        title:                 metadata.title              ?? null,
        contentType:           metadata.contentType        ?? null,
        teamSlug:              metadata.teamSlug           ?? null,
        teamName:              metadata.teamName           ?? null,
        contentStudioSection:  metadata.contentStudioSection ?? null,
        generatedBy:           metadata.generatedBy        ?? null,
        templateType:          metadata.templateType       ?? null,
      });
    } catch (err) {
      console.error('[social/publish] Could not insert pending record:', err.message);
    }
  }

  // --- Stage: create_media ---
  const createEndpoint = `https://graph.instagram.com/${IG_API_VERSION}/${accountId}/media`;
  const createBody = new URLSearchParams({
    image_url:    imageUrl.trim(),
    caption:      caption.trim(),
    access_token: accessToken,
  });

  let creationId = null;
  try {
    console.log(`[social/publish] creating media container — image: ${imageUrl.trim().slice(0, 120)}`);
    const createRes  = await fetch(createEndpoint, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    createBody.toString(),
    });
    const createData = await createRes.json();

    if (!createRes.ok || createData.error) {
      const err = safeMetaError(createData);
      console.error('[social/publish] create_media failed:', JSON.stringify(err));
      if (supabase && postId) {
        await updateRecord(supabase, postId, {
          lifecycle_status: 'failed',
          status_detail:    'create_media',
          error_message:    err.message,
          response_stage:   'create_media',
        });
      }
      return res.status(502).json({
        ok: false, stage: 'create_media', postId, debug,
        error: err,
      });
    }

    creationId = createData.id ?? createData.creation_id ?? null;
    console.log(`[social/publish] container created: ${creationId}`);

    if (!creationId) {
      if (supabase && postId) {
        await updateRecord(supabase, postId, {
          lifecycle_status: 'failed',
          status_detail:    'create_media',
          error_message:    'No container id returned by Instagram API',
          response_stage:   'create_media',
        });
      }
      return res.status(502).json({
        ok: false, stage: 'create_media', postId, debug,
        error: { message: 'Media container created but no id returned', type: null, code: null, fbtrace_id: null },
        rawKeys: Object.keys(createData),
      });
    }
  } catch (err) {
    console.error('[social/publish] create_media network error:', err.message);
    if (supabase && postId) {
      await updateRecord(supabase, postId, {
        lifecycle_status: 'failed',
        status_detail:    'create_media',
        error_message:    err.message ?? 'Network error',
        response_stage:   'create_media',
      });
    }
    return res.status(500).json({
      ok: false, stage: 'create_media', postId, debug,
      error: { message: err.message ?? 'Network error during media container creation', type: null, code: null, fbtrace_id: null },
    });
  }

  if (supabase && postId) {
    await updateRecord(supabase, postId, { creation_id: creationId });
  }

  // --- Stage: poll_container (wait for FINISHED) ---
  console.log(`[social/publish] polling container ${creationId} for readiness…`);
  const poll = await pollContainerStatus(creationId, accessToken);
  debug.containerPoll = {
    ready:      poll.ready,
    statusCode: poll.statusCode,
    elapsed:    poll.elapsed,
    attempts:   poll.pollLog.length,
  };

  if (!poll.ready) {
    const errMsg = poll.statusCode === 'TIMEOUT'
      ? `Instagram did not finish processing the image within ${POLL_TIMEOUT_MS / 1000}s. The image may be too large or Instagram is slow — please try again.`
      : `Instagram media container failed with status "${poll.statusCode}": ${poll.error}`;

    console.error(`[social/publish] container not ready: ${poll.statusCode}`, poll.error);
    if (supabase && postId) {
      await updateRecord(supabase, postId, {
        lifecycle_status: 'failed',
        status_detail:    'poll_container',
        error_message:    errMsg,
        response_stage:   'poll_container',
      });
    }
    return res.status(502).json({
      ok: false, stage: 'poll_container', postId, creationId, debug,
      error: { message: errMsg, type: null, code: poll.statusCode, fbtrace_id: null },
      pollLog: poll.pollLog,
    });
  }

  console.log(`[social/publish] container FINISHED after ${poll.elapsed}ms (${poll.pollLog.length} polls)`);

  // --- Stage: publish_media ---
  const publishEndpoint = `https://graph.instagram.com/${IG_API_VERSION}/${accountId}/media_publish`;
  const publishBody = new URLSearchParams({
    creation_id:  creationId,
    access_token: accessToken,
  });

  let publishedMediaId = null;
  try {
    console.log(`[social/publish] publishing container ${creationId}…`);
    const publishRes  = await fetch(publishEndpoint, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    publishBody.toString(),
    });
    const publishData = await publishRes.json();

    if (!publishRes.ok || publishData.error) {
      const err = safeMetaError(publishData);
      console.error('[social/publish] publish_media failed:', JSON.stringify(err));
      if (supabase && postId) {
        await updateRecord(supabase, postId, {
          lifecycle_status: 'failed',
          status_detail:    'publish_media',
          error_message:    err.message,
          response_stage:   'publish_media',
        });
      }
      return res.status(502).json({
        ok: false, stage: 'publish_media', postId, creationId, debug,
        error: err,
      });
    }

    publishedMediaId = publishData.id ?? null;
    console.log(`[social/publish] published! mediaId: ${publishedMediaId}`);
  } catch (err) {
    console.error('[social/publish] publish_media network error:', err.message);
    if (supabase && postId) {
      await updateRecord(supabase, postId, {
        lifecycle_status: 'failed',
        status_detail:    'publish_media',
        error_message:    err.message ?? 'Network error',
        response_stage:   'publish_media',
      });
    }
    return res.status(500).json({
      ok: false, stage: 'publish_media', postId, creationId, debug,
      error: { message: err.message ?? 'Network error during media publish', type: null, code: null, fbtrace_id: null },
    });
  }

  // --- Update record to posted ---
  if (supabase && postId) {
    await updateRecord(supabase, postId, {
      lifecycle_status:  'posted',
      posted_at:         new Date().toISOString(),
      creation_id:       creationId,
      published_media_id: publishedMediaId,
      status_detail:     'ok',
      response_stage:    'ok',
    });
  }

  // --- Stage: ok ---
  return res.status(200).json({
    ok:              true,
    stage:           'ok',
    postId,
    creationId,
    publishedMediaId,
    debug,
  });
}
