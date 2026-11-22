/**
 * Text helpers for social copy.
 *
 * Betting copy is full of decimals ("40.5", "57.0%"), so a sentence ends only
 * at . ! or ? followed by whitespace and then a capital letter, digit or
 * opening quote. A period inside a number never ends a sentence.
 */
const SENTENCE_BREAK = /(?<=[.!?])\s+(?=[A-Z0-9"“(])/;

export function splitSentences(text) {
  return String(text ?? '').trim().split(SENTENCE_BREAK).filter(Boolean);
}

/** As many whole sentences as fit in `max` characters. Cuts at a word only when the first sentence alone is too long. */
export function leadSentences(text, max = 210) {
  const sentences = splitSentences(text);
  if (sentences.length === 0) return '';
  let out = '';
  for (const s of sentences) {
    const next = out ? `${out} ${s}` : s;
    if (next.length > max) break;
    out = next;
  }
  if (out) return out;
  return `${sentences[0].slice(0, max).replace(/\s+\S*$/, '')}…`;
}
