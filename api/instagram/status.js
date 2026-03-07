/**
 * Backend verification endpoint for the upcoming Instagram publishing integration.
 * GET /api/instagram/status
 *
 * Intended to be tested manually before building any publish UI. Confirms that:
 *   1. All required Meta/Instagram environment variables are present in Vercel
 *   2. The configured Instagram account ID is reachable via the Graph API
 *   3. The access token is valid and authorised for the account
 *
 * Uses the Meta Graph API (graph.facebook.com) — NOT the Basic Display API
 * (graph.instagram.com). Professional/business Instagram accounts must be
 * verified via the Facebook Graph API using a system user or page access token.
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
    endpointUsed:             `https://graph.facebook.com/v23.0/{INSTAGRAM_ACCOUNT_ID}`,
    deploymentEnv:            process.env.VERCEL_ENV ?? null,
    vercelUrl:                process.env.VERCEL_URL ?? null,
  };

  // --- Stage 2: Meta Graph API verification (professional account) ---
  const endpoint = `https://graph.facebook.com/v23.0/${accountId}?fields=id,username,account_type&access_token=${accessToken}`;

  let data;
  try {
    const response = await fetch(endpoint);
    data = await response.json();

    if (!response.ok || data.error) {
      const metaError = data.error ?? data;
      const { access_token: _stripped, ...safeError } = metaError;

      // Hint for code 190 (invalid/unparseable token)
      const likelyFormatIssue =
        safeError.code === 190 &&
        (debug.tokenHasWhitespace || debug.tokenHasNewline || debug.tokenLength < 20);

      return res.status(502).json({
        ok: false,
        stage: 'instagram_api',
        envCheck,
        debug,
        error: safeError,
        ...(likelyFormatIssue && {
          hint: 'Token may contain hidden whitespace, quotes, or stale deployment value',
        }),
      });
    }
  } catch (err) {
    return res.status(500).json({
      ok: false,
      stage: 'fetch',
      envCheck,
      debug,
      error: err.message ?? 'Network error contacting Meta API',
    });
  }

  return res.status(200).json({
    ok: true,
    envCheck,
    debug,
    instagram: data,
  });
}
