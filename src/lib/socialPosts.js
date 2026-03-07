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
  const res = await fetch('/api/social/upload-asset', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ base64, filename }),
  });

  const data = await res.json();

  if (!res.ok || !data.ok) {
    const err = new Error(data.error ?? 'Asset upload failed');
    err.stage = data.stage ?? 'upload';
    throw err;
  }

  return { url: data.url, filename: data.filename, sizeBytes: data.sizeBytes };
}

// ── Publish ──────────────────────────────────────────────────────────────────

/**
 * Publishes a post to Instagram via the production backend route.
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
 * @returns {Promise<{ ok: true, postId: string, creationId: string, publishedMediaId: string }>}
 */
export async function publishToInstagram(payload) {
  const { imageUrl, caption, ...metaFields } = payload;

  const res = await fetch('/api/social/instagram/publish', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      imageUrl,
      caption,
      metadata: metaFields,
    }),
  });

  const data = await res.json();

  if (!res.ok || !data.ok) {
    const err = new Error(
      data.error?.message ?? data.error ?? 'Instagram publish failed',
    );
    err.stage       = data.stage  ?? 'publish';
    err.code        = data.error?.code ?? null;
    err.postId      = data.postId ?? null;
    err.serverDebug = data.debug  ?? null;
    throw err;
  }

  return {
    ok:              true,
    postId:          data.postId,
    creationId:      data.creationId,
    publishedMediaId: data.publishedMediaId,
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
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Post history fetch failed: ${res.status}`);
  }

  const data = await res.json();
  return { posts: data.posts ?? [], total: data.total ?? 0 };
}
