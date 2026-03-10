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
 *   5. Fetch permalink for the published media
 *   6. Update the record to `posted` or `failed` with extended metadata
 *   7. Return safe response JSON
 *
 * Every request gets a unique request_id carried through all log lines and
 * persisted to the social_posts record for operator traceability.
 *
 * Request body (JSON):
 *   imageUrl  {string}   — public HTTPS URL (must be reachable by Meta's servers)
 *   caption   {string}   — full caption text including hashtags
 *   metadata  {object}   — optional audit / context fields:
 *     title, contentType, teamSlug, teamName,
 *     contentStudioSection, generatedBy, templateType
 *
 * Response:
 *   { ok, stage, postId, creationId, publishedMediaId, permalink, requestId, durationMs, debug }
 *
 * Required env vars:
 *   INSTAGRAM_ACCOUNT_ID   — numeric Instagram user ID
 *   INSTAGRAM_ACCESS_TOKEN — Instagram Login API access token
 *   SUPABASE_URL / VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { getSupabaseAdmin } from '../../_lib/supabaseAdmin.js';
import { randomUUID } from 'node:crypto';

// ── Constants ───────────────────────────────────────────────────────────────
const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS  = 90_000;
const IG_API_VERSION   = 'v23.0';

// ── Structured logger ───────────────────────────────────────────────────────

function createLogger(requestId) {
  const short = requestId.slice(0, 8);
  const prefix = `[social/publish req=${short}]`;
  return {
    info:  (...args) => console.log(prefix, ...args),
    warn:  (...args) => console.warn(prefix, ...args),
    error: (...args) => console.error(prefix, ...args),
  };
}

// ── Env sanitization ────────────────────────────────────────────────────────

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
      asset_version:          fields.requestId          ?? null,
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

async function pollContainerStatus(containerId, accessToken, log) {
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
      log.warn(`poll error at ${elapsed}ms:`, err.message);
      continue;
    }

    const entry = { elapsed, statusCode, id: rawData.id ?? containerId };
    if (rawData.status) entry.statusDetail = rawData.status;
    pollLog.push(entry);

    log.info(`poll: ${statusCode} (${elapsed}ms)`);

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

// ── Permalink fetch ─────────────────────────────────────────────────────────

async function fetchPermalink(mediaId, accessToken, log) {
  try {
    const resp = await fetch(
      `https://graph.instagram.com/${IG_API_VERSION}/${mediaId}?fields=permalink&access_token=${encodeURIComponent(accessToken)}`,
    );
    const data = await resp.json();
    if (data.permalink) {
      log.info('permalink:', data.permalink);
      return data.permalink;
    }
    log.warn('permalink not returned:', JSON.stringify(data));
    return null;
  } catch (err) {
    log.warn('permalink fetch failed (non-fatal):', err.message);
    return null;
  }
}

// ── Build extended status_detail JSON ───────────────────────────────────────

function buildStatusDetail(fields) {
  return JSON.stringify({
    request_id:     fields.requestId,
    started_at:     fields.startedAt,
    completed_at:   new Date().toISOString(),
    duration_ms:    Date.now() - fields.startTs,
    final_stage:    fields.finalStage,
    poll_attempts:  fields.pollAttempts  ?? 0,
    poll_elapsed:   fields.pollElapsed   ?? 0,
    permalink:      fields.permalink     ?? null,
    preflight:      fields.preflight     ?? null,
    ig_error_code:  fields.igErrorCode   ?? null,
    ig_error_type:  fields.igErrorType   ?? null,
    ig_fbtrace_id:  fields.igFbtraceId   ?? null,
  });
}

// ── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  const requestId = randomUUID();
  const startTs   = Date.now();
  const startedAt = new Date(startTs).toISOString();
  const log       = createLogger(requestId);

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  log.info('publish request received');

  // --- Stage: env ---
  const envCheck = {
    INSTAGRAM_ACCOUNT_ID:   !!process.env.INSTAGRAM_ACCOUNT_ID,
    INSTAGRAM_ACCESS_TOKEN: !!process.env.INSTAGRAM_ACCESS_TOKEN,
  };

  if (!envCheck.INSTAGRAM_ACCOUNT_ID || !envCheck.INSTAGRAM_ACCESS_TOKEN) {
    log.error('missing env vars:', envCheck);
    return res.status(500).json({
      ok: false, stage: 'env', requestId,
      error: 'Missing required Instagram environment variables',
      envCheck,
    });
  }

  const accountId   = sanitizeEnv(process.env.INSTAGRAM_ACCOUNT_ID);
  const accessToken = sanitizeEnv(process.env.INSTAGRAM_ACCESS_TOKEN);

  const debug = {
    requestId,
    startedAt,
    tokenLength:              accessToken.length,
    tokenPrefix:              accessToken.slice(0, 8),
    tokenHasWhitespace:       /\s/.test(accessToken),
    tokenHasNewline:          /[\r\n]/.test(accessToken),
    instagramAccountIdLength: accountId.length,
    deploymentEnv:            process.env.VERCEL_ENV ?? null,
    vercelUrl:                process.env.VERCEL_URL ?? null,
  };

  // --- Stage: validate ---
  const { imageUrl, caption, metadata = {} } = req.body ?? {};

  if (!imageUrl || typeof imageUrl !== 'string' || imageUrl.trim() === '') {
    return res.status(400).json({
      ok: false, stage: 'validate', requestId,
      error: 'imageUrl is required and must be a non-empty string', debug,
    });
  }

  if (!imageUrl.startsWith('https://')) {
    return res.status(400).json({
      ok: false, stage: 'validate', requestId,
      error: 'imageUrl must be a public HTTPS URL so Instagram can fetch it', debug,
    });
  }

  if (!caption || typeof caption !== 'string' || caption.trim() === '') {
    return res.status(400).json({
      ok: false, stage: 'validate', requestId,
      error: 'caption is required and must be a non-empty string', debug,
    });
  }

  log.info('validated — image:', imageUrl.slice(0, 100), '| caption:', caption.length, 'chars');

  // --- Stage: preflight (verify image URL is reachable) ---
  const imgCheck = await verifyImageUrl(imageUrl.trim());
  debug.imageUrlCheck = imgCheck;
  log.info('preflight:', JSON.stringify(imgCheck));

  if (!imgCheck.reachable) {
    log.error('preflight FAILED — image unreachable');
    return res.status(400).json({
      ok: false, stage: 'preflight', requestId,
      error: `Image URL is not reachable (HTTP ${imgCheck.status}). Instagram will not be able to fetch it.`,
      debug,
    });
  }
  if (!imgCheck.isImage) {
    log.warn(`image URL Content-Type is "${imgCheck.contentType}", expected image/*`);
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
        requestId,
      });
      log.info('DB record created:', postId);
    } catch (err) {
      log.error('DB insert failed (non-fatal):', err.message);
    }
  }

  // Helper to fail + persist in one call
  const failAndReturn = async (httpStatus, stage, errorObj, extra = {}) => {
    log.error(`FAILED at stage=${stage}:`, errorObj.message ?? errorObj);
    if (supabase && postId) {
      await updateRecord(supabase, postId, {
        lifecycle_status: 'failed',
        response_stage:   stage,
        error_message:    errorObj.message ?? String(errorObj),
        status_detail:    buildStatusDetail({
          requestId, startedAt, startTs, finalStage: stage,
          igErrorCode:  errorObj.code  ?? null,
          igErrorType:  errorObj.type  ?? null,
          igFbtraceId:  errorObj.fbtrace_id ?? null,
          preflight:    imgCheck,
          ...extra,
        }),
      });
    }
    return res.status(httpStatus).json({
      ok: false, stage, postId, requestId, debug,
      error: errorObj,
      durationMs: Date.now() - startTs,
      ...extra,
    });
  };

  // --- Stage: create_media ---
  const createEndpoint = `https://graph.instagram.com/${IG_API_VERSION}/${accountId}/media`;
  const createBody = new URLSearchParams({
    image_url:    imageUrl.trim(),
    caption:      caption.trim(),
    access_token: accessToken,
  });

  let creationId = null;
  try {
    log.info('creating media container…');
    const createRes  = await fetch(createEndpoint, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    createBody.toString(),
    });
    const createData = await createRes.json();

    if (!createRes.ok || createData.error) {
      const err = safeMetaError(createData);
      return failAndReturn(502, 'create_media', err);
    }

    creationId = createData.id ?? createData.creation_id ?? null;
    log.info('container created:', creationId);

    if (!creationId) {
      return failAndReturn(502, 'create_media', {
        message: 'Media container created but no id returned',
        type: null, code: null, fbtrace_id: null,
      });
    }
  } catch (err) {
    return failAndReturn(500, 'create_media', {
      message: err.message ?? 'Network error during media container creation',
      type: null, code: null, fbtrace_id: null,
    });
  }

  if (supabase && postId) {
    await updateRecord(supabase, postId, {
      creation_id:    creationId,
      response_stage: 'polling',
    });
  }

  // --- Stage: poll_container (wait for FINISHED) ---
  log.info('polling container for readiness…');
  const poll = await pollContainerStatus(creationId, accessToken, log);
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

    return failAndReturn(502, 'poll_container', {
      message: errMsg, type: null, code: poll.statusCode, fbtrace_id: null,
    }, {
      creationId,
      pollLog: poll.pollLog,
      pollAttempts: poll.pollLog.length,
      pollElapsed: poll.elapsed,
    });
  }

  log.info(`container FINISHED after ${poll.elapsed}ms (${poll.pollLog.length} polls)`);

  // --- Stage: publish_media ---
  const publishEndpoint = `https://graph.instagram.com/${IG_API_VERSION}/${accountId}/media_publish`;
  const publishBody = new URLSearchParams({
    creation_id:  creationId,
    access_token: accessToken,
  });

  let publishedMediaId = null;
  try {
    log.info('publishing…');
    const publishRes  = await fetch(publishEndpoint, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    publishBody.toString(),
    });
    const publishData = await publishRes.json();

    if (!publishRes.ok || publishData.error) {
      const err = safeMetaError(publishData);
      return failAndReturn(502, 'publish_media', err, {
        creationId,
        pollAttempts: poll.pollLog.length,
        pollElapsed: poll.elapsed,
      });
    }

    publishedMediaId = publishData.id ?? null;
    log.info('published — mediaId:', publishedMediaId);
  } catch (err) {
    return failAndReturn(500, 'publish_media', {
      message: err.message ?? 'Network error during media publish',
      type: null, code: null, fbtrace_id: null,
    }, {
      creationId,
      pollAttempts: poll.pollLog.length,
      pollElapsed: poll.elapsed,
    });
  }

  // --- Stage: permalink (best-effort, non-blocking) ---
  let permalink = null;
  if (publishedMediaId) {
    permalink = await fetchPermalink(publishedMediaId, accessToken, log);
  }

  const durationMs = Date.now() - startTs;

  // --- Update record to posted ---
  if (supabase && postId) {
    await updateRecord(supabase, postId, {
      lifecycle_status:   'posted',
      posted_at:          new Date().toISOString(),
      creation_id:        creationId,
      published_media_id: publishedMediaId,
      response_stage:     'ok',
      error_message:      null,
      status_detail:      buildStatusDetail({
        requestId, startedAt, startTs, finalStage: 'ok',
        pollAttempts: poll.pollLog.length,
        pollElapsed:  poll.elapsed,
        permalink,
        preflight:    imgCheck,
      }),
    });
  }

  log.info(`SUCCESS — mediaId=${publishedMediaId} duration=${durationMs}ms`);

  // --- Stage: ok ---
  return res.status(200).json({
    ok:              true,
    stage:           'ok',
    postId,
    requestId,
    creationId,
    publishedMediaId,
    permalink,
    durationMs,
    debug,
  });
}
