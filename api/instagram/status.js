/**
 * Backend verification endpoint for the upcoming Instagram publishing integration.
 * GET /api/instagram/status
 *
 * Intended to be tested manually before building any publish UI. Confirms that:
 *   1. All required Meta/Instagram environment variables are present in Vercel
 *   2. The access token is valid via the Instagram Login API (/me endpoint)
 *   3. The token's user_id matches the stored INSTAGRAM_ACCOUNT_ID
 *
 * Uses the Instagram Login API host (graph.instagram.com) — suitable for
 * Instagram User tokens obtained via the Instagram Login flow. If you are using
 * a Facebook Page / System User token you should use graph.facebook.com instead.
 *
 * This route does NOT post content — it is read-only and production-safe.
 */

/**
 * Strips leading/trailing whitespace and wrapping quotes from an env value.
 * Returns an empty string for null/undefined so callers can safely use .length.
 */
function sanitizeEnv(value) {
  if (value == null) return '';
  let s = String(value).trim();
  // Remove a single layer of matching wrapping quotes (single or double)
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  // --- Stage 1: env validation (raw presence check before sanitization) ---
  const envCheck = {
    META_APP_ID:            !!process.env.META_APP_ID,
    META_APP_SECRET:        !!process.env.META_APP_SECRET,
    INSTAGRAM_ACCOUNT_ID:   !!process.env.INSTAGRAM_ACCOUNT_ID,
    INSTAGRAM_ACCESS_TOKEN: !!process.env.INSTAGRAM_ACCESS_TOKEN,
  };

  const allPresent = Object.values(envCheck).every(Boolean);

  if (!allPresent) {
    return res.status(500).json({
      ok: false,
      stage: 'env',
      error: 'Missing one or more required environment variables',
      envCheck,
    });
  }

  // --- Sanitize all env values before use ---
  const accountId   = sanitizeEnv(process.env.INSTAGRAM_ACCOUNT_ID);
  const accessToken = sanitizeEnv(process.env.INSTAGRAM_ACCESS_TOKEN);
  // sanitized but not used in the request; kept for future auth header use
  sanitizeEnv(process.env.META_APP_ID);
  sanitizeEnv(process.env.META_APP_SECRET);

  // --- Build safe debug metadata (never exposes full token or secret) ---
  const debug = {
    tokenLength:              accessToken.length,
    tokenPrefix:              accessToken.slice(0, 8),
    tokenHasWhitespace:       /\s/.test(accessToken),
    tokenHasNewline:          /[\r\n]/.test(accessToken),
    instagramAccountIdLength: accountId.length,
    endpointUsed:             'https://graph.instagram.com/v23.0/me?fields=user_id,username',
    deploymentEnv:            process.env.VERCEL_ENV ?? null,
    vercelUrl:                process.env.VERCEL_URL ?? null,
    tokenHostFamily:          'instagram_login_candidate',
  };

  // --- Stage 2: Instagram Login API token verification ---
  const endpoint = `https://graph.instagram.com/v23.0/me?fields=user_id,username&access_token=${encodeURIComponent(accessToken)}`;

  let data;
  try {
    const response = await fetch(endpoint);
    data = await response.json();

    if (!response.ok || data.error) {
      const metaError = data.error ?? data;
      const { access_token: _stripped, ...safeError } = metaError;

      // Code 190: token is invalid or cannot be parsed by this endpoint.
      // This can happen when the token was issued by a different Meta auth flow
      // (e.g. Facebook Page / System User token sent to graph.instagram.com).
      const isCode190 = safeError.code === 190;
      const likelyFormatIssue =
        isCode190 && (debug.tokenHasWhitespace || debug.tokenHasNewline || debug.tokenLength < 20);

      return res.status(502).json({
        ok: false,
        stage: 'instagram_api',
        envCheck,
        debug,
        error: safeError,
        ...(likelyFormatIssue && {
          hint: 'Token may contain hidden whitespace, quotes, or stale deployment value',
        }),
        ...(isCode190 && !likelyFormatIssue && {
          hint: 'Token may belong to a different Meta auth flow (e.g. Facebook Page or System User token) that is not accepted by the Instagram Login API host',
        }),
      });
    }
  } catch (err) {
    return res.status(500).json({
      ok: false,
      stage: 'fetch',
      envCheck,
      debug,
      error: err.message ?? 'Network error contacting Instagram API',
    });
  }

  // --- Stage 3: compare API-returned user_id against stored account ID ---
  const apiUserId  = String(data.user_id ?? '');
  const idsMatch   = apiUserId !== '' && apiUserId === accountId;

  return res.status(200).json({
    ok: true,
    stage: 'ok',
    envCheck,
    debug,
    username:                data.username ?? null,
    apiUserId:               apiUserId || null,
    storedInstagramAccountId: accountId,
    idsMatch,
    ...(!idsMatch && {
      warning: 'Token is valid but the user_id returned by the API does not match the stored INSTAGRAM_ACCOUNT_ID — publishing may target a different account',
    }),
  });
}
