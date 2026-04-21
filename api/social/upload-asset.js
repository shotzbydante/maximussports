/**
 * POST /api/social/upload-asset
 *
 * Accepts a base64-encoded PNG from the Content Studio (produced by html-to-image),
 * uploads it to the Supabase Storage `social-assets` bucket, and returns a
 * permanent public HTTPS URL that can be passed to the Instagram Graph API.
 *
 * The bucket must be marked PUBLIC in Supabase so Instagram can fetch the image
 * server-to-server. See docs/social-posts-migration.sql for setup instructions.
 *
 * If the bucket does not yet exist the handler will attempt to auto-create it
 * (service-role key has the required permission). When auto-creation is not
 * possible a clear actionable error is returned.
 *
 * Request body (JSON):
 *   base64    {string}  — data URI ("data:image/png;base64,…") or raw base64 string
 *   filename  {string}  — suggested filename (optional, auto-generated if omitted)
 *
 * Response:
 *   { ok: true, url: string, filename: string }
 *   { ok: false, stage: string, error: string }
 */

import { getSupabaseAdmin } from '../_lib/supabaseAdmin.js';

const BUCKET = 'social-assets';
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB — Instagram's image size limit
const SUPABASE_OP_TIMEOUT_MS = 25000; // per Supabase operation — well under the 120s function timeout

let _bucketVerified = false;

/**
 * Wrap a promise with a timeout so a hung Supabase operation surfaces as a
 * structured 502 → 'storage_upload_timeout' instead of killing the whole
 * function and returning raw HTML ("Bad Gateway").
 */
function withTimeout(promise, ms, opName) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => {
      const e = new Error(`${opName} timed out after ${ms}ms`);
      e.code = 'OPERATION_TIMEOUT';
      reject(e);
    }, ms)),
  ]);
}

/**
 * Verify the storage bucket exists; auto-create it when missing.
 * Caches the result so subsequent requests in the same cold-start skip the check.
 */
async function ensureBucket(supabase) {
  if (_bucketVerified) return;

  const { error } = await withTimeout(
    supabase.storage.getBucket(BUCKET),
    SUPABASE_OP_TIMEOUT_MS,
    'storage.getBucket'
  );

  if (!error) {
    _bucketVerified = true;
    return;
  }

  if (/not\s*found/i.test(error.message ?? '')) {
    const { error: createErr } = await withTimeout(
      supabase.storage.createBucket(BUCKET, {
        public: true,
        fileSizeLimit: MAX_BYTES,
      }),
      SUPABASE_OP_TIMEOUT_MS,
      'storage.createBucket'
    );

    if (createErr) {
      const e = new Error(
        `Storage bucket '${BUCKET}' does not exist and auto-creation failed: ${createErr.message}. ` +
        `Create the bucket manually in Supabase Dashboard → Storage, or run docs/social-posts-migration.sql.`
      );
      e.code = 'BUCKET_CREATION_FAILED';
      throw e;
    }

    console.log(`[upload-asset] Auto-created public storage bucket '${BUCKET}'`);
    _bucketVerified = true;
    return;
  }

  const e = new Error(
    `Cannot verify storage bucket '${BUCKET}': ${error.message}. ` +
    `Check that SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are configured correctly.`
  );
  e.code = /unauthorized|forbidden|jwt|invalid.*key/i.test(error.message ?? '')
    ? 'AUTH_ERROR'
    : 'BUCKET_CHECK_FAILED';
  throw e;
}

