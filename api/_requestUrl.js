/**
 * WHATWG URL parsing for Vercel serverless handlers.
 * Use these instead of req.query to avoid DEP0169 (url.parse deprecation).
 * Dependency-free; safe when headers are missing.
 */

/**
 * @param {import('http').IncomingMessage} req
 * @returns {URL}
 */
export function getRequestUrl(req) {
  const proto = (req.headers && req.headers['x-forwarded-proto']) || 'http';
  const host = (req.headers && (req.headers['x-forwarded-host'] || req.headers['host'])) || 'localhost';
  const base = `${proto}://${host}`;
  const path = (req.url && typeof req.url === 'string') ? req.url : '/';
  return new URL(path, base);
}

/**
 * @param {import('http').IncomingMessage} req
 * @returns {Record<string, string>}
 */
export function getQuery(req) {
  const url = getRequestUrl(req);
  return Object.fromEntries(url.searchParams.entries());
}

/**
 * @param {import('http').IncomingMessage} req
 * @param {string} key
 * @param {string | null} [fallback=null]
 * @returns {string | null}
 */
export function getQueryParam(req, key, fallback = null) {
  const url = getRequestUrl(req);
  const value = url.searchParams.get(key);
  return value !== null && value !== undefined ? value : fallback;
}

/**
 * @param {import('http').IncomingMessage} req
 * @returns {string[]}
 */
export function getPathSegments(req) {
  const url = getRequestUrl(req);
  return url.pathname.split('/').filter(Boolean);
}
