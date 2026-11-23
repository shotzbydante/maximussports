/**
 * Number grounding: an answer may only contain numbers that came from data.
 *
 * A stat or an odds figure typed by the model is a liability. Cards are
 * safe by construction (the server builds them), so this checks the few
 * words the model writes above them: every number in those words must
 * appear in a tool result from this turn or already be in the conversation.
 *
 * The comparison ignores sign and a trailing percent, so "-110", "110" and
 * "+3.5%" / "3.5" match. That keeps false alarms rare; the point is to
 * catch an invented figure, not to police formatting.
 */

/** Small counts ("3 picks", "2 games") and the helpline digits are always allowed. */
const ALWAYS = new Set(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '21', '800', '100']);

export function numbersIn(text) {
  return (String(text ?? '').match(/\d+(?:\.\d+)?/g) || []).map((n) => String(Number(n)));
}

/**
 * @param {string} text    what the model wrote
 * @param {string[]} sources  tool results (as JSON text), earlier messages, the user's message
 * @returns {string[]} numbers in `text` found in none of the sources
 */
export function ungroundedNumbers(text, sources = []) {
  const known = new Set(ALWAYS);
  for (const s of sources) for (const n of numbersIn(s)) known.add(n);
  known.add(String(new Date().getFullYear()));
  return [...new Set(numbersIn(text).filter((n) => !known.has(n)))];
}
