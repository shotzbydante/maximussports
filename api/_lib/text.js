/**
 * Text utilities for email rendering and data normalization.
 * Server-side only — no DOM; uses regex-based entity decoding.
 */

/**
 * Named HTML entity → character map.
 * Covers the entities most commonly seen in RSS / news feeds.
 */
const ENTITY_MAP = {
  amp: '&',    lt: '<',    gt: '>',    quot: '"',  apos: "'",
  nbsp: '\u00A0',
  ndash: '\u2013', mdash: '\u2014',
  lsquo: '\u2018', rsquo: '\u2019',
  ldquo: '\u201C', rdquo: '\u201D',
  laquo: '\u00AB', raquo: '\u00BB',
  hellip: '\u2026',
  bull: '\u2022',
  middot: '\u00B7',
  rarr: '\u2192', larr: '\u2190',
  copy: '\u00A9', reg: '\u00AE', trade: '\u2122',
  deg: '\u00B0', times: '\u00D7', divide: '\u00F7',
};

/**
 * Decode HTML entities in a string.
 *
 * Handles:
 *  - Named entities:  &amp; &lt; &gt; &quot; &apos; &rsquo; &hellip; etc.
 *  - Decimal numeric: &#39; &#8217; &#160; etc.
 *  - Hex numeric:     &#x27; &#x2019; &#xA0; etc.
 *
 * @param {string} str
 * @returns {string}
 */
export function decodeHtmlEntities(str) {
  if (!str || typeof str !== 'string') return str || '';
  return str
    .replace(/&([a-zA-Z][a-zA-Z0-9]*);/g, (full, name) => ENTITY_MAP[name] ?? full)
    .replace(/&#(\d+);/g, (_, n) => {
      try { return String.fromCodePoint(Number(n)); } catch { return _; }
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => {
      try { return String.fromCodePoint(parseInt(h, 16)); } catch { return _; }
    });
}

/**
 * Produce a normalized key for deduplication.
 * Lowercase, trims, collapses whitespace, strips punctuation.
 *
 * @param {string} str
 * @returns {string}
 */
export function normalizeForDedupe(str) {
  if (!str || typeof str !== 'string') return '';
  return decodeHtmlEntities(str)
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s]/g, '');
}

/**
 * Prepare a string for use as an email subject line:
 *  - Decodes HTML entities (&#39; → ')
 *  - Strips any stray HTML tags
 *  - Trims whitespace
 *
 * @param {string} str
 * @returns {string}
 */
export function plainTextSubject(str) {
  if (!str || typeof str !== 'string') return '';
  return decodeHtmlEntities(str)
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Truncate a string to a max character length, appending '…' if cut.
 *
 * @param {string} str
 * @param {number} max
 * @returns {string}
 */
export function truncate(str, max = 60) {
  if (!str) return '';
  const s = String(str);
  return s.length > max ? s.slice(0, max - 1) + '\u2026' : s;
}
