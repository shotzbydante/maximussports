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
  "women's",
  "womens",
  "wbb",
  "ncaaw",
  "lady",
  "women's basketball",
  "lady vols",
  "lady vol",
  "lady huskers",
  "lady wildcats",
  "lady bears",
  "lady tigers",
  "lady bulldogs",
  "lady aggies",
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

/**
 * Check title (and optionally source) for women's basketball / WBB signals.
 * Reject if title or source indicates women's basketball.
 */
function hasWomensSignal(title, source) {
  const t = norm(title);
  const s = norm(source || '');
  const combined = `${t} ${s}`;
  for (const ex of MBB_EXCLUDE) {
    if (combined.includes(norm(ex))) return true;
  }
  return false;
}

export function isMensBasketball(title, source) {
  const t = norm(title);
  if (!t) return false;

  if (hasWomensSignal(title, source)) return false;

  for (const al of MBB_ALLOWLIST) {
    if (t.includes(norm(al))) return true;
  }

  return false;
}

/**
 * Looser filter when primary MBB filter yields no items.
 * Still excludes women's/wbb/football/etc; allows college basketball, NCAA, etc.
 */
export function isMensBasketballLoose(title, source) {
  const t = norm(title);
  if (!t) return false;

  if (hasWomensSignal(title, source)) return false;

  for (const al of MBB_LOOSE_ALLOWLIST) {
    if (t.includes(norm(al))) return true;
  }

  return false;
}
