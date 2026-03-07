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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  // --- Stage 1: env validation ---
  const envCheck = {
    META_APP_ID:           !!process.env.META_APP_ID,
    META_APP_SECRET:       !!process.env.META_APP_SECRET,
    INSTAGRAM_ACCOUNT_ID:  !!process.env.INSTAGRAM_ACCOUNT_ID,
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

  // --- Stage 2: Meta Graph API verification (professional account) ---
  const accountId   = process.env.INSTAGRAM_ACCOUNT_ID;
  const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;
  const endpoint = `https://graph.facebook.com/v23.0/${accountId}?fields=id,username,account_type&access_token=${accessToken}`;

  let data;
  try {
    const response = await fetch(endpoint);
    data = await response.json();

    if (!response.ok || data.error) {
      // Return Meta's error payload but strip any token echo that may appear
      const { access_token: _stripped, ...safeError } = data.error ?? data;
      return res.status(502).json({
        ok: false,
        stage: 'instagram_api',
        endpointUsed: `https://graph.facebook.com/v23.0/{INSTAGRAM_ACCOUNT_ID}`,
        instagramAccountIdPresent: !!accountId,
        envCheck,
        error: safeError,
      });
    }
  } catch (err) {
    return res.status(500).json({
      ok: false,
      stage: 'fetch',
      endpointUsed: `https://graph.facebook.com/v23.0/{INSTAGRAM_ACCOUNT_ID}`,
      instagramAccountIdPresent: !!accountId,
      envCheck,
      error: err.message ?? 'Network error contacting Meta API',
    });
  }

  return res.status(200).json({
    ok: true,
    envCheck,
    instagram: data,
  });
}
