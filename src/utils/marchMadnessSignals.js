/**
 * March Madness Intelligence Signals
 *
 * Additional heuristic signals for NCAA tournament bracket predictions.
 * These are blended into the existing model as weighted adjustments —
 * they influence probabilities and confidence tiers but NEVER override
 * the core model.
 *
 * Signal categories:
 *   1. Championship Profile (viability tiering)
 *   2. KenPom-style Efficiency (offense + defense)
 *   3. AP Poll / Ranking boost
 *   4. Pace vs Net Rating ("Trapezoid of Excellence")
 *   5. Record vs Tournament Teams
 *   6. Seed-based Upset Logic (conditional heuristics)
 */

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

// ─── 1. Championship Profile Viability ──────────────────────────────────────

const CHAMPIONSHIP_TIER_WEIGHTS = {
  tier1: 0.06,
  tier2: 0.03,
  tier3: 0.01,
  none: 0,
};

/**
 * Compute a championship viability score.
 * Tier 1: Top 3 seed + Top 2 conference finish + Top 21 offense + Top 44 defense
 * Tier 2: Misses one category
 * Tier 3: Misses two categories
 *
 * Returns { tier, score, flags }
 */
export function getChampionshipViability(team, context = {}) {
  if (!team) return { tier: 'none', score: 0, flags: [] };

  const flags = [];
  let weaknesses = 0;

  const seed = team.seed ?? 16;
  if (seed <= 3) {
    flags.push('top3seed');
  } else {
    weaknesses++;
  }

  const confFinish = context.conferenceFinish?.[team.slug];
  if (confFinish != null && confFinish <= 2) {
    flags.push('confTop2');
  } else if (confFinish == null && seed <= 2) {
    flags.push('confTop2_inferred');
  } else {
    weaknesses++;
  }

  const offRank = context.kenpomOffense?.[team.slug];
  if (offRank != null && offRank <= 21) {
    flags.push('topOffense');
  } else {
    weaknesses++;
  }

  const defRank = context.kenpomDefense?.[team.slug];
  if (defRank != null && defRank <= 44) {
    flags.push('topDefense');
  } else {
    weaknesses++;
  }

  let tier;
  if (weaknesses === 0) tier = 'tier1';
  else if (weaknesses === 1) tier = 'tier2';
  else if (weaknesses === 2) tier = 'tier3';
  else tier = 'none';

  return {
    tier,
    score: CHAMPIONSHIP_TIER_WEIGHTS[tier],
    flags,
  };
}

// ─── 2. KenPom-style Efficiency ─────────────────────────────────────────────

/**
 * Compute an efficiency boost based on KenPom-style offensive and defensive rankings.
 * Strong boost if BOTH offense Top 25 + defense Top 40.
 * Moderate boost if one qualifies.
 */
export function getEfficiencyBoost(team, context = {}) {
  if (!team?.slug) return { boost: 0, signals: [] };

  const offRank = context.kenpomOffense?.[team.slug] ?? null;
  const defRank = context.kenpomDefense?.[team.slug] ?? null;
  const signals = [];

  const topOffense = offRank != null && offRank <= 25;
  const topDefense = defRank != null && defRank <= 40;

  if (topOffense && topDefense) {
    signals.push(`Elite two-way efficiency (Off #${offRank}, Def #${defRank})`);
    return { boost: 0.05, signals };
  }
  if (topOffense) {
    signals.push(`Top 25 offensive efficiency (#${offRank})`);
    return { boost: 0.025, signals };
  }
  if (topDefense) {
    signals.push(`Top 40 defensive efficiency (#${defRank})`);
    return { boost: 0.02, signals };
  }
  return { boost: 0, signals };
}

// ─── 3. AP Poll / Ranking Boost ─────────────────────────────────────────────

/**
 * Teams ranked Top 10–12 in the AP poll during the season get a small boost.
 * This captures teams that sustained high performance across the season.
 */
export function getAPRankingBoost(team, context = {}) {
  const rank = context.rankMap?.[team?.slug] ?? null;
  if (rank == null) return { boost: 0, signal: null };

  if (rank <= 5) return { boost: 0.04, signal: `Top 5 AP ranking (#${rank})` };
  if (rank <= 10) return { boost: 0.03, signal: `Top 10 AP ranking (#${rank})` };
  if (rank <= 12) return { boost: 0.02, signal: `Top 12 AP ranking (#${rank})` };
  if (rank <= 25) return { boost: 0.01, signal: `AP ranked (#${rank})` };
  return { boost: 0, signal: null };
}

// ─── 4. Pace vs Net Rating ("Trapezoid of Excellence") ──────────────────────

/**
 * Teams in the "Trapezoid of Excellence" — high net rating with mid-tempo
 * adaptability — get a boost. Teams with extreme pace + weak net rating
 * get penalized.
 *
 * netRating: adjusted for opponent (higher = better, typically -10 to +35)
 * pace: possessions per 40 min (typically 63–73)
 */
