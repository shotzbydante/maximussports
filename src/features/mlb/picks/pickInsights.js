/**
 * Pick insight helpers — surface *why* a pick exists.
 *
 *   primaryDriver(pick)      — maps the strongest bet-score component to a
 *                              human "Primary driver: …" label.
 *   relativeStrength(pick, allPicks)
 *                            — for Top Play / Tier 1, compute whether this
 *                              pick is the top edge on today's slate, or
 *                              within a percentile band. Returns a short
 *                              editorial signal string or null.
 */

function marketTypeSituationLabel(pick) {
  const m = pick?.market?.type;
  if (m === 'total') return 'park + pitching context';
  if (m === 'runline') return 'spread + margin context';
  return 'rotation + bullpen context';
}

const DRIVER_MAP = {
  edgeStrength:    { label: 'market mispricing', bucket: 'edge' },
  modelConfidence: { label: 'high model confidence', bucket: 'confidence' },
  situationalEdge: { label: null, bucket: 'situation' },   // dynamic — uses market type
  marketQuality:   { label: 'clean market alignment', bucket: 'market' },
};

/**
 * Find the component with the highest value and return a compact label.
 *
 *   { key: 'edgeStrength', value: 0.82, bucket: 'edge', label: 'market mispricing' }
 */
export function primaryDriver(pick) {
  const c = pick?.betScore?.components;
  if (!c) return null;

  let bestKey = null;
  let bestVal = -Infinity;
  for (const k of Object.keys(DRIVER_MAP)) {
    const v = Number(c[k]);
    if (!Number.isFinite(v)) continue;
    if (v > bestVal) { bestVal = v; bestKey = k; }
  }
  if (!bestKey) return null;
  const meta = DRIVER_MAP[bestKey];
  const label = meta.label ?? marketTypeSituationLabel(pick);
  return {
    key: bestKey,
    value: bestVal,
    bucket: meta.bucket,
    label,
  };
}

/**
 * Compute where a pick ranks across today's slate. Input `allPicks` should be
 * the deduped, renderable list (so rank numbers match what the user sees).
 *
 * Returns one of:
 *   { kind: 'highest',  text: "Highest conviction on today's slate" }
 *   { kind: 'top_pct',  text: "Top 5% of today's edges",  pctDisplayed: 5 }
 *   null — when the pick isn't notable enough to render a signal
 */
export function relativeStrength(pick, allPicks) {
  if (!pick || !Array.isArray(allPicks) || allPicks.length === 0) return null;
  const scores = allPicks
    .map(p => p?.betScore?.total ?? 0)
    .filter(s => Number.isFinite(s))
    .sort((a, b) => b - a);
  if (scores.length === 0) return null;
  const pickScore = pick?.betScore?.total ?? 0;
  if (pickScore < scores[0]) {
    // Compute percentile
    const rank = scores.findIndex(s => s <= pickScore);
    const idx = rank === -1 ? scores.length - 1 : Math.max(0, rank - 1);
    const pct = Math.ceil(((idx + 1) / scores.length) * 100);
    if (pct <= 5) return { kind: 'top_pct', text: "Top 5% of today's edges", pctDisplayed: 5 };
    if (pct <= 10) return { kind: 'top_pct', text: "Top 10% of today's edges", pctDisplayed: 10 };
    return null;
  }
  return { kind: 'highest', text: "Highest conviction on today's slate" };
}
