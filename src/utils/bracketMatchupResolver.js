/**
 * Bracket Matchup Resolver — adapter for Maximus Pick 'Em model logic.
 *
 * Runs bracket matchups through the same core signal pipeline used by
 * Pick 'Em predictions. Uses a seed-based historical prior as the
 * BASELINE, then adjusts with team-specific enrichment signals
 * (rankings, championship odds, ATS, record, SOS).
 *
 * Enrichment signals differentiate teams WITHIN the same seed band —
 * a strong 3-seed gets a higher probability than a weaker 3-seed.
 *
 * Includes a tournament-history prior layer for calibrating upset
 * frequency in historically volatile seed bands.
 */

import { getTournamentPrior } from './tournamentPrior.js';
import { computeMatchupSignals } from './marchMadnessSignals.js';
import { computeChampionshipOverlay, computeMatchupRefinements } from './tournamentHeuristics.js';

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

// ── Seed-based win rates (historical Round-of-64 data) ───────────
const SEED_WIN_RATE = {
  '1_16': 0.98, '2_15': 0.92, '3_14': 0.85, '4_13': 0.78,
  '5_12': 0.64, '6_11': 0.63, '7_10': 0.60, '8_9': 0.51,
};

function seedBaselineProb(seedA, seedB) {
  if (seedA == null || seedB == null) return 0.5;
  const fav = Math.min(seedA, seedB);
  const dog = Math.max(seedA, seedB);
  const key = `${fav}_${dog}`;
  let rate = SEED_WIN_RATE[key] ?? null;
  if (rate == null) {
    const gap = dog - fav;
    if (gap >= 12) rate = 0.95;
    else if (gap >= 8) rate = 0.82;
    else if (gap >= 5) rate = 0.70;
    else if (gap >= 3) rate = 0.62;
    else rate = 0.55;
  }
  return seedA <= seedB ? rate : 1 - rate;
}

// ── Signal extraction functions ──────────────────────────────────

function rankSignal(rank) {
  if (rank == null || rank <= 0) return null;
  return clamp(1 - (rank - 1) / 45, 0.20, 0.98);
}

function champOddsSignal(americanOdds) {
  if (americanOdds == null) return null;
  const implied = americanOdds > 0
    ? 100 / (americanOdds + 100)
    : Math.abs(americanOdds) / (Math.abs(americanOdds) + 100);
  return clamp(implied * 2.0, 0.05, 0.90);
}

function recordWinPct(record) {
  if (!record) return null;
  const m = record.match(/(\d+)-(\d+)/);
  if (!m) return null;
  const w = parseInt(m[1], 10), l = parseInt(m[2], 10);
  return w + l > 0 ? w / (w + l) : null;
}

function coverPctSignal(coverPct) {
  if (coverPct == null) return null;
  return clamp(coverPct / 100, 0.25, 0.75);
}

// Granular conference strength (replaces binary power/non-power)
const CONFERENCE_STRENGTH = {
  'SEC': 0.72, 'Big Ten': 0.70, 'Big 12': 0.69, 'ACC': 0.67,
  'Big East': 0.62, 'Pac-12': 0.55, 'Mountain West': 0.50,
  'WCC': 0.48, 'AAC': 0.47, 'A-10': 0.45, 'MVC': 0.44,
  'CAA': 0.42, 'MAAC': 0.40, 'Horizon': 0.40, 'SoCon': 0.39,
  'Summit': 0.38, 'Ivy': 0.38, 'Patriot': 0.37, 'MEAC': 0.32,
  'SWAC': 0.32, 'NEC': 0.33, 'Southland': 0.34,
};

function confStrengthScore(conf) {
  if (!conf) return 0.40;
  return CONFERENCE_STRENGTH[conf] ?? 0.40;
}

/**
 * Resolve a single bracket matchup between two teams.
 *
 * Architecture: seed-based baseline + team-specific enrichment adjustments.
 * This ensures same-seed-band matchups get DIFFERENT probabilities based
 * on actual team quality indicators.
 *
 * @param {{ name, slug, seed, record?, conference? }} teamA
 * @param {{ name, slug, seed, record?, conference? }} teamB
 * @param {object} context — enrichment data from model pipeline
 * @param {object} context.rankMap — slug → AP rank
 * @param {object} context.championshipOdds — slug → { american }
 * @param {object} context.atsBySlug — slug → { season, last30, last7 }
 * @param {object} [matchupMeta] — optional bracket context
 * @param {number} [matchupMeta.round] — tournament round (1–6)
 * @returns {{ winner, loser, confidence, confidenceLabel, signals, rationale, isUpset, winProbability, tournamentPrior }}
 */
