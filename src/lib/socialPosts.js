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
 * Parse a Response body, tolerating non-JSON (e.g. HTML from a Vercel 502
 * or plain-text proxy error). Returns { ok, data, text, isJson }.
 *
 * This is critical because Vercel function timeouts / crashes / request-
 * too-large responses come back as HTML, not JSON — and calling res.json()
 * on that throws a SyntaxError, destroying the step context we need for
 * actionable error messages.
 */
async function safeParseResponse(res) {
  const text = await res.text();
  if (!text) return { ok: res.ok, data: null, text: '', isJson: false };
  try {
    return { ok: res.ok, data: JSON.parse(text), text, isJson: true };
  } catch {
    return { ok: res.ok, data: null, text, isJson: false };
  }
}

/**
 * Translate an HTTP status + non-JSON body into an actionable step-specific
 * error. This fires when the server returns raw HTML (Vercel 502 / 504 /
 * 413) instead of our structured JSON error.
 */
function httpStatusToStep(status, operation) {
  if (status === 413) return { step: 'payload_too_large', message: `Image is too large for the upload endpoint (HTTP 413). Try again with a smaller slide.` };
  if (status === 502) return { step: 'gateway_timeout',  message: `Server timed out during ${operation} (HTTP 502 Bad Gateway). The upload service took too long to respond. Retry in a moment.` };
  if (status === 504) return { step: 'function_timeout', message: `Upload function timed out (HTTP 504). Retry in a moment.` };
  if (status === 503) return { step: 'service_unavailable', message: `Upload service is temporarily unavailable (HTTP 503). Retry in a moment.` };
  if (status >= 500) return { step: 'server_error',     message: `Server error during ${operation} (HTTP ${status}). Retry in a moment.` };
  if (status === 408) return { step: 'request_timeout', message: `Request timed out (HTTP 408). Retry in a moment.` };
  if (status === 401 || status === 403) return { step: 'auth_error', message: `Upload was not authorized (HTTP ${status}).` };
  return { step: 'http_error', message: `${operation} failed (HTTP ${status}).` };
}

/**
 * Transient failures that are safe to retry idempotently.
 * Upload to Supabase Storage is idempotent because we use a unique filename
 * per request (timestamp + random suffix), so a retried upload just produces
 * a new object — never duplicates an existing post.
 */
function isTransientUploadStep(step) {
  return (
    step === 'network'
    || step === 'gateway_timeout'
    || step === 'function_timeout'
    || step === 'service_unavailable'
    || step === 'request_timeout'
    || step === 'server_error'
    || step === 'storage_upload'
    || step === 'bucket_config'
  );
}

/**
 * Validate the upload-asset response contract: must return an absolute
 * https URL we can hand to Instagram. Catches contract drift between
 * uploader and consumer (e.g. server returning storage path instead of
 * publicUrl, or returning a tokenized signed URL when public was expected).
 */
function validateUploadResponse(data) {
  if (!data || typeof data !== 'object') {
    throw new Error('Upload response was not an object');
  }
  const url = data.url ?? data.publicUrl ?? null;
  if (!url || typeof url !== 'string') {
    throw new Error('Upload succeeded but no valid public image URL was returned');
  }
  if (!/^https:\/\//i.test(url)) {
    throw new Error(`Upload returned a non-https URL: ${url.slice(0, 100)}`);
  }
  if (/^https?:\/\/(localhost|127\.|0\.0\.0\.0)/i.test(url)) {
    throw new Error('Upload returned a localhost URL — Instagram cannot reach private hostnames');
  }
  return url;
}

