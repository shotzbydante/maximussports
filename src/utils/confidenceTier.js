/**
 * Shared confidence-tier classifier for matchup predictions.
 *
 * Legacy tiers (probability-based, used by game intel cards):
 *   conviction  — >= 70%  "MODEL EDGE"
 *   tossUp      — 60–69%  "TOSS-UP"
 *   lean        — 55–59%  "SLIGHT EDGE"
 *   dangerZone  — matchup where underdog is live
 *
 * Bracket tiers (model-driven, used by bracketology):
 *   high_conviction — stable, low-variance prediction
 *   lean            — directional lean
 *   dice_roll       — variance-driven, outcome uncertain
 *   upset_special   — model picks the lower seed (true underdog pick)
 */

export const TIERS = {
  conviction: {
    id: 'conviction',
    label: 'MODEL EDGE',
    shortLabel: '\u25C6',
    icon: '\u25C6',
    cssClass: 'tierConviction',
    igColor: { text: '#5FE8A8', bg: 'rgba(95,232,168,0.12)', border: 'rgba(95,232,168,0.30)' },
  },
  tossUp: {
    id: 'tossUp',
    label: 'TOSS-UP',
    shortLabel: '\u2684',
    icon: '\u2684',
    cssClass: 'tierTossUp',
    igColor: { text: '#8EAFC4', bg: 'rgba(142,175,196,0.12)', border: 'rgba(142,175,196,0.30)' },
  },
  lean: {
    id: 'lean',
    label: 'SLIGHT EDGE',
    shortLabel: '\u2192',
    icon: '\u2192',
    cssClass: 'tierLean',
    igColor: { text: '#D4B87A', bg: 'rgba(212,184,122,0.12)', border: 'rgba(212,184,122,0.30)' },
  },
  dangerZone: {
    id: 'dangerZone',
    label: 'DANGER ZONE',
    shortLabel: '\u26A0',
    icon: '\u26A0',
    cssClass: 'tierDangerZone',
    igColor: { text: '#E8845F', bg: 'rgba(232,132,95,0.14)', border: 'rgba(232,132,95,0.30)' },
  },
  upsetPick: {
    id: 'upsetPick',
    label: 'UPSET PICK',
    shortLabel: '\u25B2',
    icon: '\u25B2',
    cssClass: 'tierUpset',
    igColor: { text: '#E8845F', bg: 'rgba(232,132,95,0.14)', border: 'rgba(232,132,95,0.30)' },
  },
};

export const BRACKET_TIERS = {
  high_conviction: {
    id: 'high_conviction',
    label: 'HIGH CONVICTION',
    shortLabel: '\u25C6',
    icon: '\u25C6',
    indicator: null,
    cssClass: 'tierHighConviction',
    igColor: { text: '#5FE8A8', bg: 'rgba(95,232,168,0.12)', border: 'rgba(95,232,168,0.30)' },
    description: 'Stable, low-variance prediction anchored by strong model signals.',
    isAnchor: true,
    regenerates: false,
  },
  lean: {
    id: 'lean',
    label: 'LEAN',
    shortLabel: '\u2192',
    icon: '\u2192',
    indicator: null,
    cssClass: 'tierLean',
    igColor: { text: '#D4B87A', bg: 'rgba(212,184,122,0.12)', border: 'rgba(212,184,122,0.30)' },
    description: 'Directional lean with moderate conviction.',
    isAnchor: false,
    regenerates: false,
  },
  dice_roll: {
    id: 'dice_roll',
    label: 'DICE ROLL',
    shortLabel: '\uD83C\uDFB2',
    icon: '\uD83C\uDFB2',
    indicator: '\uD83C\uDFB2',
    cssClass: 'tierDiceRoll',
    igColor: { text: '#8EAFC4', bg: 'rgba(142,175,196,0.12)', border: 'rgba(142,175,196,0.30)' },
    description: 'Variance-driven — outcome less certain, could go either way.',
    isAnchor: false,
    regenerates: true,
  },
  upset_special: {
    id: 'upset_special',
    label: 'UPSET PICK',
    shortLabel: '\u26A0',
    icon: '\u26A0',
    indicator: '\u26A0',
    cssClass: 'tierUpsetSpecial',
    igColor: { text: '#E8845F', bg: 'rgba(232,132,95,0.14)', border: 'rgba(232,132,95,0.30)' },
    description: 'Model backs the lower seed — true underdog pick.',
    isAnchor: false,
    regenerates: true,
  },
};

