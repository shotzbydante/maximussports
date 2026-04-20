/**
 * useAuthGate — centralized route access policy for guests.
 *
 * Three access tiers:
 *   - 'open'    Guest can view the full page (home pages, landing, auth, legal)
 *   - 'preview' Guest sees ~25% of content + fade + create-account CTA
 *   - 'gated'   Authenticated-only; guest redirected to /settings?next=<path>
 *
 * Route decisions live here so both client (RouteGate) and server (future SSR)
 * can share one source of truth.
 */

const OPEN_ROUTES = new Set([
  '/',
  '/mlb',
  '/ncaam',
  '/nba',
  '/settings',
  '/privacy',
  '/terms',
  '/contact',
  '/auth/callback',
]);

/**
 * Any sport sub-route (e.g. /mlb/games, /nba/teams/bos) is preview-gated.
 * The home page itself (/mlb, /nba, /ncaam) stays open.
 */
const PREVIEW_PREFIXES = ['/mlb/', '/ncaam/', '/nba/'];

const GATED_ROUTES = new Set([
  '/dashboard',
]);

/** Resolve which sport palette a preview gate should use based on path. */
export function getSportFromPath(path) {
  if (path.startsWith('/mlb')) return 'mlb';
  if (path.startsWith('/nba')) return 'nba';
  if (path.startsWith('/ncaam')) return 'ncaam';
  return 'mlb';
}

/**
 * Normalize a pathname by stripping trailing slash + query/hash.
 * Keeps dynamic segments intact (/mlb/teams/nyy stays matchable).
 */
function normalize(path) {
  if (!path) return '/';
  const noHash = path.split('#')[0].split('?')[0];
  if (noHash.length > 1 && noHash.endsWith('/')) return noHash.slice(0, -1);
  return noHash;
}

export function getRouteAccess(pathname) {
  const p = normalize(pathname);

  if (OPEN_ROUTES.has(p)) return 'open';
  if (GATED_ROUTES.has(p)) return 'gated';

  // Preview-gated: any sport sub-route
  for (const prefix of PREVIEW_PREFIXES) {
    if (p.startsWith(prefix)) return 'preview';
  }

  return 'open';
}
