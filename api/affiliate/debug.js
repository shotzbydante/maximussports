/**
 * Internal affiliate debug endpoint. GET /api/affiliate/debug
 *
 * Returns active offer metadata, aggregate click totals, and environment
 * readiness for internal validation. Never returns raw WebPartners URLs
 * or any secret configuration values.
 *
 * Access is gated to:
 *   - Requests authenticated with a valid admin user Bearer token, OR
 *   - Requests from Vercel cron using the CRON_SECRET Bearer token
 *
 * Vercel routing: static paths take precedence over dynamic [offer].js,
 * so /api/affiliate/debug always resolves here, not to the redirect handler.
 */

import { AFFILIATE_OFFERS } from '../_lib/affiliateConfig.js';
import { getClickTotals } from '../_lib/affiliateHelpers.js';
import { isKvAvailable } from '../_globalCache.js';
import { verifyUserToken } from '../_lib/supabaseAdmin.js';
import { isAdminEmail } from '../_lib/admin.js';

/**
 * Accept requests authenticated via CRON_SECRET or a valid admin Supabase token.
 * @param {import('http').IncomingMessage} req
 * @returns {Promise<boolean>}
 */
async function isAuthorized(req) {
  const authHeader = String(req.headers['authorization'] ?? '');
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

  if (!token) return false;

  // Allow Vercel cron or internal automation via CRON_SECRET.
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && token === cronSecret) return true;

  // Otherwise require a valid admin Supabase session token.
  try {
    const user = await verifyUserToken(token);
    return Boolean(user?.email && isAdminEmail(user.email));
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const authorized = await isAuthorized(req);
  if (!authorized) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const [clickTotals, kvReady] = await Promise.all([
    getClickTotals(),
    isKvAvailable(),
  ]);

  const activeOffers = AFFILIATE_OFFERS
    .filter((o) => o.active)
    .map((o) => ({
      key:        o.key,
      brand:      o.brand,
      label:      o.label,
      active:     o.active,
      compliance: o.compliance ?? null,
      clicks:     clickTotals[o.key] ?? 0,
    }));

  const inactiveOffers = AFFILIATE_OFFERS
    .filter((o) => !o.active)
    .map((o) => ({ key: o.key, brand: o.brand, label: o.label, active: false }));

  const totalClicks = Object.values(clickTotals).reduce((sum, n) => sum + n, 0);

  return res.status(200).json({
    generatedAt:  new Date().toISOString(),
    env: {
      kvAvailable: kvReady,
      // TODO: add partner connectivity check when a WebPartners ping endpoint becomes available
    },
    offers: {
      active:   activeOffers,
      inactive: inactiveOffers,
    },
    totals: {
      activeOfferCount:       activeOffers.length,
      totalClicksAllOffers:   totalClicks,
      byOffer:                clickTotals,
    },
  });
}