export function resolveBracketMatchup(teamA, teamB, context = {}, matchupMeta = {}) {
  const { rankMap = {}, championshipOdds = {}, atsBySlug = {} } = context;

  if (!teamA?.slug || !teamB?.slug) {
    return {
      winner: teamA, loser: teamB,
      confidence: 0, confidenceLabel: 'LOW',
      signals: ['Insufficient data — defaulting to higher seed'],
      rationale: 'Not enough data to make a model-driven prediction.',
      isUpset: false,
      tournamentPrior: null,
    };
  }

  const slugA = teamA.slug;
  const slugB = teamB.slug;

  // ── 1. Seed-based baseline ─────────────────────────────────────
  // Historical win rate for this seed pairing, oriented as P(A wins).
  const seedProb = seedBaselineProb(teamA.seed, teamB.seed);

  // ── 2. Gather team-specific enrichment signals ─────────────────
  // Each signal measures relative strength: positive delta = A stronger.
  const rankA = rankMap[slugA] ?? null;
  const rankB = rankMap[slugB] ?? null;
  const champA = championshipOdds[slugA]?.american ?? null;
  const champB = championshipOdds[slugB]?.american ?? null;
  const atsA = getBestCoverPct(atsBySlug[slugA]);
  const atsB = getBestCoverPct(atsBySlug[slugB]);
  const recA = recordWinPct(teamA.record);
  const recB = recordWinPct(teamB.record);

  // For close seed matchups the seed baseline is near-useless, so amplify
  // whatever team-quality signals are available.
  const prelimSeedGap = Math.abs((teamA.seed ?? 8) - (teamB.seed ?? 9));
  const enrichAmp = prelimSeedGap <= 1 ? 3.0
                  : prelimSeedGap <= 3 ? 2.0
                  : 1.0;

  let enrichDelta = 0;
  let enrichCount = 0;
  const activeSignals = [];

  // Ranking signal — AP rank provides strong team-quality differentiation
  if (rankA != null || rankB != null) {
    const sigA = rankSignal(rankA) ?? 0.30;
    const sigB = rankSignal(rankB) ?? 0.30;
    enrichDelta += (sigA - sigB) * 0.30 * enrichAmp;
    enrichCount++;
    activeSignals.push({ type: 'ranking', valA: rankA, valB: rankB, delta: sigA - sigB });
  }

  // Championship odds — market-implied title strength
  if (champA != null || champB != null) {
    const sigA = champOddsSignal(champA) ?? 0.06;
    const sigB = champOddsSignal(champB) ?? 0.06;
    enrichDelta += (sigA - sigB) * 0.25 * enrichAmp;
    enrichCount++;
    activeSignals.push({ type: 'championship', valA: champA, valB: champB, delta: sigA - sigB });
  }

  // ATS performance — cover consistency and market-beating form
  if (atsA != null || atsB != null) {
    const sigA = coverPctSignal(atsA) ?? 0.50;
    const sigB = coverPctSignal(atsB) ?? 0.50;
    enrichDelta += (sigA - sigB) * 0.20 * enrichAmp;
    enrichCount++;
    activeSignals.push({ type: 'ats', valA: atsA, valB: atsB, delta: sigA - sigB });
  }

  // Season record — overall win percentage from PROJECTED_FIELD
  if (recA != null || recB != null) {
    const vA = recA ?? 0.50;
    const vB = recB ?? 0.50;
    enrichDelta += (vA - vB) * 0.15 * enrichAmp;
    enrichCount++;
    activeSignals.push({ type: 'record', valA: teamA.record, valB: teamB.record, delta: vA - vB });
  }

  // Conference strength — granular scale for better same-band differentiation
  const confA = confStrengthScore(teamA.conference);
  const confB = confStrengthScore(teamB.conference);

  // For close seed matchups (gap ≤ 3) the seed baseline is nearly
  // uninformative, so amplify whatever enrichment signals exist.
  const seedGap = Math.abs((teamA.seed ?? 8) - (teamB.seed ?? 9));
  const closeMatchup = seedGap <= 3;
  const confWeight = closeMatchup ? 0.25 : 0.10;
  enrichDelta += (confA - confB) * confWeight;

  // ── 3. Blend seed baseline with enrichment ─────────────────────
  const seedEdge = seedProb - 0.5;
  let seedWeight = enrichCount >= 3 ? 0.35
                 : enrichCount >= 2 ? 0.50
                 : enrichCount >= 1 ? 0.65
                 : 0.90;

  if (closeMatchup && enrichCount >= 1) {
    seedWeight = Math.min(seedWeight, 0.25);
  }

  let edge = seedEdge * seedWeight + enrichDelta;

  // ── 4. March Madness intelligence signals (weighted ensemble) ──
  const mmSignals = computeMatchupSignals(teamA, teamB, context);
  const MM_SIGNAL_WEIGHT = 0.60;
  edge += mmSignals.adjustment * MM_SIGNAL_WEIGHT;

  // ── 4b. Tournament heuristics (additive priors) ────────────────
  const champOverlayA = computeChampionshipOverlay(teamA, context);
  const champOverlayB = computeChampionshipOverlay(teamB, context);
  const matchupRefine = computeMatchupRefinements(teamA, teamB, context, matchupMeta);

  // Championship overlay: affects bracket simulation / title path more heavily
  // in later rounds; light touch in early rounds
  const round = matchupMeta.round ?? 1;
  const champWeight = round >= 5 ? 0.80 : round >= 3 ? 0.50 : 0.25;
  const champDelta = (champOverlayA.championshipScoreAdjustment - champOverlayB.championshipScoreAdjustment) * champWeight;
  edge += champDelta;

  // Matchup refinements: light nudges, especially valuable when edge is small
  const refineWeight = Math.abs(edge) < 0.08 ? 0.50 : 0.25;
  edge += matchupRefine.totalAdjustment * refineWeight;

  // ── 5. Tournament history prior (calibration layer) ────────────
  const mainEdgeMag = Math.abs(edge);
  let tournamentPriorResult = null;
  if (matchupMeta.round != null && teamA.seed != null && teamB.seed != null) {
    tournamentPriorResult = getTournamentPrior(
      teamA.seed, teamB.seed, matchupMeta.round, mainEdgeMag,
    );

    if (tournamentPriorResult.applied && tournamentPriorResult.adjustment > 0) {
      const aIsUnderdog = teamA.seed > teamB.seed;
      const adj = tournamentPriorResult.adjustment;
      if (aIsUnderdog) {
        edge += adj;
      } else {
        edge -= adj;
      }
    }
  }

  // ── 6. Final outputs ───────────────────────────────────────────
  const edgeMag = Math.abs(edge);
  const pickA = edge >= 0;
  const winProb = clamp(0.5 + edgeMag, 0.51, 0.97);

  let confidence = 0;
  if (edgeMag >= 0.20) confidence = 2;
  else if (edgeMag >= 0.10) confidence = 1;

  if (teamA.seed != null && teamB.seed != null) {
    const seedGap = Math.abs(teamA.seed - teamB.seed);
    if (seedGap >= 10 && confidence < 2 && edgeMag >= 0.15) confidence = 2;
  }

  if (enrichCount === 0 && edgeMag < 0.15) confidence = Math.min(confidence, 1);

  const winner = pickA ? teamA : teamB;
  const loser = pickA ? teamB : teamA;
  const isUpset = winner.seed != null && loser.seed != null && winner.seed > loser.seed;

  // ── 7. Bracket confidence tier classification ──────────────────
  // Maps to: high_conviction, lean, dice_roll, upset_special
  let bracketTier = 'lean';
  if (mmSignals.confidenceModifier) {
    bracketTier = mmSignals.confidenceModifier;
  } else if (isUpset && edgeMag < 0.08) {
    bracketTier = 'upset_special';
  } else if (confidence >= 2 && edgeMag >= 0.18 && !isUpset) {
    bracketTier = 'high_conviction';
  } else if (confidence >= 2) {
    bracketTier = 'high_conviction';
  } else if (edgeMag < 0.06 || (isUpset && edgeMag < 0.12)) {
    bracketTier = 'dice_roll';
  }

  const spreadLean = edgeMag > 0.03 ? (pickA ? 'A' : 'B') : null;
  const totalLean = null;

  const signals = buildSignals(winner, loser, {
    rankMap, championshipOdds,
    atsA: pickA ? atsA : atsB, atsB: pickA ? atsB : atsA,
    winnerRank: pickA ? rankA : rankB, loserRank: pickA ? rankB : rankA,
    winnerChamp: pickA ? champA : champB, loserChamp: pickA ? champB : champA,
    winnerRec: pickA ? teamA.record : teamB.record,
    loserRec: pickA ? teamB.record : teamA.record,
    winnerConf: pickA ? teamA.conference : teamB.conference,
    loserConf: pickA ? teamB.conference : teamA.conference,
    tournamentPrior: tournamentPriorResult,
    enrichCount,
    mmSignals: mmSignals.signals,
    heuristicSignals: matchupRefine.signals,
    champSignals: [
      ...(pickA ? champOverlayA.signals : champOverlayB.signals),
      ...(pickA ? champOverlayB.signals : champOverlayA.signals).map(s => `(Opp) ${s}`),
    ],
  });

  const confLabel = confidence >= 2 ? 'HIGH' : confidence >= 1 ? 'MEDIUM' : 'LOW';

  const BRACKET_TIER_LABELS = {
    high_conviction: 'High Conviction',
    lean: 'Lean',
    dice_roll: 'Dice Roll',
    upset_special: 'Upset Pick',
  };

  const rationale = buildRationale(winner, loser, {
    confidence, confLabel, edgeMag, enrichCount, isUpset,
    winnerRank: pickA ? rankA : rankB, loserRank: pickA ? rankB : rankA,
    winnerChamp: pickA ? champA : champB,
    winnerAts: pickA ? atsA : atsB,
    winnerRec: pickA ? teamA.record : teamB.record,
    loserRec: pickA ? teamB.record : teamA.record,
    winnerConf: pickA ? teamA.conference : teamB.conference,
    tournamentPrior: tournamentPriorResult,
    activeSignals,
    seedProb,
    bracketTier,
    mmSignals,
    heuristics: { champOverlayA, champOverlayB, matchupRefine },
  });

  return {
    winner, loser, confidence, confidenceLabel: confLabel,
    signals, rationale, isUpset,
    edgeMagnitude: edgeMag, enrichmentCount: enrichCount,
    winProbability: winProb,
    tournamentPrior: tournamentPriorResult,
    bracketTier,
    bracketTierLabel: BRACKET_TIER_LABELS[bracketTier] || 'Lean',
    spreadLean,
    totalLean,
    upsetTrigger: mmSignals.upsetTrigger || null,
    marchMadnessSignals: mmSignals,
    heuristics: {
      championshipOverlay: { a: champOverlayA, b: champOverlayB },
      matchupRefinements: matchupRefine,
    },
  };
}

