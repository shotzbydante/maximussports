/* global process */
/**
 * Logo URL resolution for emails.
 *
 * Gmail iOS has unreliable SVG rendering — use PNG for all email images.
 * SVGs remain in use on the web app.
 *
 * All public logo files are at:  public/logos/{slug}.png  (74 teams covered)
 * Web SVGs remain at:            public/logos/{slug}.svg
 */

const BASE_URL = 'https://maximussports.ai';

/**
 * Returns the absolute PNG logo URL for use in email <img> tags.
 * Falls back to SVG URL if no slug provided.
 *
 * @param {string|null} slug  — team slug, e.g. 'duke-blue-devils'
 * @param {string} [base]     — override base URL (for dev/staging)
 * @returns {string|null}
 */
export function teamLogoUrlEmail(slug, base = BASE_URL) {
  if (!slug) return null;
  const url = `${base}/logos/${slug}.png`;
  if (process.env?.NODE_ENV !== 'production') {
    console.log(`[logos] email logo: ${url}`);
  }
  return url;
}

/**
 * Returns the absolute SVG logo URL for web use.
 *
 * @param {string|null} slug
 * @param {string} [base]
 * @returns {string|null}
 */
export function teamLogoUrlSvg(slug, base = BASE_URL) {
  if (!slug) return null;
  return `${base}/logos/${slug}.svg`;
}
