/**
 * Tournament Heuristics — Additive Priors for March Madness
 *
 * Two clean layers:
 *
 *   LAYER 1 — Championship Viability Overlay (macro / tournament-level)
 *     Affects: title equity, final four probability, bracket simulation, championship tiering
 *     Signals:
 *       A. Conference tournament semifinal appearance
 *       B. Week 6 AP Poll Top-12
 *       C. KenPom net rating ≥ +25.49
 *
 *   LAYER 2 — Matchup Refinement Features (micro / game-level)
 *     Affects: ATS picks, pick'em, upset radar, danger zone, 5 Key Games, Game Intel, IG content
 *     Signals:
 *       D. #4 seed first-round SU/ATS trend
 *       E. #8 vs #9 small-favorite spread penalty
 *       F. Overachiever / underachiever profile
 *
 * Philosophy:
 *   - Additive priors, NOT hard rules
 *   - No team is hard-filtered out
 *   - Short-sample trends get the weakest weight
 *   - These nudge the model, never override strong base signals
 *
 * All outputs are structured, composable, and reusable across surfaces.
 */

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

// ══════════════════════════════════════════════════════════════════════════════
// LAYER 1 — CHAMPIONSHIP VIABILITY OVERLAY
// ══════════════════════════════════════════════════════════════════════════════

const CHAMP_OVERLAY_WEIGHTS = {
  confSemis: 0.020,
  week6Top12: 0.025,
  kenpomAbove: 0.030,
  kenpomBelow: -0.015,
};

/**
 * A. Conference Tournament Semifinals
 * Since 1993, 100% of champions made their conference tournament semis.
 * Modest boost to championship viability — not elimination if missing.
 *
 * @param {object} team - { slug }
 * @param {object} context - { confTournamentSemis: { [slug]: boolean } }
 * @returns {{ eligible: boolean|null, adjustment: number, flag: string|null }}
 */
export function checkConfTournamentSemis(team, context = {}) {
  const made = context.confTournamentSemis?.[team?.slug];
  if (made == null) return { eligible: null, adjustment: 0, flag: null };
  if (made) {
    return {
      eligible: true,
      adjustment: CHAMP_OVERLAY_WEIGHTS.confSemis,
      flag: 'madeConfSemis',
    };
  }
  return {
    eligible: false,
    adjustment: -CHAMP_OVERLAY_WEIGHTS.confSemis * 0.5,
    flag: 'missedConfSemis',
  };
}

/**
 * B. Week 6 AP Poll Top-12
 * 100% of champions since 2004 were Top 12 in the Week 6 AP Poll.
 * Captures sustained elite performance across the season.
 *
 * @param {object} team - { slug }
 * @param {object} context - { week6ApRank: { [slug]: number } }
 * @returns {{ eligible: boolean|null, adjustment: number, flag: string|null }}
 */
export function checkWeek6ApTop12(team, context = {}) {
  const rank = context.week6ApRank?.[team?.slug];
  if (rank == null) return { eligible: null, adjustment: 0, flag: null };
  if (rank <= 12) {
    return {
      eligible: true,
      adjustment: CHAMP_OVERLAY_WEIGHTS.week6Top12,
      flag: 'week6ApEligible',
    };
  }
  return {
    eligible: false,
    adjustment: -CHAMP_OVERLAY_WEIGHTS.week6Top12 * 0.4,
    flag: 'week6ApOutside',
  };
}

/**
 * C. KenPom Net Rating Threshold
 * Last 10 champions had a net rating >= +25.49.
 * Above threshold → boost. Below → mild penalty (NOT elimination).
 *
 * @param {object} team - { slug }
 * @param {object} context - { netRating: { [slug]: number } }
 * @returns {{ eligible: boolean|null, adjustment: number, flag: string|null, netRating: number|null }}
 */
export function checkKenpomNetRating(team, context = {}) {
  const nr = context.netRating?.[team?.slug];
  if (nr == null) return { eligible: null, adjustment: 0, flag: null, netRating: null };
  if (nr >= 25.49) {
    return {
      eligible: true,
      adjustment: CHAMP_OVERLAY_WEIGHTS.kenpomAbove,
      flag: 'kenpomEligible',
      netRating: nr,
    };
  }
  return {
    eligible: false,
    adjustment: CHAMP_OVERLAY_WEIGHTS.kenpomBelow,
    flag: 'kenpomBelow',
    netRating: nr,
  };
}