/**
 * Dev-only: warn when a batch of distinct matchups all resolve to the
 * same probability. Indicates missing enrichment data or a model bug.
 */
export function warnUniformBatch(results, label = 'batch') {
  if (process.env.NODE_ENV !== 'development' || !results || results.length < 2) return;
  const probs = results.map(r => Math.round((r.winProbability ?? 0.5) * 100));
  const allSame = probs.every(p => p === probs[0]);
  if (allSame) {
    console.warn(
      `[Maximus] Uniform probability detected in ${label}: all ${results.length} matchups resolved to ${probs[0]}%. ` +
      `Enrichment counts: [${results.map(r => r.enrichmentCount ?? '?').join(', ')}]`,
    );
  }
}

/**
 * Batch-resolve an entire bracket: for each matchup, predict the winner.
 * Iteratively resolves round by round, building the full bracket after each.
 */
export function resolveFullBracket(bracket, context, buildFullBracketFn) {
  const picks = {};
  const predictions = {};

  if (!bracket?.regions) return { picks, predictions };

  for (const region of bracket.regions) {
    for (const matchup of region.matchups) {
      if (!matchup.topTeam?.slug || !matchup.bottomTeam?.slug) continue;
      if (matchup.topTeam.isPlaceholder || matchup.bottomTeam.isPlaceholder) continue;

      const result = resolveBracketMatchup(
        matchup.topTeam, matchup.bottomTeam, context,
        { round: matchup.round || 1 },
      );
      const pickId = result.winner === matchup.topTeam ? 'top' : 'bottom';
      picks[matchup.matchupId] = pickId;
      predictions[matchup.matchupId] = result;
    }
  }

  if (!buildFullBracketFn) return { picks, predictions };

  for (let round = 2; round <= 6; round++) {
    const allMatchups = buildFullBracketFn(bracket.regions, picks);
    const roundMatchups = Object.values(allMatchups).filter(m => m.round === round);
    for (const matchup of roundMatchups) {
      if (!matchup.topTeam?.slug || !matchup.bottomTeam?.slug) continue;
      if (picks[matchup.matchupId]) continue;

      const result = resolveBracketMatchup(
        matchup.topTeam, matchup.bottomTeam, context,
        { round: matchup.round || round },
      );
      const pickId = result.winner === matchup.topTeam ? 'top' : 'bottom';
      picks[matchup.matchupId] = pickId;
      predictions[matchup.matchupId] = result;
    }
  }

  return { picks, predictions };
}

