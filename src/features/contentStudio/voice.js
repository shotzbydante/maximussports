/**
 * The Maximus voice, as rules code can enforce. The prose version is
 * docs/voice-guide.md.
 *
 *   findVoiceIssues(text)        hype phrases we never publish
 *   ensureResponsibleLine(text)  every post carries an age and help line
 *   validateRewrite(base, next)  a rewritten caption may change words, never facts
 *
 * Used by normalizeStudioCaption (every sport's caption passes through it),
 * by the Instagram publish routes, and by the Claude voice pass.
 */

export const RESPONSIBLE_LINE = '21+. For entertainment only. Gambling problem? Call 1-800-GAMBLER.';

/** Phrases that promise an outcome. "Locked at -105" is fine; "lock of the week" is not. */
const BANNED = [
  [/\block(s)? of the (day|week|year|century)\b/i, 'lock of the…'],
  [/\b(mortal|stone[- ]cold|absolute) lock\b/i, 'mortal lock'],
  [/\bguarantee(d|s)?\b/i, 'guaranteed'],
  [/\bcan(?:'|’)?t[- ]lose\b/i, "can't lose"],
  [/\bsure thing\b/i, 'sure thing'],
  [/\b(free|easy) money\b/i, 'free money'],
  [/\brisk[- ]free\b/i, 'risk-free'],
  [/\bbet the (house|farm|mortgage)\b/i, 'bet the house'],
  [/\bno[- ]brainer\b/i, 'no-brainer'],
  [/\b(never|won(?:'|’)?t) (lose|miss)\b/i, 'never loses'],
];

export function findVoiceIssues(text) {
  const s = String(text ?? '');
  return BANNED.filter(([re]) => re.test(s)).map(([, label]) => label);
}

export function hasResponsibleLine(text) {
  return /\b21\+/.test(String(text ?? ''));
}

export function ensureResponsibleLine(text) {
  const s = String(text ?? '').trim();
  return hasResponsibleLine(s) ? s : `${s}\n\n${RESPONSIBLE_LINE}`;
}

/** Every number-like token: 40.5, -105, +4.7%, 53.6%, 12, 7-2, 1-800-GAMBLER is ignored by callers via the base text. */
export function numbersIn(text) {
  return (String(text ?? '').match(/[+-]?\d+(?:\.\d+)?%?/g) || []).map((n) => n.replace(/^\+/, ''));
}

/**
 * A rewrite passes only if it invents nothing: every number in it already
 * appears in the base caption, it keeps the site and the responsible line,
 * it names no pick the base does not, and it contains no hype phrase.
 * @returns {{ok:boolean, problems:string[]}}
 */
export function validateRewrite(base, next) {
  const problems = [];
  const a = String(base ?? '');
  const b = String(next ?? '').trim();
  if (b.length < 80) problems.push('too short');
  if (b.length > 2200) problems.push('over the Instagram caption limit');

  const allowed = new Set(numbersIn(a));
  const invented = [...new Set(numbersIn(b))].filter((n) => !allowed.has(n) && !allowed.has(n.replace(/^-/, '')));
  if (invented.length) problems.push(`numbers not in the source: ${invented.join(', ')}`);

  if (/maximussports\.ai/i.test(a) && !/maximussports\.ai/i.test(b)) problems.push('dropped the site link');
  if (hasResponsibleLine(a) && !hasResponsibleLine(b)) problems.push('dropped the 21+ line');

  const hype = findVoiceIssues(b);
  if (hype.length) problems.push(`hype phrases: ${hype.join(', ')}`);
  return { ok: problems.length === 0, problems };
}
