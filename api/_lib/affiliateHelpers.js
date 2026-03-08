/**
 * Affiliate tracking helpers for Maximus Sports.
 *
 * Exports:
 *   getAffiliateOffer        — look up and validate an offer by key
 *   sanitizeAffiliateParams  — extract safe attribution params from a query object
 *   logAffiliateClick        — persist a click event to KV (fire-and-forget safe)
 *   buildAffiliateRedirectResponse — emit a 302 redirect response
 *   getClickTotals           — read per-offer aggregate counters from KV
 */

import { AFFILIATE_OFFERS, OFFERS_BY_KEY } from './affiliateConfig.js';
import { getJson, setJson } from '../_globalCache.js';

// ─── KV key scheme (namespaced + versioned) ──────────────────────────────────
const KV_NS = 'affiliate:v1';
const kvOfferKey = (offerKey) => `${KV_NS}:total:offer:${offerKey}`;
const kvBrandKey = (brand)    => `${KV_NS}:total:brand:${brand}`;
const kvDayKey   = (dateStr)  => `${KV_NS}:total:day:${dateStr}`;
const KV_RECENT_LOG           = `${KV_NS}:log:recent`;

// ─── TTL constants ────────────────────────────────────────────────────────────
const RECENT_LOG_MAX          = 200;                    // ring-buffer cap
const RECENT_LOG_TTL_SECONDS  = 30 * 24 * 60 * 60;     // 30 days
const COUNTER_TTL_SECONDS     = 90 * 24 * 60 * 60;     // 90 days

// ─── Attribution param allowlist ─────────────────────────────────────────────
const ALLOWED_PARAMS  = ['source', 'page', 'slot', 'team', 'gameId', 'campaign', 'variant'];
const PARAM_MAX_LEN   = 100; // chars; prevents log bloat from malformed values

// ─── Public helpers ───────────────────────────────────────────────────────────

/**
 * Look up an offer by key. Returns null when the key is unknown or the offer is inactive.
 * @param {string} offerKey
 * @returns {import('./affiliateConfig.js').AffiliateOffer | null}
 */
export function getAffiliateOffer(offerKey) {
  if (!offerKey || typeof offerKey !== 'string') return null;
  const offer = OFFERS_BY_KEY[offerKey.toLowerCase()];
  if (!offer || !offer.active) return null;
  return offer;
}

/**
 * Extract and sanitize known attribution params from a raw query object.
 * Unknown keys and values exceeding PARAM_MAX_LEN are dropped silently.
 * @param {Record<string, string>} query
 * @returns {Record<string, string>}
 */
export function sanitizeAffiliateParams(query) {
  if (!query || typeof query !== 'object') return {};
  const out = {};
  for (const key of ALLOWED_PARAMS) {
    const val = query[key];
    if (val && typeof val === 'string' && val.length <= PARAM_MAX_LEN) {
      out[key] = val;
    }
  }
  return out;
}

/**
 * Persist a click event to KV. Never throws — affiliate redirects must never
 * fail due to a logging error. All writes are fire-and-forget.
 *
 * Persists:
 *   - Appends event to a capped ring-buffer log (most-recent 200 clicks)
 *   - Increments counter: per offer key
 *   - Increments counter: per brand
 *   - Increments counter: per calendar day (UTC)
 *
 * @param {Object} data
 * @param {string} data.offer
 * @param {string} data.brand
 * @param {string} data.label
 * @param {string} [data.source]
 * @param {string} [data.page]
 * @param {string} [data.slot]
 * @param {string} [data.team]
 * @param {string} [data.gameId]
 * @param {string} [data.campaign]
 * @param {string} [data.variant]
 * @param {string} [data.userAgent]
 * @param {string} [data.referer]
 * @param {string} [data.ip]
 * @param {string} [data.pathname]
 */
export async function logAffiliateClick(data) {
  const timestamp = new Date().toISOString();
  const event = { timestamp, ...data };

  // All four writes are independent — run concurrently, fail silently.
  await Promise.allSettled([
    _appendToRecentLog(event),
    _incrementCounter(kvOfferKey(data.offer)),
    _incrementCounter(kvBrandKey(data.brand)),
    _incrementCounter(kvDayKey(timestamp.slice(0, 10))),
  ]);
}

/**
 * Emit a 302 redirect to targetUrl. Caller is responsible for logging before calling this.
 * Sets no-store cache headers so the redirect is never cached by intermediaries.
 * @param {import('http').ServerResponse} res
 * @param {string} targetUrl
 */
export function buildAffiliateRedirectResponse(res, targetUrl) {
  res.setHeader('Location', targetUrl);
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.status(302).end();
}

/**
 * Read per-offer click totals from KV for all active offers.
 * Returns 0 for any offer with no recorded clicks.
 * @returns {Promise<Record<string, number>>}
 */
export async function getClickTotals() {
  const active = AFFILIATE_OFFERS.filter((o) => o.active);
  const results = {};
  await Promise.all(
    active.map(async (offer) => {
      const val = await getJson(kvOfferKey(offer.key));
      results[offer.key] = Number(val) || 0;
    }),
  );
  return results;
}

// ─── Private helpers ──────────────────────────────────────────────────────────

async function _appendToRecentLog(event) {
  const existing = await getJson(KV_RECENT_LOG);
  const log = Array.isArray(existing) ? existing : [];
  // Prepend newest; cap size to avoid unbounded KV growth.
  const updated = [event, ...log].slice(0, RECENT_LOG_MAX);
  await setJson(KV_RECENT_LOG, updated, { exSeconds: RECENT_LOG_TTL_SECONDS });
}

async function _incrementCounter(key) {
  const current = await getJson(key);
  const next = (Number(current) || 0) + 1;
  await setJson(key, next, { exSeconds: COUNTER_TTL_SECONDS });
}