async function handlerImpl(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const reqStartMs = Date.now();
  const approxBase64Length = typeof req.body?.base64 === 'string' ? req.body.base64.length : 0;
  console.log('[UPLOAD_ASSET_START]', {
    hasBody: !!req.body,
    base64Length: approxBase64Length,
    approxBytes: Math.round((approxBase64Length * 3) / 4),
    filenameHint: req.body?.filename ?? null,
  });

  // --- Validate body ---
  const { base64, filename: suggestedFilename } = req.body ?? {};

  if (!base64 || typeof base64 !== 'string') {
    return res.status(400).json({
      ok: false,
      stage: 'validate',
      error: 'base64 field is required and must be a string',
    });
  }

  const raw = base64.includes(',') ? base64.split(',')[1] : base64;

  if (!raw || raw.trim() === '') {
    return res.status(400).json({
      ok: false,
      stage: 'validate',
      error: 'base64 value is empty after stripping data URI prefix',
    });
  }

  let buffer;
  try {
    buffer = Buffer.from(raw, 'base64');
  } catch {
    return res.status(400).json({
      ok: false,
      stage: 'decode',
      error: 'Failed to decode base64 string',
    });
  }

  if (buffer.byteLength > MAX_BYTES) {
    return res.status(413).json({
      ok: false,
      stage: 'validate',
      error: `Image exceeds maximum allowed size of ${MAX_BYTES / 1024 / 1024} MB`,
      sizeBytes: buffer.byteLength,
    });
  }

  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  const sanitized = suggestedFilename
    ? suggestedFilename.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/\.(png|jpe?g)$/i, '')
    : '';
  const base = sanitized ? `${ts}_${rand}_${sanitized}` : `${ts}_${rand}`;
  const filename = `${base}.png`;

  // --- Init Supabase ---
  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch (err) {
    return res.status(500).json({
      ok: false,
      stage: 'supabase_init',
      error: `Supabase admin client unavailable: ${err.message}. ` +
             'Ensure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in Vercel environment variables.',
    });
  }

  // --- Ensure bucket exists (auto-create if missing) ---
  try {
    await ensureBucket(supabase);
  } catch (err) {
    let stage = 'bucket_config';
    if (err.code === 'AUTH_ERROR') stage = 'storage_auth';
    else if (err.code === 'OPERATION_TIMEOUT') stage = 'bucket_check_timeout';
    console.error('[UPLOAD_ASSET_BUCKET_FAIL]', {
      stage,
      code: err.code,
      message: err.message,
      elapsedMs: Date.now() - reqStartMs,
    });
    return res.status(502).json({
      ok: false,
      stage,
      step: stage, // back-compat alias
      error: err.message,
      bucket: BUCKET,
    });
  }

  // --- Upload to Supabase Storage (wrapped with explicit timeout) ---
  let uploadResult;
  try {
    uploadResult = await withTimeout(
      supabase.storage.from(BUCKET).upload(filename, buffer, {
        contentType: 'image/png',
        upsert:      false,
        cacheControl: '31536000',
      }),
      SUPABASE_OP_TIMEOUT_MS,
      'storage.upload'
    );
  } catch (timeoutErr) {
    console.error('[UPLOAD_ASSET_UPLOAD_TIMEOUT]', {
      message: timeoutErr.message,
      elapsedMs: Date.now() - reqStartMs,
      sizeBytes: buffer.byteLength,
    });
    return res.status(504).json({
      ok: false,
      stage: 'storage_upload_timeout',
      step:  'storage_upload_timeout',
      error: timeoutErr.message,
      bucket: BUCKET,
    });
  }

  const { error: uploadError } = uploadResult ?? {};

  if (uploadError) {
    const detail = uploadError.message ?? 'Storage upload failed';
    let stage = 'storage_upload';

    if (/not\s*found|bucket/i.test(detail)) {
      _bucketVerified = false;
      stage = 'bucket_missing';
    } else if (/unauthorized|forbidden|jwt|invalid.*key/i.test(detail)) {
      stage = 'storage_auth';
    } else if (/size|too large|limit/i.test(detail)) {
      stage = 'size_limit';
    }

    console.error('[UPLOAD_ASSET_UPLOAD_FAIL]', {
      stage,
      message: detail,
      elapsedMs: Date.now() - reqStartMs,
    });

    return res.status(502).json({
      ok:    false,
      stage,
      step:  stage,
      error: detail,
      bucket: BUCKET,
    });
  }

  // Get the permanent public URL
  const { data: { publicUrl } } = supabase.storage
    .from(BUCKET)
    .getPublicUrl(filename);

  console.log('[UPLOAD_ASSET_SUCCESS]', {
    filename,
    sizeBytes: buffer.byteLength,
    elapsedMs: Date.now() - reqStartMs,
  });

  return res.status(200).json({
    ok:       true,
    url:      publicUrl,
    filename,
    sizeBytes: buffer.byteLength,
    elapsedMs: Date.now() - reqStartMs,
  });
}

/**
 * Outer handler wraps handlerImpl in a last-resort try/catch so any
 * uncaught exception or timeout surfaces as structured JSON ({ ok: false,
 * stage, error }) — NEVER as Vercel's raw HTML 502 response that the
 * client cannot parse. This is what surfaced to users as the opaque
 * "Upload failed: Bad Gateway" before this fix.
 */
export default async function handler(req, res) {
  try {
    return await handlerImpl(req, res);
  } catch (err) {
    console.error('[UPLOAD_ASSET_UNCAUGHT]', {
      name: err?.name,
      message: err?.message,
      stack: err?.stack?.split('\n').slice(0, 4).join('\n'),
    });
    if (res.headersSent) return;
    return res.status(500).json({
      ok:    false,
      stage: 'unknown',
      step:  'unknown',
      error: err?.message || 'Unknown upload handler error',
    });
  }
}