/**
 * Compute the full championship viability overlay for a team.
 * Returns a composable overlay object consumed by bracket simulation,
 * title odds, and final four probability.
 *
 * @param {object} team - { slug, seed }
 * @param {object} context - combined context with all data maps
 * @returns {ChampionshipOverlay}
 */
export function computeChampionshipOverlay(team, context = {}) {
  if (!team?.slug) {
    return {
      championshipScoreAdjustment: 0,
      madeConfSemis: null,
      week6ApEligible: null,
      kenpomEligible: null,
      championshipFlags: [],
      signals: [],
    };
  }

  const confSemis = checkConfTournamentSemis(team, context);
  const week6 = checkWeek6ApTop12(team, context);
  const kenpom = checkKenpomNetRating(team, context);

  const flags = [confSemis.flag, week6.flag, kenpom.flag].filter(Boolean);
  const positiveFlags = flags.filter(f =>
    f === 'madeConfSemis' || f === 'week6ApEligible' || f === 'kenpomEligible'
  );

  let adjustment = confSemis.adjustment + week6.adjustment + kenpom.adjustment;

  if (positiveFlags.length === 3) {
    adjustment += 0.015;
    flags.push('fullChampionshipProfile');
  } else if (positiveFlags.length === 2) {
    adjustment += 0.005;
  }

  adjustment = clamp(adjustment, -0.04, 0.10);

  const signals = [];
  if (positiveFlags.length === 3) {
    signals.push('Full championship profile: conf semis + Week 6 Top 12 + elite net rating');
  } else if (positiveFlags.length === 2) {
    signals.push(`Championship profile checks ${positiveFlags.length}/3 key boxes`);
  }
  if (kenpom.eligible && kenpom.netRating != null) {
    signals.push(`KenPom net rating +${kenpom.netRating.toFixed(1)} exceeds championship threshold`);
  }

  return {
    championshipScoreAdjustment: adjustment,
    madeConfSemis: confSemis.eligible,
    week6ApEligible: week6.eligible,
    kenpomEligible: kenpom.eligible,
    championshipFlags: flags,
    signals,
  };
}


// ══════════════════════════════════════════════════════════════════════════════
// LAYER 2 — MATCHUP REFINEMENT FEATURES
// ══════════════════════════════════════════════════════════════════════════════

/**
 * D. #4 Seed First-Round Trend
 * Last 3 years: 11-0 SU, 9-3 ATS in R64.
 * Light-to-moderate boost to #4 seeds in Round of 64 ONLY.
 * Short-sample trend → weakest weight class.
 *
 * @param {object} teamA - { seed }
 * @param {object} teamB - { seed }
 * @param {object} matchupMeta - { round }
 * @returns {{ seedTrendBoost: number, signal: string|null, appliesTo: string|null }}
 */
export function checkFourSeedR64Trend(teamA, teamB, matchupMeta = {}) {
  if (matchupMeta.round !== 1 && matchupMeta.round != null) {
    return { seedTrendBoost: 0, signal: null, appliesTo: null };
  }

  const aIsFour = teamA?.seed === 4 && teamB?.seed === 13;
  const bIsFour = teamB?.seed === 4 && teamA?.seed === 13;

  if (!aIsFour && !bIsFour) {
    return { seedTrendBoost: 0, signal: null, appliesTo: null };
  }

  const boost = 0.025;
  const favSlug = aIsFour ? teamA.slug : teamB.slug;
  return {
    seedTrendBoost: aIsFour ? boost : -boost,
    signal: '#4 seeds 11-0 SU, 9-3 ATS in R64 last 3 years',
    appliesTo: favSlug,
  };
}

/**
 * E. #8 vs #9 Small-Favorite Spread Penalty
 * When #8 seeds are favored by ≤3.5 points, they've been struggling badly.
 * Increase upset probability / danger zone weight for #9 seeds.
 *
 * @param {object} teamA - { seed, slug }
 * @param {object} teamB - { seed, slug }
 * @param {object} context - { spreads: { [slug]: number } }
 * @returns {{ smallFavoritePenalty: number, signal: string|null, appliesTo: string|null }}
 */
