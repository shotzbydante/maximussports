/**
 * Affiliate redirect endpoint. GET /api/affiliate/:offer
 *
 * Validates the offer key against the central config, captures attribution
 * query params, logs the outbound click to KV, then issues a 302 redirect
 * to the WebPartners tracking URL.
 *
 * The raw destination URL is never returned in the response body.
 *
 * Example usage:
 *   /api/affiliate/xbet-ncaa
 *   /api/affiliate/xbet-ncaa?source=team-page&team=kentucky&slot=upcoming-game
 *   /api/affiliate/mybookie-welcome?source=home&slot=hero&campaign=march-madness
 */

import { getQuery, getRequestUrl } from '../_requestUrl.js';
import {
  getAffiliateOffer,
  sanitizeAffiliateParams,
  logAffiliateClick,
  buildAffiliateRedirectResponse,
} from '../_lib/affiliateHelpers.js';

/**
 * Extract the offer key from the request path.
 * Path shape: /api/affiliate/{offer} → segments index 2
 */
function getOfferKeyFromReq(req) {
  const url = getRequestUrl(req);
  const segments = url.pathname.split('/').filter(Boolean);
  const raw = segments[2];
  return raw ? decodeURIComponent(raw).toLowerCase() : null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const offerKey = getOfferKeyFromReq(req);
  if (!offerKey) {
    return res.status(400).json({ error: 'Missing offer key' });
  }

  const offer = getAffiliateOffer(offerKey);
  if (!offer) {
    return res.status(404).json({ error: 'Offer not found or inactive' });
  }

  // TODO: Insert compliance / geo-gating middleware here before redirecting.
  // Example stubs for future use:
  //   if (offer.compliance?.usOnly) await enforceUsTraffic(req, res);
  //   if (offer.compliance?.requiresAge21) await enforceAgeGate(req, res);
  //   if (offer.compliance?.blockedStates?.length) await enforceStateBlock(req, res, offer.compliance.blockedStates);

  const query = getQuery(req);
  const attrs = sanitizeAffiliateParams(query);

  // Extract request metadata for the click log.
  const forwarded = req.headers['x-forwarded-for'] ?? req.headers['x-real-ip'] ?? '';
  const ip        = String(forwarded).split(',')[0].trim() || null;
  const userAgent = req.headers['user-agent']                           || null;
  const referer   = req.headers['referer'] || req.headers['referrer']   || null;
  const pathname  = getRequestUrl(req).pathname;

  // Log first, redirect second — ensures the event is captured even if the
  // redirect itself encounters a downstream issue. Non-blocking: a logging
  // failure must never prevent the user from reaching the sportsbook.
  logAffiliateClick({
    offer:    offer.key,
    brand:    offer.brand,
    label:    offer.label,
    ...attrs,
    userAgent,
    referer,
    ip,
    pathname,
  }).catch((err) => {
    console.warn('[affiliate] logAffiliateClick failed (non-fatal):', err?.message);
  });

  return buildAffiliateRedirectResponse(res, offer.url);
}