function getBestCoverPct(atsEntry) {
  if (!atsEntry) return null;
  for (const key of ['last30', 'season', 'last7']) {
    const rec = atsEntry[key];
    if (rec && rec.total > 0 && rec.coverPct != null) return rec.coverPct;
  }
  return null;
}

function buildSignals(winner, loser, ctx) {
  const signals = [];

  if (ctx.winnerRank != null && ctx.winnerRank <= 25) {
    if (ctx.loserRank == null || ctx.loserRank > 25) {
      signals.push(`#${ctx.winnerRank} AP ranking vs unranked opponent`);
    } else if (ctx.winnerRank < ctx.loserRank) {
      signals.push(`Higher AP ranking (#${ctx.winnerRank} vs #${ctx.loserRank})`);
    }
  }

  if (ctx.winnerChamp != null && ctx.winnerChamp < 5000) {
    const implied = ctx.winnerChamp > 0
      ? Math.round(100 / (ctx.winnerChamp + 100) * 100)
      : Math.round(Math.abs(ctx.winnerChamp) / (Math.abs(ctx.winnerChamp) + 100) * 100);
    if (ctx.loserChamp == null || ctx.loserChamp > 10000) {
      signals.push(`Title contender (${implied}% implied championship probability)`);
    } else {
      signals.push('Stronger championship odds profile');
    }
  }

  if (ctx.atsA != null && ctx.atsA >= 55) {
    if (ctx.atsB != null && ctx.atsB < 48) {
      signals.push(`ATS edge: ${Math.round(ctx.atsA)}% cover rate vs opponent's ${Math.round(ctx.atsB)}%`);
    } else {
      signals.push(`Strong ATS form (${Math.round(ctx.atsA)}% cover rate)`);
    }
  }

  if (ctx.winnerRec && ctx.loserRec) {
    const wPct = recordWinPct(ctx.winnerRec);
    const lPct = recordWinPct(ctx.loserRec);
    if (wPct != null && lPct != null && wPct - lPct >= 0.08) {
      signals.push(`Better overall record (${ctx.winnerRec} vs ${ctx.loserRec})`);
    }
  }

  if (ctx.winnerConf && ctx.loserConf) {
    const wStr = confStrengthScore(ctx.winnerConf);
    const lStr = confStrengthScore(ctx.loserConf);
    if (wStr - lStr >= 0.10) {
      signals.push(`Stronger conference (${ctx.winnerConf} vs ${ctx.loserConf})`);
    } else if (wStr - lStr >= 0.04) {
      signals.push(`Conference strength edge (${ctx.winnerConf})`);
    }
  }

  if (ctx.tournamentPrior?.applied) {
    signals.push('Tournament history: historically volatile seed band');
  }

  if (ctx.mmSignals?.length > 0) {
    for (const s of ctx.mmSignals.slice(0, 2)) {
      if (!signals.includes(s)) signals.push(s);
    }
  }

  if (ctx.heuristicSignals?.length > 0) {
    for (const s of ctx.heuristicSignals.slice(0, 2)) {
      if (!signals.includes(s)) signals.push(s);
    }
  }

  if (ctx.champSignals?.length > 0) {
    for (const s of ctx.champSignals.slice(0, 1)) {
      if (!signals.includes(s)) signals.push(s);
    }
  }

  if (signals.length === 0) {
    const wSeed = winner.seed;
    const lSeed = loser.seed;
    if (wSeed != null && lSeed != null && Math.abs(wSeed - lSeed) >= 8) {
      signals.push(`Significant seed advantage (#${wSeed} vs #${lSeed})`);
    } else if (wSeed != null && lSeed != null && Math.abs(wSeed - lSeed) >= 4) {
      signals.push(`Seed-line edge (#${wSeed} vs #${lSeed})`);
    } else {
      signals.push('Composite model edge');
    }
  }

  return signals;
}

