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
 * Map a market.type value to the legacy category metadata so a pick
 * sourced from briefingPicks (which lives outside `categories`) still
 * tags `_cat` / `_catShort` consistently for slide rendering.
 */
function categoryMetaForPick(pick) {
  const t = pick?.market?.type;
  if (t === 'runline')   return CATEGORY_ORDER[0];   // Spread
  if (t === 'moneyline') return CATEGORY_ORDER[1];   // Moneyline
  if (t === 'total')     return CATEGORY_ORDER[2];   // Total
  return CATEGORY_ORDER[3];                          // Lean
}

/**
 * Build the ordered, canonical picks array.
 *
 * v11: prefer `briefingPicks` when present. The audit
 * (docs/nba-model-realism-odds-mapping-and-briefing-picks-audit-v11.md)
 * traced the SAS+410 leak to slides reading `categories` regardless of
 * pickRole. `briefingPicks` is the editorial-safe subset; falling back
 * to `categories` keeps legacy callers (and any payload built before
 * v11) working without crashing.
 *
 * @param {object} data — content-studio payload.
 * @returns {Array} ordered picks tagged with `_cat` / `_catShort`.
 */
export function resolveCanonicalNbaPicks(data) {
  // v11 path: editorial briefing layer
  const briefing = data?.nbaPicks?.briefingPicks
    || data?.canonicalPicks?.briefingPicks;
  if (Array.isArray(briefing) && briefing.length > 0) {
    const all = briefing.map(p => {
      const meta = categoryMetaForPick(p);
      return { ...p, _cat: meta.long, _catShort: meta.short };
    });
    all.sort((a, b) => pickScore(b) - pickScore(a));
    return all;
  }

  // Legacy path: tier1/2/3 published picks. Pre-v11 callers land here.
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