/**
 * Classify a prediction into a confidence tier based on win probability.
 * Always classifies by conviction level — never overrides based on isUpset.
 */
export function getConfidenceTier(winProbability, isUpset = false) {
  const pct = (winProbability ?? 0.5) * 100;

  if (pct >= 70) return TIERS.conviction;
  if (pct >= 60) return TIERS.tossUp;
  if (pct >= 55) return TIERS.lean;
  return TIERS.tossUp;
}

/**
 * Get the correct upset-framing context for a matchup on Upset Radar or
 * similar editorial surfaces. This determines the right label semantics.
 *
 * @param {object} params
 * @param {boolean} params.isUpset - Whether the model's pick IS the lower seed
 * @param {number}  params.winProbability - Model's win probability for its pick
 * @param {number}  [params.topSeed] - Higher seed number (lower = better)
 * @param {number}  [params.bottomSeed] - Lower seed number (higher = worse)
 * @param {object}  [params.heuristics] - Optional heuristic data from tournamentHeuristics
 * @returns {{ pickLabel, matchupLabel, isTrueUpsetPick, underdogPct, heuristicFlags }}
 */
export function getUpsetFraming({ isUpset, winProbability, topSeed, bottomSeed, heuristics }) {
  const pct = Math.round((winProbability ?? 0.5) * 100);
  const underdogPct = isUpset ? pct : (100 - pct);
  const isClose = pct < 60;

  const refineFlags = heuristics?.matchupRefinements?.matchupFlags || [];
  const hasEightNineFlag = refineFlags.includes('eightNineSmallFav');
  const hasOverachieverUnderdog = refineFlags.some(f => f.includes('overachiever') && !f.includes('underachiever'));

  // Widen danger zone threshold when heuristic signals suggest elevated upset risk
  const dangerZoneThreshold = (hasEightNineFlag || hasOverachieverUnderdog) ? 63 : 60;

  if (isUpset) {
    const isStandout = pct >= 58;
    return {
      pickLabel: isStandout ? 'UPSET SPECIAL' : 'UPSET PICK',
      matchupLabel: 'UPSET PICK',
      isTrueUpsetPick: true,
      underdogPct,
      badgeTier: TIERS.upsetPick,
      heuristicFlags: refineFlags,
    };
  }

  if (isClose || (pct < dangerZoneThreshold && (hasEightNineFlag || hasOverachieverUnderdog))) {
    return {
      pickLabel: pct >= 55 ? 'SLIGHT EDGE' : 'DICE ROLL',
      matchupLabel: 'DANGER ZONE',
      isTrueUpsetPick: false,
      underdogPct,
      badgeTier: TIERS.dangerZone,
      heuristicFlags: refineFlags,
    };
  }

  return {
    pickLabel: pct >= 70 ? 'MODEL EDGE' : 'SLIGHT EDGE',
    matchupLabel: underdogPct >= 30 ? 'DANGER ZONE' : null,
    isTrueUpsetPick: false,
    underdogPct,
    badgeTier: getConfidenceTier(winProbability),
    heuristicFlags: refineFlags,
  };
}

/**
 * Get the bracket-specific tier from a prediction result.
 */
export function getBracketTier(prediction) {
  if (!prediction) return BRACKET_TIERS.lean;
  const tierKey = prediction.bracketTier || 'lean';
  return BRACKET_TIERS[tierKey] || BRACKET_TIERS.lean;
}

/**
 * Determine if a bracket pick should be treated as an anchor.
 */
export function isAnchorPick(prediction) {
  const tier = getBracketTier(prediction);
  return tier.isAnchor;
}

/**
 * Determine if a bracket pick should be re-randomized during regeneration.
 */
export function shouldRegenerate(prediction) {
  const tier = getBracketTier(prediction);
  return tier.regenerates;
}
