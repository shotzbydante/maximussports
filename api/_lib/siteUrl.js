/**
 * Base URL for server-to-server calls between our own routes.
 *
 * Vercel Cron invokes a function on the deployment's own hostname
 * (maximussports-<hash>-….vercel.app). Requests from our code back to that
 * hostname do not reach our routes: they come back as an HTML page instead
 * of JSON, which is how the daily autopost ended up with "0 games, 0 odds,
 * 0 standings". Production code must call the public production domain.
 *
 * Order: SITE_URL (explicit override) → the production domain when running
 * in production → the request's own host (local dev and previews).
 */
const FALLBACK_HOST = 'maximussports.ai';

function clean(url) {
  return String(url || '').trim().replace(/\/+$/, '');
}

export function internalBaseUrl(req) {
  const explicit = clean(process.env.SITE_URL);
  if (explicit) return /^https?:\/\//.test(explicit) ? explicit : `https://${explicit}`;

  if (process.env.VERCEL_ENV === 'production') {
    return `https://${clean(process.env.VERCEL_PROJECT_PRODUCTION_URL) || FALLBACK_HOST}`;
  }

  const host = clean(req?.headers?.host);
  if (!host) return `https://${FALLBACK_HOST}`;
  return `${/^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? 'http' : 'https'}://${host}`;
}
