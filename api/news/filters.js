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