export function checkEightNineSpreadTrend(teamA, teamB, context = {}) {
  const aIsEight = teamA?.seed === 8 && teamB?.seed === 9;
  const bIsEight = teamB?.seed === 8 && teamA?.seed === 9;

  if (!aIsEight && !bIsEight) {
    return { smallFavoritePenalty: 0, signal: null, appliesTo: null };
  }

  const eightSeed = aIsEight ? teamA : teamB;
  const nineSeed = aIsEight ? teamB : teamA;

  const spread = context.spreads?.[eightSeed.slug];
  if (spread == null) {
    return { smallFavoritePenalty: 0, signal: null, appliesTo: null };
  }

  const eightIsFav = spread < 0;
  const spreadMag = Math.abs(spread);

  if (!eightIsFav || spreadMag > 3.5) {
    return { smallFavoritePenalty: 0, signal: null, appliesTo: null };
  }

  const penalty = spreadMag <= 2.0 ? 0.04 : 0.03;
  const direction = aIsEight ? -penalty : penalty;

  return {
    smallFavoritePenalty: direction,
    signal: `#8 seeds favored by ≤3.5 have struggled — danger zone for ${eightSeed.slug}`,
    appliesTo: nineSeed.slug,
  };
}

/**
 * F. Overachiever / Underachiever Profile
 * Teams outperforming roster expectations → small boost.
 * Teams underperforming → small penalty.
 * Most useful in toss-ups / dice rolls / upset edges.
 *
 * Uses the delta between preseason projected ranking and current performance
 * (via KenPom ranking or AP rank) as a proxy for over/underperformance.
 *
 * @param {object} team - { slug, seed }
 * @param {object} context - { preseasonRank, rankMap, kenpomOverall }
 * @returns {{ boost: number, profile: string|null, signal: string|null }}
 */
export function checkOverachieverProfile(team, context = {}) {
  if (!team?.slug) return { boost: 0, profile: null, signal: null };

  const preseason = context.preseasonRank?.[team.slug];
  const currentRank = context.rankMap?.[team.slug] ?? context.kenpomOverall?.[team.slug];

  if (preseason == null || currentRank == null) {
    return { boost: 0, profile: null, signal: null };
  }

  const delta = preseason - currentRank;

  if (delta >= 15) {
    return {
      boost: 0.025,
      profile: 'overachiever',
      signal: `Overachiever profile: preseason #${preseason} → current #${currentRank}`,
    };
  }
  if (delta >= 8) {
    return {
      boost: 0.015,
      profile: 'mild_overachiever',
      signal: `Outperforming preseason expectations (projected #${preseason})`,
    };
  }
  if (delta <= -15) {
    return {
      boost: -0.020,
      profile: 'underachiever',
      signal: `Underachiever profile: preseason #${preseason} → current #${currentRank}`,
    };
  }
  if (delta <= -8) {
    return {
      boost: -0.010,
      profile: 'mild_underachiever',
      signal: `Underperforming preseason expectations (projected #${preseason})`,
    };
  }

  return { boost: 0, profile: null, signal: null };
}

/**
 * Compute full matchup refinements for a game-level matchup.
 * Returns composable refinement data consumed by picks, upset radar,
 * danger zone logic, 5 Key Games, Game Intel, and IG content.
 *
 * @param {object} teamA - { slug, seed }
 * @param {object} teamB - { slug, seed }
 * @param {object} context - combined context
 * @param {object} [matchupMeta] - { round }
 * @returns {MatchupRefinements}
 */