export function getTrapezoidScore(team, context = {}) {
  const netRating = context.netRating?.[team?.slug] ?? null;
  const pace = context.pace?.[team?.slug] ?? null;

  if (netRating == null) return { score: 0, zone: null, signal: null };

  const midTempo = pace != null && pace >= 65 && pace <= 70;
  const fastPace = pace != null && pace > 70;
  const slowPace = pace != null && pace < 65;

  if (netRating >= 25) {
    if (midTempo) return { score: 0.05, zone: 'elite', signal: 'Trapezoid of Excellence: elite net rating + mid-tempo adaptability' };
    if (fastPace || slowPace) return { score: 0.03, zone: 'contender', signal: 'Strong net rating, pace-dependent style' };
    return { score: 0.04, zone: 'contender', signal: 'Elite net rating' };
  }

  if (netRating >= 15) {
    if (midTempo) return { score: 0.03, zone: 'contender', signal: 'Trapezoid contender: strong net rating + adaptable tempo' };
    return { score: 0.02, zone: 'solid', signal: 'Above-average net rating' };
  }

  if (netRating >= 5) {
    return { score: 0.01, zone: 'average', signal: null };
  }

  if (netRating < 0 && fastPace) {
    return { score: -0.02, zone: 'vulnerable', signal: 'Weak net rating with extreme pace — vulnerable in tournament setting' };
  }

  if (netRating < 0) {
    return { score: -0.01, zone: 'weak', signal: null };
  }

  return { score: 0, zone: 'neutral', signal: null };
}

// ─── 5. Record vs Tournament Teams ──────────────────────────────────────────

/**
 * Teams with strong records against other tournament teams get a boost.
 * Teams with weak records get downgraded.
 *
 * tournamentRecord: { wins, losses } against tournament field teams
 */
export function getTournamentRecordBoost(team, context = {}) {
  const rec = context.tournamentRecord?.[team?.slug];
  if (!rec || rec.wins == null || rec.losses == null) return { boost: 0, signal: null };

  const total = rec.wins + rec.losses;
  if (total < 3) return { boost: 0, signal: null };

  const winPct = rec.wins / total;

  if (winPct >= 0.75) {
    return { boost: 0.04, signal: `Dominant vs tournament field (${rec.wins}-${rec.losses})` };
  }
  if (winPct >= 0.60) {
    return { boost: 0.025, signal: `Strong record vs tournament teams (${rec.wins}-${rec.losses})` };
  }
  if (winPct >= 0.50) {
    return { boost: 0.01, signal: null };
  }
  if (winPct < 0.35 && total >= 5) {
    return { boost: -0.025, signal: `Weak record vs tournament teams (${rec.wins}-${rec.losses})` };
  }
  return { boost: 0, signal: null };
}

// ─── 6. Conditional Upset Heuristics ────────────────────────────────────────

const UPSET_BASELINE_RATES = {
  '10_7': 0.39,
  '11_6': 0.48,
  '12_5': 0.41,
  '13_4': 0.22,
};

/**
 * 7A: 10 vs 7 Upset Rule
 * Boost 10-seed if: KenPom Top 50, Adj DE Top 50, and 7-seed Barthag outside Top 15
 */
function check10v7Upset(underdog, favorite, context) {
  if (underdog.seed !== 10 || favorite.seed !== 7) return null;

  const kenpomRank = context.kenpomOverall?.[underdog.slug];
  const adjDE = context.kenpomDefense?.[underdog.slug];
  const favBarthag = context.barthag?.[favorite.slug];

  const underdogQualifies = (
    (kenpomRank != null && kenpomRank <= 50) &&
    (adjDE != null && adjDE <= 50)
  );
  const favoriteVulnerable = favBarthag != null && favBarthag > 15;

  if (underdogQualifies && favoriteVulnerable) {
    return {
      type: '10v7',
      boost: 0.06,
      confidence: 'dice_roll',
      signal: `10-seed upset trigger: KenPom ${kenpomRank}, Def ${adjDE} vs 7-seed Barthag ${favBarthag}`,
      baseline: UPSET_BASELINE_RATES['10_7'],
    };
  }

  if (underdogQualifies || favoriteVulnerable) {
    return {
      type: '10v7',
      boost: 0.03,
      confidence: null,
      signal: '10-seed partial upset profile',
      baseline: UPSET_BASELINE_RATES['10_7'],
    };
  }

  return null;
}

/**
 * 7B: 11 vs 6 Upset Rule
 * Boost 11-seed if: Adj DE Top 100, Close Game Rank Top 100, and 6-seed Barthag outside Top 15
 */
