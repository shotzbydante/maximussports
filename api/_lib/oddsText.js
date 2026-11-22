/**
 * Post-processing for odds in model-written copy.
 *
 * Models sometimes drop the "+" from positive American odds ("at 750",
 * "(750)"). This puts it back, but only on numbers that are prices. Totals
 * ("the total at 149.5"), spreads, point counts and scores ("at 132-129")
 * are left exactly as written.
 */

/** Words just before a number that mean it is not an American price. */
const NOT_A_PRICE_BEFORE = /(total|over\/under|over-under|o\/u|spread|points?|pts|score[ds]?)\b[^.!?]{0,24}$/i;

function looksLikePrice(text, matchIndex) {
  return !NOT_A_PRICE_BEFORE.test(text.slice(Math.max(0, matchIndex - 40), matchIndex));
}

export function fixPositiveOdds(text) {
  if (!text) return text;
  return text
    // "at 750" → "at +750". Not decimals (149.5), not scores (132-129), not "points".
    .replace(/\bat\s+(\d{3,4})(?![\d.]*\d)(?!\s*[-–—]\s*\d)(?!\s+(?:points?|pts)\b)(?=[\s.,;!?)]|$)/g, (match, num, offset, whole) => {
      const n = parseInt(num, 10);
      if (n < 100 || n > 9999) return match;
      return looksLikePrice(whole, offset) ? `at +${num}` : match;
    })
    // "(750)" → "(+750)"
    .replace(/\((\d{3,4})\)/g, (match, num, offset, whole) => {
      const n = parseInt(num, 10);
      if (n < 100 || n > 9999) return match;
      return looksLikePrice(whole, offset) ? `(+${num})` : match;
    });
}