async function uploadAssetOnce(base64, filename) {
  let res;
  try {
    res = await fetch('/api/social/upload-asset', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ base64, filename }),
    });
  } catch (fetchErr) {
    const err = new Error('Network error — could not reach the upload service. Check your connection and retry.');
    err.stage = 'network';
    err.httpStatus = 0;
    err.cause = fetchErr;
    throw err;
  }

  const parsed = await safeParseResponse(res);

  // Non-JSON response (Vercel 502 HTML, proxy error, etc.) OR JSON with ok:false
  if (!parsed.isJson) {
    const { step, message } = httpStatusToStep(res.status, 'image upload');
    const err = new Error(message);
    err.stage = step;
    err.httpStatus = res.status;
    err.rawBody = parsed.text.slice(0, 200);
    throw err;
  }

  const data = parsed.data;

  if (!res.ok || !data.ok) {
    const stage = data.stage ?? 'upload';
    const raw   = data.error ?? 'Asset upload failed';

    const STAGE_HINTS = {
      supabase_init:  'Storage service is not configured in this environment.',
      bucket_config:  `Storage bucket '${data.bucket ?? 'social-assets'}' is not configured. Check Supabase Dashboard → Storage.`,
      bucket_missing: `Storage bucket '${data.bucket ?? 'social-assets'}' does not exist. Create it in Supabase Dashboard → Storage.`,
      storage_auth:   'Storage credentials are invalid or expired. Check SUPABASE_SERVICE_ROLE_KEY in Vercel.',
      size_limit:     'Image is too large for the storage bucket.',
      storage_upload: `Image upload to storage failed: ${raw}. Retry in a moment.`,
    };

    const message = STAGE_HINTS[stage] ?? raw;
    const err = new Error(message);
    err.stage = stage;
    err.httpStatus = res.status;
    throw err;
  }

  // Validate response contract — single source of truth for what a "good
  // upload" looks like. Catches storage-bucket misconfig / signed URL
  // drift / non-https paths before they ever reach a publish endpoint.
  let publicUrl;
  try {
    publicUrl = validateUploadResponse(data);
  } catch (validateErr) {
    const err = new Error(validateErr.message);
    err.stage = 'upload_contract';
    err.httpStatus = res.status;
    throw err;
  }

  console.log('[TEAM_INTEL_ASSET_UPLOADED]', {
    filename: data.filename,
    publicUrl,
    urlLength: publicUrl?.length || 0,
    sizeBytes: data.sizeBytes,
  });

  return { url: publicUrl, filename: data.filename, sizeBytes: data.sizeBytes };
}

/**
 * Uploads a base64-encoded PNG to Supabase Storage via the backend.
 * Returns the permanent public URL.
 *
 * Automatically retries transient failures (gateway timeout, server error,
 * transient storage failure) with exponential backoff. Uses a unique
 * filename per attempt, so retries are idempotent — never duplicate uploads.
 *
 * @param {string} base64     — data URI or raw base64 string
 * @param {string} [filename] — optional suggested filename
 * @param {{ maxAttempts?: number }} [opts]
 * @returns {Promise<{ url: string, filename: string, sizeBytes: number }>}
 */
