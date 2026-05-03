/**
 * resolveSlidePicks — canonical NBA picks resolver shared by Slide 1,
 * Slide 2, and buildNbaCaption.
 *
 * Single source of truth for the SLIDE-FACING picks list. Both slides
 * read the same `payload.nbaPicks.categories` map, but if each slide
 * builds + sorts its own array there's drift risk (different `_cat`
 * labels, different sort, different category order). This helper
 * collapses that into one ordered list keyed by `betScore.total ??
 * confidenceScore ?? 0` so:
 *
 *   Slide 1 picks (cap 2) === Slide 2 picks (cap 3).slice(0, 2)
 *
 * Contract: callers pass `cap` and get the top-N slice. Slide 1 is the
 * preview surface so it strict-prefixes Slide 2's list — no
 * recomputation, no filtering, no separate sort key.
 *
 * Each output entry carries the canonical category label that BOTH
 * slides display (Slide 1 used to use ML/SPR/O-U/LEAN; Slide 2 uses
 * Moneyline/Spread/Total/Lean — both shapes are exposed below so
 * existing UI keeps rendering as-is).
 */

const CATEGORY_ORDER = [
  // Order is the priority for SAME-betScore ties — Spread first since
  // ATS is the model's primary market on the daily briefing.
  { key: 'ats',     long: 'Spread',    short: 'SPR'  },
  { key: 'pickEms', long: 'Moneyline', short: 'ML'   },
  { key: 'totals',  long: 'Total',     short: 'O/U'  },
  { key: 'leans',   long: 'Lean',      short: 'LEAN' },
];

function pickScore(p) {
  return p?.betScore?.total ?? p?.confidenceScore ?? 0;
}

/**
 * Build the ordered, canonical picks array.
 *
 * @param {object} data — content-studio payload (or anything with
 *                        `nbaPicks.categories` / `canonicalPicks`).
 * @returns {Array} ordered picks, each tagged with `_cat` (long) and
 *                  `_catShort` (compact slide-1 label).
 */
export function resolveCanonicalNbaPicks(data) {
  const cats = data?.nbaPicks?.categories
    || data?.canonicalPicks?.categories
    || {};
  const all = [];
  for (const meta of CATEGORY_ORDER) {
    const list = Array.isArray(cats[meta.key]) ? cats[meta.key] : [];
    for (const p of list) {
      all.push({ ...p, _cat: meta.long, _catShort: meta.short });
    }
  }
  // Stable sort by betScore desc — ties retain CATEGORY_ORDER position
  // so Spread ranks above Moneyline at the same score.
  all.sort((a, b) => pickScore(b) - pickScore(a));
  return all;
}

/**
 * Slide-facing slice. Slide 1 caps at 2, Slide 2 caps at 3 — both call
 * this so Slide 1's list is provably the prefix of Slide 2's list.
 */
export function resolveSlidePicks(data, cap = 3) {
  return resolveCanonicalNbaPicks(data).slice(0, cap);
}

export default resolveSlidePicks;
