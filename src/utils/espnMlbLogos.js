/**
 * MLB team logo resolver.
 *
 * Self-hosted logos in /public/logos/mlb/{slug}.png — sourced from ESPN CDN
 * slug-based URLs which always serve the CURRENT team identity.
 *
 * Self-hosting eliminates:
 *   - CORS failures that broke html-to-image exports (missing logos in IG posts)
 *   - Stale logos via numeric ESPN IDs (e.g. ID 5 → old Indians Chief Wahoo)
 *   - External CDN latency / availability dependencies
 */

const VALID_SLUGS = new Set([
  'nyy', 'bos', 'tor', 'tb', 'bal',
  'cle', 'min', 'det', 'cws', 'kc',
  'hou', 'sea', 'tex', 'laa', 'oak',
  'atl', 'nym', 'phi', 'mia', 'wsh',
  'chc', 'mil', 'stl', 'pit', 'cin',
  'lad', 'sd', 'sf', 'ari', 'col',
]);

export function getMlbEspnLogoUrl(slug) {
  if (!slug) return null;
  if (!VALID_SLUGS.has(slug)) return null;
  return `/logos/mlb/${slug}.png`;
}

export function hasMlbEspnLogo(slug) {
  return slug != null && VALID_SLUGS.has(slug);
}
