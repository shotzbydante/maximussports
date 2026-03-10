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

let _bucketVerified = false;

/**
 * Verify the storage bucket exists; auto-create it when missing.
 * Caches the result so subsequent requests in the same cold-start skip the check.
 */
async function ensureBucket(supabase) {
  if (_bucketVerified) return;

  const { error } = await supabase.storage.getBucket(BUCKET);

  if (!error) {
    _bucketVerified = true;
    return;
  }

  if (/not\s*found/i.test(error.message ?? '')) {
    const { error: createErr } = await supabase.storage.createBucket(BUCKET, {
      public: true,
      fileSizeLimit: MAX_BYTES,
    });

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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

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
  const filename = suggestedFilename
    ? `${ts}_${rand}_${suggestedFilename.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    : `${ts}_${rand}_slide.png`;

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
    const stage = err.code === 'AUTH_ERROR' ? 'storage_auth' : 'bucket_config';
    return res.status(502).json({
      ok: false,
      stage,
      error: err.message,
      bucket: BUCKET,
    });
  }

  // --- Upload to Supabase Storage ---
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(filename, buffer, {
      contentType: 'image/png',
      upsert:      false,
      cacheControl: '31536000',
    });

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

    return res.status(502).json({
      ok:    false,
      stage,
      error: detail,
      bucket: BUCKET,
    });
  }

  // Get the permanent public URL
  const { data: { publicUrl } } = supabase.storage
    .from(BUCKET)
    .getPublicUrl(filename);

  return res.status(200).json({
    ok:       true,
    url:      publicUrl,
    filename,
    sizeBytes: buffer.byteLength,
  });
}
