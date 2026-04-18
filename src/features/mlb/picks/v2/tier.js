/**
 * Tier assignment — dynamic, slate-relative cutoffs with hard floors & caps.
 *
 * Rules (from architecture doc §3.3):
 *   tier1: betScore ≥ max(floor, P90 of slate)
 *   tier2: betScore ≥ max(floor, P70 of slate)
 *   tier3: betScore ≥ max(floor, P50 of slate)
 *
 * Per-game caps:
 *   maxTier1PerGame (default 1)
 *   maxPerGame      (default 2)
 *
 * Per-slate caps:
 *   maxPerTier.tier1/2/3
 */

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.floor(p * sorted.length)));
  return sorted[idx];
}

/**
 * Assign tiers to an array of candidate picks (each with `.betScore.total`).
 * Mutates picks with `.tier` and returns the filtered/sorted list.
 *
 * @param {Array} candidates — picks with .betScore, .gameId, and any ordering we preserve on ties
 * @param {object} config — active tuning config
 * @returns {{ tier1: [], tier2: [], tier3: [], published: [] }}
 */
export function assignTiers(candidates, config) {
  const cuts = config?.tierCutoffs || {};
  const caps = config?.maxPerTier || { tier1: 3, tier2: 5, tier3: 5 };
  const maxPerGame = config?.maxPerGame ?? 2;
  const maxTier1PerGame = config?.maxTier1PerGame ?? 1;

  const scores = candidates.map(p => p.betScore?.total ?? 0).sort((a, b) => a - b);
  const p90 = percentile(scores, 0.90);
  const p70 = percentile(scores, 0.70);
  const p50 = percentile(scores, 0.50);

  const threshold = {
    tier1: Math.max(cuts.tier1?.floor ?? 0.75, p90),
    tier2: Math.max(cuts.tier2?.floor ?? 0.60, p70),
    tier3: Math.max(cuts.tier3?.floor ?? 0.45, p50),
  };

  // Sort by betScore desc, stable
  const ranked = candidates
    .map((p, i) => ({ p, i }))
    .sort((a, b) => (b.p.betScore?.total ?? 0) - (a.p.betScore?.total ?? 0) || a.i - b.i)
    .map(x => x.p);

  const gameCount = new Map();           // gameId → total picks
  const gameTier1 = new Map();           // gameId → tier1 picks
  const out = { tier1: [], tier2: [], tier3: [], published: [] };

  for (const pick of ranked) {
    const score = pick.betScore?.total ?? 0;
    const gid = pick.gameId;
    const gc = gameCount.get(gid) || 0;
    const t1c = gameTier1.get(gid) || 0;
    if (gc >= maxPerGame) continue;

    let assigned = null;
    if (score >= threshold.tier1 && out.tier1.length < caps.tier1 && t1c < maxTier1PerGame) {
      assigned = 'tier1';
    } else if (score >= threshold.tier2 && out.tier2.length < caps.tier2) {
      assigned = 'tier2';
    } else if (score >= threshold.tier3 && out.tier3.length < caps.tier3) {
      assigned = 'tier3';
    }
    if (!assigned) continue;

    pick.tier = assigned;
    out[assigned].push(pick);
    out.published.push(pick);
    gameCount.set(gid, gc + 1);
    if (assigned === 'tier1') gameTier1.set(gid, t1c + 1);
  }

  return out;
}
