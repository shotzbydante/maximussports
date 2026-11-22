/**
 * GET /api/instagram/status
 *
 * Read-only health check for the Instagram publishing connection. Confirms:
 *   1. the required environment variables are present
 *   2. the access token is accepted by the Instagram Login API (/me)
 *   3. the token belongs to the configured INSTAGRAM_ACCOUNT_ID
 * and reports when the token expires, if we refreshed it ourselves.
 *
 * Admin or cron only. It never returns any part of the token.
 */

import { requireAdminOrCron } from '../_lib/requireAuth.js';
import { getInstagramCredentials, describeInstagramError } from '../_lib/instagramAuth.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' });
  if (!(await requireAdminOrCron(req, res))) return;

  const envCheck = {
    META_APP_ID: !!process.env.META_APP_ID,
    META_APP_SECRET: !!process.env.META_APP_SECRET,
    INSTAGRAM_ACCOUNT_ID: !!process.env.INSTAGRAM_ACCOUNT_ID,
    INSTAGRAM_ACCESS_TOKEN: !!process.env.INSTAGRAM_ACCESS_TOKEN,
  };
  if (!envCheck.INSTAGRAM_ACCOUNT_ID || !envCheck.INSTAGRAM_ACCESS_TOKEN) {
    return res.status(200).json({
      ok: false, connected: false, stage: 'env', envCheck,
      error: { message: 'Instagram environment variables are missing.', action: 'Set INSTAGRAM_ACCOUNT_ID and INSTAGRAM_ACCESS_TOKEN in Vercel, then redeploy.' },
    });
  }

  const creds = await getInstagramCredentials();
  const token = {
    source: creds.source,            // 'kv' = refreshed by us, 'env' = as pasted into Vercel
    expiresAt: creds.expiresAt,      // known only once we have refreshed it
    daysLeft: creds.daysLeft,
    refreshedAt: creds.refreshedAt,
  };

  let data;
  try {
    const response = await fetch(`https://graph.instagram.com/v23.0/me?fields=user_id,username&access_token=${encodeURIComponent(creds.accessToken)}`);
    data = await response.json();
    if (!response.ok || data.error) {
      return res.status(200).json({ ok: false, connected: false, stage: 'instagram_api', envCheck, token, error: describeInstagramError(data) });
    }
  } catch (err) {
    return res.status(200).json({
      ok: false, connected: false, stage: 'network', envCheck, token,
      error: { message: err?.message ?? 'Network error contacting Instagram', action: 'Try again in a minute.' },
    });
  }

  const apiUserId = String(data.user_id ?? '');
  const idsMatch = apiUserId !== '' && apiUserId === creds.accountId;
  return res.status(200).json({
    ok: idsMatch,
    connected: true,
    stage: 'ok',
    envCheck,
    token,
    username: data.username ?? null,
    idsMatch,
    ...(!idsMatch && {
      error: { message: 'The token is valid but belongs to a different Instagram account than INSTAGRAM_ACCOUNT_ID.', action: 'Fix INSTAGRAM_ACCOUNT_ID or generate the token from the right account.' },
    }),
  });
}
