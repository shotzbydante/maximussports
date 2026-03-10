/**
 * Frontend helpers for the social publishing workflow.
 *
 * All network calls go through the Vercel serverless routes, not directly to
 * Supabase, so no RLS config is required on the client side for writes.
 *
 * Functions:
 *   uploadAsset(base64, filename?)        → { url }
 *   publishToInstagram(payload)           → { postId, creationId, publishedMediaId, … }
 *   fetchPostHistory(filters?)            → { posts, total }
 */

// ── Upload ──────────────────────────────────────────────────────────────────

/**
 * Uploads a base64-encoded PNG to Supabase Storage via the backend.
 * Returns the permanent public URL.
 *
 * @param {string} base64     — data URI or raw base64 string
 * @param {string} [filename] — optional suggested filename
 * @returns {Promise<{ url: string, filename: string, sizeBytes: number }>}
 */
export async function uploadAsset(base64, filename) {
  let res;
  try {
    res = await fetch('/api/social/upload-asset', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ base64, filename }),
    });
  } catch {
    const err = new Error('Network error — could not reach the upload service.');
    err.stage = 'network';
    throw err;
  }

  const data = await res.json();

  if (!res.ok || !data.ok) {
    const stage = data.stage ?? 'upload';
    const raw   = data.error ?? 'Asset upload failed';

    const STAGE_HINTS = {
      supabase_init:  'Storage service is not configured in this environment.',
      bucket_config:  `Storage bucket '${data.bucket ?? 'social-assets'}' is not configured. Check Supabase Dashboard → Storage.`,
      bucket_missing: `Storage bucket '${data.bucket ?? 'social-assets'}' does not exist. Create it in Supabase Dashboard → Storage.`,
      storage_auth:   'Storage credentials are invalid or expired. Check SUPABASE_SERVICE_ROLE_KEY in Vercel.',
      size_limit:     'Image is too large for the storage bucket.',
    };

    const message = STAGE_HINTS[stage] ?? raw;
    const err = new Error(message);
    err.stage = stage;
    throw err;
  }

  return { url: data.url, filename: data.filename, sizeBytes: data.sizeBytes };
}

// ── Publish ──────────────────────────────────────────────────────────────────

/**
 * Publishes a post to Instagram via the production backend route.
 *
 * The backend creates the media container, polls for readiness, publishes,
 * and fetches the permalink — all in a single request. This can take up to
 * ~90 s while Instagram processes the image.
 *
 * @param {{
 *   imageUrl:              string,
 *   caption:               string,
 *   title?:                string,
 *   contentType?:          string,
 *   teamSlug?:             string,
 *   teamName?:             string,
 *   contentStudioSection?: string,
 *   generatedBy?:          string,
 *   templateType?:         string,
 * }} payload
 * @returns {Promise<{
 *   ok: true, postId: string, requestId: string,
 *   creationId: string, publishedMediaId: string,
 *   permalink: string|null, durationMs: number,
 * }>}
 */
export async function publishToInstagram(payload) {
  const { imageUrl, caption, ...metaFields } = payload;

  let res;
  try {
    res = await fetch('/api/social/instagram/publish', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        imageUrl,
        caption,
        metadata: metaFields,
      }),
    });
  } catch {
    const err = new Error('Network error — could not reach the Instagram publish service. Check your connection and retry.');
    err.stage = 'network';
    throw err;
  }

  const data = await res.json();

  if (!res.ok || !data.ok) {
    const err = new Error(
      data.error?.message ?? data.error ?? 'Instagram publish failed',
    );
    err.stage       = data.stage     ?? 'publish';
    err.code        = data.error?.code ?? null;
    err.postId      = data.postId    ?? null;
    err.requestId   = data.requestId ?? null;
    err.serverDebug = data.debug     ?? null;
    throw err;
  }

  return {
    ok:               true,
    postId:           data.postId,
    requestId:        data.requestId      ?? null,
    creationId:       data.creationId,
    publishedMediaId: data.publishedMediaId,
    permalink:        data.permalink       ?? null,
    durationMs:       data.durationMs      ?? null,
  };
}

// ── Post history ─────────────────────────────────────────────────────────────

/**
 * Fetches social post history from the backend.
 *
 * @param {{ platform?: string, status?: string, team?: string, limit?: number }} [filters]
 * @returns {Promise<{ posts: SocialPost[], total: number }>}
 */
export async function fetchPostHistory(filters = {}) {
  const params = new URLSearchParams();
  if (filters.platform) params.set('platform', filters.platform);
  if (filters.status)   params.set('status',   filters.status);
  if (filters.team)     params.set('team',      filters.team);
  if (filters.limit)    params.set('limit',     String(filters.limit));

  const qs  = params.toString();
  const url = `/api/social/posts${qs ? `?${qs}` : ''}`;

  let res;
  try {
    res = await fetch(url);
  } catch {
    const err = new Error('Network error — could not reach the post history service.');
    err.stage = 'network';
    throw err;
  }

  let data;
  try {
    data = await res.json();
  } catch {
    const err = new Error(`Post history fetch failed (HTTP ${res.status})`);
    err.stage = 'unknown';
    throw err;
  }

  if (!res.ok || !data.ok) {
    const stage   = data.stage ?? 'unknown';
    const message = stage === 'schema_missing'
      ? "Social posts storage is not initialized in Supabase. Run the social_posts migration."
      : data.error ?? `Post history fetch failed (HTTP ${res.status})`;

    const err = new Error(message);
    err.stage = stage;
    throw err;
  }

  return { posts: data.posts ?? [], total: data.total ?? 0 };
}