function buildRationale(winner, loser, ctx) {
  const parts = [];
  const seedGap = (winner.seed != null && loser.seed != null)
    ? Math.abs(winner.seed - loser.seed) : 0;
  const winPctStr = Math.round((0.5 + ctx.edgeMag) * 100);

  if (ctx.enrichCount >= 3) {
    parts.push(`Full model composite gives ${winner.name || winner.shortName} a ${winPctStr}% win probability.`);
  } else if (ctx.enrichCount >= 1) {
    parts.push(`Model favors ${winner.name || winner.shortName} at ${winPctStr}% based on ${ctx.enrichCount} enrichment signal${ctx.enrichCount > 1 ? 's' : ''} plus seed history.`);
  } else if (seedGap >= 8) {
    parts.push(`Historical favorite at ${winPctStr}%. #${Math.min(winner.seed, loser.seed)}-seeds dominate this matchup.`);
  } else {
    parts.push(`Directional lean on ${winner.name || winner.shortName} at ${winPctStr}%.`);
  }

  if (ctx.isUpset) {
    parts.push(`Lower seed upset pick: #${winner.seed} over #${loser.seed}.`);
  } else if (winner.seed != null && loser.seed != null && winner.seed < loser.seed) {
    const underdogPct = Math.round((1 - (0.5 + ctx.edgeMag)) * 100);
    if (underdogPct >= 35) {
      parts.push(`#${loser.seed}-seed has a live ${underdogPct}% upset chance.`);
    }
  }

  if (ctx.winnerRank != null && ctx.winnerRank <= 25 && (ctx.loserRank == null || ctx.loserRank > 25)) {
    parts.push(`Ranking edge: #${ctx.winnerRank} AP.`);
  }

  if (ctx.winnerAts != null && ctx.winnerAts >= 56) {
    parts.push(`Covering at ${Math.round(ctx.winnerAts)}% ATS — strong recent form.`);
  }

  if (ctx.winnerRec && ctx.loserRec && ctx.enrichCount >= 1) {
    const wP = recordWinPct(ctx.winnerRec);
    const lP = recordWinPct(ctx.loserRec);
    if (wP != null && lP != null && wP - lP >= 0.10) {
      parts.push(`Record advantage: ${ctx.winnerRec} vs ${ctx.loserRec}.`);
    }
  }

  if (ctx.tournamentPrior?.applied && ctx.tournamentPrior.rationale) {
    parts.push(ctx.tournamentPrior.rationale);
  }

  if (ctx.bracketTier === 'high_conviction') {
    parts.push('High Conviction — stable, low-variance prediction.');
  } else if (ctx.bracketTier === 'dice_roll') {
    parts.push('Dice Roll — variance-driven, outcome less certain.');
  } else if (ctx.bracketTier === 'upset_special') {
    parts.push('Upset Pick — model backs the lower seed over the chalk.');
  }

  if (ctx.mmSignals?.upsetTrigger?.signal) {
    parts.push(ctx.mmSignals.upsetTrigger.signal);
  }

  if (ctx.heuristics?.matchupRefine?.signals?.length > 0) {
    const topRefine = ctx.heuristics.matchupRefine.signals[0];
    if (topRefine && !parts.some(p => p.includes(topRefine))) {
      parts.push(topRefine);
    }
  }

  const winnerChampOverlay = ctx.heuristics?.champOverlayA ?? ctx.heuristics?.champOverlayB;
  if (winnerChampOverlay?.championshipFlags?.includes('fullChampionshipProfile')) {
    parts.push('Title profile checks all key boxes: conference semis + elite net rating.');
  }

  return parts.join(' ');
}
