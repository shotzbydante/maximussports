/**
 * Shared utility: ensures positive American odds display a leading "+".
 *
 * Catches patterns the LLM or cached data may emit without the "+" prefix:
 *   "at 320"   →  "at +320"
 *   "(320)"    →  "(+320)"
 *   "odds 320" →  "odds +320"
 *
 * Safe to call multiple times — never double-prefixes.
 */
export function fixPositiveOdds(text) {
  if (!text) return text;
  return text
    .replace(/\bat\s+(\d{3,4})(?=[\s.,;!?)\-–—]|$)/g, (_match, num) => {
      const n = parseInt(num, 10);
      return (n >= 100 && n <= 9999) ? `at +${num}` : _match;
    })
    .replace(/\((\d{3,4})\)/g, (_match, num) => {
      const n = parseInt(num, 10);
      return (n >= 100 && n <= 9999) ? `(+${num})` : _match;
    })
    .replace(/odds\s+(\d{3,4})(?=[\s.,;!?)\-–—]|$)/gi, (_match, num) => {
      const n = parseInt(num, 10);
      return (n >= 100 && n <= 9999) ? `odds +${num}` : _match;
    })
    .replace(/behind\s+at\s+(\d{3,4})(?=[\s.,;!?)\-–—]|$)/gi, (_match, num) => {
      const n = parseInt(num, 10);
      return (n >= 100 && n <= 9999) ? `behind at +${num}` : _match;
    });
}
