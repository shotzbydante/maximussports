/**
 * Men's basketball news filtering.
 * Allowlist: keep items matching these phrases (case-insensitive).
 * Exclude: remove items containing these phrases (case-insensitive).
 */

const MBB_ALLOWLIST = [
  "men's basketball",
  "mens basketball",
  "men's hoops",
  "mens hoops",
  "MBB",
  "NCAA men's",
  "men's college basketball",
  "college basketball",
  "men's NCAA",
  "basketball",
];

/** Fallback allowlist when primary filter yields no items (looser match) */
const MBB_LOOSE_ALLOWLIST = [
  "college basketball",
  "basketball",
  "NCAA",
  "March Madness",
  "Final Four",
  "bracket",
];

const MBB_EXCLUDE = [
  "women",
  "wbb",
  "women's basketball",
  "softball",
  "football",
  "baseball",
  "soccer",
  "volleyball",
  "hockey",
  "gymnastics",
];

function norm(s) {
  return (s || '').toLowerCase();
}

export function isMensBasketball(title) {
  const t = norm(title);
  if (!t) return false;

  for (const ex of MBB_EXCLUDE) {
    if (t.includes(norm(ex))) return false;
  }

  for (const al of MBB_ALLOWLIST) {
    if (t.includes(norm(al))) return true;
  }

  return false;
}

/**
 * Looser filter when primary MBB filter yields no items.
 * Still excludes women's/wbb/football/etc; allows college basketball, NCAA, etc.
 */
export function isMensBasketballLoose(title) {
  const t = norm(title);
  if (!t) return false;

  for (const ex of MBB_EXCLUDE) {
    if (t.includes(norm(ex))) return false;
  }

  for (const al of MBB_LOOSE_ALLOWLIST) {
    if (t.includes(norm(al))) return true;
  }

  return false;
}