export function computeMatchupRefinements(teamA, teamB, context = {}, matchupMeta = {}) {
  if (!teamA?.slug || !teamB?.slug) {
    return {
      totalAdjustment: 0,
      seedTrendBoost: 0,
      smallFavoritePenalty: 0,
      overachieverBoostA: 0,
      overachieverBoostB: 0,
      matchupFlags: [],
      signals: [],
    };
  }

  const fourSeed = checkFourSeedR64Trend(teamA, teamB, matchupMeta);
  const eightNine = checkEightNineSpreadTrend(teamA, teamB, context);
  const overA = checkOverachieverProfile(teamA, context);
  const overB = checkOverachieverProfile(teamB, context);

  const flags = [];
  const signals = [];

  if (fourSeed.signal) {
    flags.push('fourSeedR64Trend');
    signals.push(fourSeed.signal);
  }
  if (eightNine.signal) {
    flags.push('eightNineSmallFav');
    signals.push(eightNine.signal);
  }
  if (overA.profile) {
    flags.push(`teamA_${overA.profile}`);
    if (overA.signal) signals.push(overA.signal);
  }
  if (overB.profile) {
    flags.push(`teamB_${overB.profile}`);
    if (overB.signal) signals.push(`(Opp) ${overB.signal}`);
  }

  let totalAdjustment = fourSeed.seedTrendBoost
    + eightNine.smallFavoritePenalty
    + (overA.boost - overB.boost);

  totalAdjustment = clamp(totalAdjustment, -0.08, 0.08);

  return {
    totalAdjustment,
    seedTrendBoost: fourSeed.seedTrendBoost,
    smallFavoritePenalty: eightNine.smallFavoritePenalty,
    overachieverBoostA: overA.boost,
    overachieverBoostB: overB.boost,
    overachieverProfileA: overA.profile,
    overachieverProfileB: overB.profile,
    matchupFlags: flags,
    signals,
  };
}


// ══════════════════════════════════════════════════════════════════════════════
// CONVENIENCE: Combined heuristics for a matchup
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Compute both layers for a matchup. Returns the overlay + refinements
 * in a single structured object for downstream surfaces.
 *
 * @param {object} teamA
 * @param {object} teamB
 * @param {object} context
 * @param {object} [matchupMeta]
 * @returns {{ championshipOverlay: { a, b }, matchupRefinements }}
 */
export function computeFullHeuristics(teamA, teamB, context = {}, matchupMeta = {}) {
  return {
    championshipOverlay: {
      a: computeChampionshipOverlay(teamA, context),
      b: computeChampionshipOverlay(teamB, context),
    },
    matchupRefinements: computeMatchupRefinements(teamA, teamB, context, matchupMeta),
  };
}

/**
 * Pick the most relevant heuristic signal for editorial content.
 * Returns the single best signal string (or null) for IG captions,
 * rationale, or Game Intel — avoids spamming all signals.
 */
export function pickEditorialSignal(heuristics) {
  if (!heuristics) return null;

  const { championshipOverlay, matchupRefinements } = heuristics;

  const allSignals = [
    ...(matchupRefinements?.signals || []),
    ...(championshipOverlay?.a?.signals || []),
    ...(championshipOverlay?.b?.signals || []),
  ];

  if (allSignals.length === 0) return null;

  const prioritized = allSignals.find(s => s.includes('championship profile'))
    || allSignals.find(s => s.includes('danger zone'))
    || allSignals.find(s => s.includes('Overachiever') || s.includes('overachiever'))
    || allSignals.find(s => s.includes('net rating'))
    || allSignals[0];

  return prioritized || null;
}


// ══════════════════════════════════════════════════════════════════════════════
// MODULE METADATA
// ══════════════════════════════════════════════════════════════════════════════

export const TOURNAMENT_HEURISTICS_META = {
  version: '1.0.0',
  layers: {
    championshipOverlay: {
      signals: ['confTournamentSemis', 'week6ApTop12', 'kenpomNetRating'],
      appliesTo: ['bracketSimulation', 'titleOdds', 'finalFourProbability', 'bracketology'],
      maxAdjustment: 0.10,
    },
    matchupRefinements: {
      signals: ['fourSeedR64Trend', 'eightNineSmallFav', 'overachieverProfile'],
      appliesTo: ['maximusPicks', 'oddsInsights', 'gameIntel', 'upsetRadar', 'fiveKeyGames', 'igContent'],
      maxAdjustment: 0.08,
    },
  },
  weightingPhilosophy: [
    'Championship overlay > matchup refinements for title logic',
    'Matchup refinements < core model signals for game picks',
    'Short-sample trends (like #4 seed stat) get weakest weight',
    'Overachiever logic is subtle — tie-breaker, not driver',
    'No hard-coded decisions; no hard filters',
  ],
};