function check11v6Upset(underdog, favorite, context) {
  if (underdog.seed !== 11 || favorite.seed !== 6) return null;

  const adjDE = context.kenpomDefense?.[underdog.slug];
  const closeGameRank = context.closeGameRank?.[underdog.slug];
  const favBarthag = context.barthag?.[favorite.slug];

  const underdogQualifies = (
    (adjDE != null && adjDE <= 100) &&
    (closeGameRank != null && closeGameRank <= 100)
  );
  const favoriteVulnerable = favBarthag != null && favBarthag > 15;

  if (underdogQualifies && favoriteVulnerable) {
    return {
      type: '11v6',
      boost: 0.07,
      confidence: 'upset_special',
      signal: `11-seed upset trigger: Def ${adjDE}, Close Games ${closeGameRank} vs 6-seed Barthag ${favBarthag}`,
      baseline: UPSET_BASELINE_RATES['11_6'],
    };
  }

  if (underdogQualifies || favoriteVulnerable) {
    return {
      type: '11v6',
      boost: 0.035,
      confidence: null,
      signal: '11-seed partial upset profile',
      baseline: UPSET_BASELINE_RATES['11_6'],
    };
  }

  return null;
}

/**
 * 7C: 12 vs 5 Upset Rule
 * Boost 12-seed if: Adj OE Top 100, WAB >= -2, and 5-seed SOS outside Top 25
 */
function check12v5Upset(underdog, favorite, context) {
  if (underdog.seed !== 12 || favorite.seed !== 5) return null;

  const adjOE = context.kenpomOffense?.[underdog.slug];
  const wab = context.wab?.[underdog.slug];
  const favSOS = context.sos?.[favorite.slug];

  const underdogQualifies = (
    (adjOE != null && adjOE <= 100) &&
    (wab != null && wab >= -2)
  );
  const favoriteVulnerable = favSOS != null && favSOS > 25;

  if (underdogQualifies && favoriteVulnerable) {
    return {
      type: '12v5',
      boost: 0.06,
      confidence: 'dice_roll',
      signal: `12-seed upset trigger: Off ${adjOE}, WAB ${wab > 0 ? '+' : ''}${wab.toFixed(1)} vs 5-seed SOS ${favSOS}`,
      baseline: UPSET_BASELINE_RATES['12_5'],
    };
  }

  if (underdogQualifies || favoriteVulnerable) {
    return {
      type: '12v5',
      boost: 0.03,
      confidence: null,
      signal: '12-seed partial upset profile',
      baseline: UPSET_BASELINE_RATES['12_5'],
    };
  }

  return null;
}

/**
 * 7D: General 13 vs 4 Upset Rule
 * Boost 13-seed if: Barthag Top 100 and 4-seed Barthag outside Top 15 + 3+ non-con losses
 */
function check13v4Upset(underdog, favorite, context) {
  if (underdog.seed !== 13 || favorite.seed !== 4) return null;

  const underdogBarthag = context.barthag?.[underdog.slug];
  const favBarthag = context.barthag?.[favorite.slug];
  const favNonConLosses = context.nonConLosses?.[favorite.slug];

  const underdogQualifies = underdogBarthag != null && underdogBarthag <= 100;
  const favoriteVulnerable = (
    (favBarthag != null && favBarthag > 15) &&
    (favNonConLosses != null && favNonConLosses >= 3)
  );

  if (underdogQualifies && favoriteVulnerable) {
    return {
      type: '13v4',
      boost: 0.055,
      confidence: 'upset_special',
      signal: `13-seed upset trigger: Barthag ${underdogBarthag} vs 4-seed Barthag ${favBarthag}, ${favNonConLosses} non-con L`,
      baseline: UPSET_BASELINE_RATES['13_4'],
    };
  }

  if (underdogQualifies || favoriteVulnerable) {
    return {
      type: '13v4',
      boost: 0.025,
      confidence: null,
      signal: '13-seed partial upset profile',
      baseline: UPSET_BASELINE_RATES['13_4'],
    };
  }

  return null;
}

/**
 * Run all conditional upset checks for a matchup.
 * Returns the strongest applicable trigger, or null.
 */
export function checkUpsetHeuristics(teamA, teamB, context = {}) {
  const aIsUnderdog = (teamA.seed ?? 8) > (teamB.seed ?? 9);
  const underdog = aIsUnderdog ? teamA : teamB;
  const favorite = aIsUnderdog ? teamB : teamA;

  const checks = [
    check10v7Upset(underdog, favorite, context),
    check11v6Upset(underdog, favorite, context),
    check12v5Upset(underdog, favorite, context),
    check13v4Upset(underdog, favorite, context),
  ];

  const validChecks = checks.filter(Boolean);
  if (validChecks.length === 0) return null;

  return validChecks.reduce((best, c) => (c.boost > best.boost ? c : best));
}

// ─── Composite Signal Aggregator ────────────────────────────────────────────

