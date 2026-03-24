/**
 * Decode common HTML entities in feed text for display.
 * Used for RSS titles/snippets that may contain raw HTML entities.
 * Safe — no innerHTML, no XSS risk.
 */

const ENTITY_MAP = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
  '&nbsp;': ' ',
  '&ndash;': '–',
  '&mdash;': '—',
  '&lsquo;': '\u2018',
  '&rsquo;': '\u2019',
  '&ldquo;': '\u201C',
  '&rdquo;': '\u201D',
};

const NAMED_RE = /&(?:amp|lt|gt|quot|apos|nbsp|ndash|mdash|lsquo|rsquo|ldquo|rdquo);/g;
const NUMERIC_RE = /&#(\d+);/g;
const HEX_RE = /&#x([0-9a-fA-F]+);/g;

/**
 * @param {string} text
 * @returns {string}
 */
export function decodeDisplayText(text) {
  if (!text || typeof text !== 'string') return text ?? '';
  return text
    .replace(NAMED_RE, (m) => ENTITY_MAP[m] || m)
    .replace(NUMERIC_RE, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(HEX_RE, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"');
}