export async function uploadAsset(base64, filename, opts = {}) {
  const approxBytes = base64 ? Math.round((base64.length * 3) / 4) : 0;
  console.log('[CLIENT_PUBLISH_PAYLOAD]', {
    endpoint: '/api/social/upload-asset',
    filename,
    approxBytes,
    approxKB: Math.round(approxBytes / 1024),
    approxMB: (approxBytes / (1024 * 1024)).toFixed(2),
  });

  const maxAttempts = opts.maxAttempts ?? 3;
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // Vary the filename suffix across attempts so each attempt writes to
      // a distinct object in the bucket (prevents any conflict if a previous
      // attempt partially succeeded on the server).
      const attemptFilename = attempt === 1
        ? filename
        : (filename ? filename.replace(/(\.(png|jpe?g))?$/i, `_r${attempt}$1`) : undefined);

      const result = await uploadAssetOnce(base64, attemptFilename);
      if (attempt > 1) {
        console.log('[UPLOAD_RETRY_SUCCESS]', { attempt, filename: attemptFilename });
      }
      return result;
    } catch (err) {
      lastErr = err;
      const retryable = isTransientUploadStep(err.stage);
      console.warn('[UPLOAD_ATTEMPT_FAILED]', {
        attempt,
        maxAttempts,
        stage: err.stage,
        httpStatus: err.httpStatus ?? null,
        retryable,
        message: err.message,
      });
      if (!retryable || attempt === maxAttempts) break;
      // Exponential backoff: 400ms, 1200ms, ...
      const backoffMs = 400 * Math.pow(3, attempt - 1);
      await new Promise(r => setTimeout(r, backoffMs));
    }
  }
  throw lastErr;
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

  // ── Client-side safety net — same threshold as carousel + server-side. ──
  if (!caption || typeof caption !== 'string' || caption.trim().length < 80) {
    const err = new Error(`Caption is too short (${caption?.length ?? 0} chars). A legitimate caption is at least 80 chars. Refresh and regenerate before publishing.`);
    err.stage = 'validation';
    throw err;
  }

  console.log('[CAPTION_SENT_TO_META]', {
    length: caption.length,
    preview: caption.slice(0, 200),
    section: metaFields?.contentStudioSection,
  });

  console.log('[CLIENT_SINGLE_PUBLISH_PAYLOAD]', {
    imageUrl,
    captionLength: caption.length,
    preview: caption.slice(0, 120),
    section: metaFields?.contentStudioSection,
  });

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
  } catch (fetchErr) {
    const err = new Error('Network error — could not reach the Instagram publish service. Check your connection and retry.');
    err.stage = 'network';
    err.httpStatus = 0;
    err.cause = fetchErr;
    throw err;
  }

  const parsed = await safeParseResponse(res);

  // Non-JSON response → Vercel/proxy error. Surface it as a step-specific
  // failure instead of crashing on res.json().
  if (!parsed.isJson) {
    const { step, message } = httpStatusToStep(res.status, 'Instagram publish');
    const err = new Error(message);
    err.stage = step;
    err.httpStatus = res.status;
    err.rawBody = parsed.text.slice(0, 200);
    throw err;
  }

  const data = parsed.data;

  if (!res.ok || !data.ok) {
    const errData = data.error ?? {};
    // Server may surface a `step` field (preferred) for fine-grained
    // failure context, in addition to `stage`. Step lets the client
    // pick a more actionable user message than stage alone.
    const err = new Error(
      typeof data.error === 'string' ? data.error
        : errData.userMessage ?? errData.message ?? data.error ?? 'Instagram publish failed',
    );
    err.stage       = data.stage          ?? 'publish';
    err.step        = data.step           ?? null;
    err.code        = errData.code        ?? null;
    err.category    = errData.category    ?? null;
    err.postId      = data.postId         ?? null;
    err.requestId   = data.requestId      ?? null;
    err.serverDebug = data.debug          ?? null;
    err.httpStatus  = res.status;
    err.imageUrl    = data.imageUrl       ?? null;
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

// ── Carousel Publish ────────────────────────────────────────────────────────

/**
 * Publishes a carousel (multi-image) post to Instagram via the backend.
 *
 * @param {{
 *   imageUrls:             string[],
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
 *   publishedMediaId: string, permalink: string|null, durationMs: number,
 * }>}
 */
export async function publishCarouselToInstagram(payload) {
  const { imageUrls, caption, ...metaFields } = payload;

  // ── Client-side safety net — reject obviously blank captions before
  //    round-tripping to the server. Same threshold as server-side guard.
  if (!caption || typeof caption !== 'string' || caption.trim().length < 80) {
    const err = new Error(`Caption is too short (${caption?.length ?? 0} chars). A legitimate caption is at least 80 chars. Refresh and regenerate before publishing.`);
    err.stage = 'validation';
    throw err;
  }

  console.log('[CAPTION_SENT_TO_META]', {
    length: caption.length,
    preview: caption.slice(0, 200),
    imageCount: imageUrls?.length,
    section: metaFields?.contentStudioSection,
  });

  let res;
  try {
    res = await fetch('/api/social/instagram/publish-carousel', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        imageUrls,
        caption,
        metadata: metaFields,
      }),
    });
  } catch (fetchErr) {
    const err = new Error('Network error — could not reach the Instagram carousel publish service.');
    err.stage = 'network';
    err.httpStatus = 0;
    err.cause = fetchErr;
    throw err;
  }

  const parsed = await safeParseResponse(res);

  if (!parsed.isJson) {
    const { step, message } = httpStatusToStep(res.status, 'Instagram carousel publish');
    const err = new Error(message);
    err.stage = step;
    err.httpStatus = res.status;
    err.rawBody = parsed.text.slice(0, 200);
    throw err;
  }

  const data = parsed.data;

  if (!res.ok || !data.ok) {
    const errData = data.error ?? {};
    const err = new Error(
      errData.userMessage ?? errData.message ?? data.error ?? 'Instagram carousel publish failed',
    );
    err.stage       = data.stage          ?? 'publish';
    err.code        = errData.code        ?? null;
    err.category    = errData.category    ?? null;
    err.postId      = data.postId         ?? null;
    err.requestId   = data.requestId      ?? null;
    err.serverDebug = data.debug          ?? null;
    err.httpStatus  = res.status;
    throw err;
  }

  return {
    ok:               true,
    postId:           data.postId,
    requestId:        data.requestId      ?? null,
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