const MAX_UPSET_COUNT_R1 = 5;

/**
 * Compute all March Madness signals for a single team.
 * Returns { totalBoost, signals[], champViability, upsetTrigger? }
 */
export function computeTeamSignals(team, context = {}) {
  const champ = getChampionshipViability(team, context);
  const eff = getEfficiencyBoost(team, context);
  const ap = getAPRankingBoost(team, context);
  const trap = getTrapezoidScore(team, context);
  const tournRec = getTournamentRecordBoost(team, context);

  const totalBoost = champ.score + eff.boost + ap.boost + trap.score + tournRec.boost;

  const signals = [];
  if (champ.tier !== 'none') {
    const tierLabel = { tier1: 'Championship Tier 1', tier2: 'Championship Tier 2', tier3: 'Championship Tier 3' }[champ.tier];
    signals.push(tierLabel);
  }
  signals.push(...eff.signals);
  if (ap.signal) signals.push(ap.signal);
  if (trap.signal) signals.push(trap.signal);
  if (tournRec.signal) signals.push(tournRec.signal);

  return { totalBoost, signals, champViability: champ };
}

/**
 * Compute the full matchup adjustment from March Madness signals.
 * Returns { adjustment, signals[], confidenceModifier, upsetTrigger? }
 *
 * adjustment: positive = favors teamA, negative = favors teamB
 */
export function computeMatchupSignals(teamA, teamB, context = {}) {
  const sigA = computeTeamSignals(teamA, context);
  const sigB = computeTeamSignals(teamB, context);

  let adjustment = sigA.totalBoost - sigB.totalBoost;
  const signals = [];
  const allSignals = [...sigA.signals, ...sigB.signals.map(s => `(Opp) ${s}`)];

  const upsetTrigger = checkUpsetHeuristics(teamA, teamB, context);
  let confidenceModifier = null;

  if (upsetTrigger) {
    const aIsUnderdog = (teamA.seed ?? 8) > (teamB.seed ?? 9);
    adjustment += aIsUnderdog ? upsetTrigger.boost : -upsetTrigger.boost;
    signals.push(upsetTrigger.signal);
    if (upsetTrigger.confidence) {
      confidenceModifier = upsetTrigger.confidence;
    }
  }

  for (const s of allSignals) {
    if (s && !signals.includes(s)) signals.push(s);
  }

  adjustment = clamp(adjustment, -0.15, 0.15);

  return {
    adjustment,
    signals,
    confidenceModifier,
    upsetTrigger,
    teamASignals: sigA,
    teamBSignals: sigB,
  };
}

/**
 * 7D: Upset clustering guard.
 * After resolving a round, cap total upsets to prevent unrealistic brackets.
 *
 * @param {object[]} roundResults - array of matchup results with { isUpset, upsetTrigger }
 * @param {number} maxUpsets - maximum allowed upsets in this round
 * @returns {object[]} - same array with excess upsets reverted to chalk
 */
export function enforceUpsetCap(roundResults, maxUpsets = MAX_UPSET_COUNT_R1) {
  const upsets = roundResults
    .map((r, i) => ({ ...r, _idx: i }))
    .filter(r => r.isUpset)
    .sort((a, b) => {
      const aConf = a.upsetTrigger ? 1 : 0;
      const bConf = b.upsetTrigger ? 1 : 0;
      if (bConf !== aConf) return bConf - aConf;
      return (b.edgeMagnitude ?? 0) - (a.edgeMagnitude ?? 0);
    });

  if (upsets.length <= maxUpsets) return roundResults;

  const keepIndices = new Set(upsets.slice(0, maxUpsets).map(u => u._idx));
  return roundResults.map((r, i) => {
    if (r.isUpset && !keepIndices.has(i)) {
      return {
        ...r,
        _upsetCapped: true,
        _originalWinner: r.winner,
        winner: r.loser,
        loser: r._originalWinner ?? r.winner,
        isUpset: false,
        signals: [...(r.signals || []), 'Upset capped — bracket realism guard'],
      };
    }
    return r;
  });
}

export const MARCH_MADNESS_SIGNALS_META = {
  version: '1.1.0',
  signalCategories: [
    'Championship Profile',
    'KenPom Efficiency',
    'AP Ranking Boost',
    'Trapezoid of Excellence',
    'Tournament Record',
    'Conditional Upset Heuristics',
  ],
  additionalLayers: [
    'Championship Viability Overlay (tournamentHeuristics.js)',
    'Matchup Refinement Features (tournamentHeuristics.js)',
  ],
  philosophy: 'Weighted ensemble — signals adjust probabilities, never override core model. ' +
    'Additional heuristic layers provide additive priors separated into macro (championship) ' +
    'and micro (matchup) levels.',
  maxSingleSignalImpact: 0.07,
  maxTotalImpact: 0.15,
};
