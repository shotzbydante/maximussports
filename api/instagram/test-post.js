/**
 * Test publishing route for the upcoming Instagram integration.
 * POST /api/instagram/test-post
 *
 * Publishes a single image to the Maximus Sports Instagram account using
 * the Instagram Login API (graph.instagram.com) two-step media publish flow:
 *   Step 1 — Create a media container  → /media
 *   Step 2 — Publish the container     → /media_publish
 *
 * This is a backend-only test route. No frontend is wired to it yet.
 * GET requests return a simple probe response so the route is discoverable.
 *
 * Required env vars:
 *   INSTAGRAM_ACCOUNT_ID   — numeric Instagram user ID
 *   INSTAGRAM_ACCESS_TOKEN — valid Instagram Login API access token
 */

/**
 * Strips leading/trailing whitespace and wrapping quotes from an env value.
 * Returns an empty string for null/undefined so callers can safely use .length.
 */
function sanitizeEnv(value) {
  if (value == null) return '';
  let s = String(value).trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

/**
 * Extract a safe subset of a Meta API error object.
 * Never forward undocumented fields that might echo request data.
 */
function safeMetaError(raw) {
  const e = raw?.error ?? raw ?? {};
  return {
    message:    e.message    ?? 'Unknown error',
    type:       e.type       ?? null,
    code:       e.code       ?? null,
    fbtrace_id: e.fbtrace_id ?? null,
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // --- GET probe — lets callers confirm the route exists ---
  if (req.method === 'GET') {
    return res.status(200).json({
      ok: true,
      route: 'instagram test-post',
      method: 'POST required',
    });
  }

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
      error: 'Missing one or more required environment variables',
      envCheck,
    });
  }

  const accountId   = sanitizeEnv(process.env.INSTAGRAM_ACCOUNT_ID);
  const accessToken = sanitizeEnv(process.env.INSTAGRAM_ACCESS_TOKEN);

  // Safe debug metadata — never exposes the full token or secret
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
  const { imageUrl, caption } = req.body ?? {};

  if (!imageUrl || typeof imageUrl !== 'string' || imageUrl.trim() === '') {
    return res.status(400).json({
      ok: false,
      stage: 'validate',
      error: 'imageUrl is required and must be a non-empty string',
      debug,
    });
  }

  if (!caption || typeof caption !== 'string' || caption.trim() === '') {
    return res.status(400).json({
      ok: false,
      stage: 'validate',
      error: 'caption is required and must be a non-empty string',
      debug,
    });
  }

  // --- Stage: create_media ---
  // Step 1: create an unpublished media container
  const createEndpoint = `https://graph.instagram.com/v23.0/${accountId}/media`;
  const createBody = new URLSearchParams({
    image_url:    imageUrl.trim(),
    caption:      caption.trim(),
    access_token: accessToken,
  });

  let creationId;
  try {
    const createRes  = await fetch(createEndpoint, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    createBody.toString(),
    });
    const createData = await createRes.json();

    if (!createRes.ok || createData.error) {
      return res.status(502).json({
        ok:    false,
        stage: 'create_media',
        debug,
        error: safeMetaError(createData),
      });
    }

    // Meta returns the container identifier as `id` on this endpoint
    creationId = createData.id ?? createData.creation_id ?? null;

    if (!creationId) {
      return res.status(502).json({
        ok:    false,
        stage: 'create_media',
        debug,
        error: {
          message:    'Media container created but no id or creation_id returned',
          type:       null,
          code:       null,
          fbtrace_id: null,
        },
        rawKeys: Object.keys(createData),
      });
    }
  } catch (err) {
    return res.status(500).json({
      ok:    false,
      stage: 'create_media',
      debug,
      error: {
        message:    err.message ?? 'Network error during media container creation',
        type:       null,
        code:       null,
        fbtrace_id: null,
      },
    });
  }

  // --- Stage: publish_media ---
  // Step 2: publish the container
  const publishEndpoint = `https://graph.instagram.com/v23.0/${accountId}/media_publish`;
  const publishBody = new URLSearchParams({
    creation_id:  creationId,
    access_token: accessToken,
  });

  let publishedMediaId;
  try {
    const publishRes  = await fetch(publishEndpoint, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    publishBody.toString(),
    });
    const publishData = await publishRes.json();

    if (!publishRes.ok || publishData.error) {
      return res.status(502).json({
        ok:         false,
        stage:      'publish_media',
        creationId,
        debug,
        error:      safeMetaError(publishData),
      });
    }

    publishedMediaId = publishData.id ?? null;
  } catch (err) {
    return res.status(500).json({
      ok:         false,
      stage:      'publish_media',
      creationId,
      debug,
      error: {
        message:    err.message ?? 'Network error during media publish',
        type:       null,
        code:       null,
        fbtrace_id: null,
      },
    });
  }

  // --- Stage: ok ---
  return res.status(200).json({
    ok:              true,
    stage:           'ok',
    creationId,
    publishedMediaId,
    debug,
  });
}
