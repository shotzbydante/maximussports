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

  // Strip data URI prefix if present: "data:image/png;base64,<actual-base64>"
  const raw = base64.includes(',') ? base64.split(',')[1] : base64;

  if (!raw || raw.trim() === '') {
    return res.status(400).json({
      ok: false,
      stage: 'validate',
      error: 'base64 value is empty after stripping data URI prefix',
    });
  }

  // Decode to Buffer and size-check
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

  // Build a unique, safe filename
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  const filename = suggestedFilename
    ? `${ts}_${rand}_${suggestedFilename.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    : `${ts}_${rand}_slide.png`;

  // --- Upload to Supabase Storage ---
  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch (err) {
    return res.status(500).json({
      ok: false,
      stage: 'supabase_init',
      error: err.message ?? 'Supabase admin client unavailable',
    });
  }

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(filename, buffer, {
      contentType: 'image/png',
      upsert:      false,
      cacheControl: '31536000', // 1 year — assets are immutable snapshots
    });

  if (uploadError) {
    return res.status(502).json({
      ok:    false,
      stage: 'storage_upload',
      error: uploadError.message ?? 'Storage upload failed',
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
