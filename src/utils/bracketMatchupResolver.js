/**
 * Bracket Matchup Resolver — adapter for Maximus Pick 'Em model logic.
 *
 * Runs bracket matchups through the same core signal pipeline used by
 * Pick 'Em predictions. Seed is explicitly NOT used as a model input —
 * it is display/context only. A 12-seed that is objectively stronger
 * will be picked over a 5-seed.
 *
 * Includes an optional tournament-history prior layer that provides
 * lightweight upset-frequency calibration for known volatile seed bands.
 * The prior only activates when the main model edge is small and never
 * overrides strong model opinions.
 *
 * Shared with maximusPicksModel.js signal weights so improvements to
 * the core model automatically benefit bracket predictions.
 */

import { getTournamentPrior } from './tournamentPrior';

const W_RANKING     = 0.12;
const W_CHAMP_ODDS  = 0.18;
const W_SEASON_REC  = 0.12;
const W_LAST10      = 0.15;
const W_SOS         = 0.08;
const W_ATS         = 0.10;
const W_MARKET      = 0.25;

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function rankSignal(rank) {
  if (rank == null || rank <= 0) return null;
  return clamp(1 - (rank - 1) / 50, 0.2, 0.95);
}

function champOddsSignal(americanOdds) {
  if (americanOdds == null) return null;
  const implied = americanOdds > 0
    ? 100 / (americanOdds + 100)
    : Math.abs(americanOdds) / (Math.abs(americanOdds) + 100);
  return clamp(implied * 2.5, 0.1, 0.95);
}

function recordSignal(coverPct) {
  if (coverPct == null) return null;
  return clamp(coverPct / 100, 0.2, 0.8);
}

/**
 * Resolve a single bracket matchup between two teams.
 *
 * @param {{ name, slug, seed }} teamA
 * @param {{ name, slug, seed }} teamB
 * @param {object} context — enrichment data from model pipeline
 * @param {object} context.rankMap — slug → AP rank
 * @param {object} context.championshipOdds — slug → { american }
 * @param {object} context.atsBySlug — slug → { season, last30, last7 }
 * @param {object} context.marketData — slug → market win probability (optional)
 * @param {object} [matchupMeta] — optional bracket context
 * @param {number} [matchupMeta.round] — tournament round (1–6), enables tournament prior
 * @returns {{ winner, loser, confidence, confidenceLabel, signals, rationale, isUpset, tournamentPrior }}
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

  const rankA = rankMap[slugA] ?? null;
  const rankB = rankMap[slugB] ?? null;
  const champA = championshipOdds[slugA]?.american ?? null;
  const champB = championshipOdds[slugB]?.american ?? null;
  const atsA = getBestCoverPct(atsBySlug[slugA]);
  const atsB = getBestCoverPct(atsBySlug[slugB]);

  let scoreA = 0.5;
  let scoreB = 0.5;
  let enrichCount = 0;

  if (rankSignal(rankA) !== null || rankSignal(rankB) !== null) {
    const sigA = rankSignal(rankA) ?? 0.5;
    const sigB = rankSignal(rankB) ?? 0.5;
    scoreA += (sigA - sigB) * W_RANKING;
    scoreB += (sigB - sigA) * W_RANKING;
    enrichCount++;
  }

  if (champOddsSignal(champA) !== null || champOddsSignal(champB) !== null) {
    const sigA = champOddsSignal(champA) ?? 0.5;
    const sigB = champOddsSignal(champB) ?? 0.5;
    scoreA += (sigA - sigB) * W_CHAMP_ODDS;
    scoreB += (sigB - sigA) * W_CHAMP_ODDS;
    enrichCount++;
  }

  if (recordSignal(atsA) !== null || recordSignal(atsB) !== null) {
    const sigA = recordSignal(atsA) ?? 0.5;
    const sigB = recordSignal(atsB) ?? 0.5;
    scoreA += (sigA - sigB) * W_ATS;
    scoreB += (sigB - sigA) * W_ATS;

    const lastA = recordSignal(atsA) ?? 0.5;
    const lastB = recordSignal(atsB) ?? 0.5;
    scoreA += (lastA - lastB) * W_LAST10;
    scoreB += (lastB - lastA) * W_LAST10;

    scoreA += (sigA - sigB) * W_SEASON_REC;
    scoreB += (sigB - sigA) * W_SEASON_REC;
    enrichCount++;
  }

  const sosA = rankA != null && rankA <= 25 ? 0.65 : 0.5;
  const sosB = rankB != null && rankB <= 25 ? 0.65 : 0.5;
  scoreA += (sosA - sosB) * W_SOS;
  scoreB += (sosB - sosA) * W_SOS;

  // ── Seed-based prior when enrichment is sparse ─────────────────
  // When no real enrichment data is available, use historical seed-based
  // win rates so obvious mismatches (1v16, 2v15) don't show 50/50.
  if (enrichCount === 0 && teamA.seed != null && teamB.seed != null) {
    const favSeed = Math.min(teamA.seed, teamB.seed);
    const dogSeed = Math.max(teamA.seed, teamB.seed);
    const seedGap = dogSeed - favSeed;

    const SEED_WIN_RATE = {
      '1_16': 0.98, '2_15': 0.92, '3_14': 0.85, '4_13': 0.78,
      '5_12': 0.64, '6_11': 0.63, '7_10': 0.60, '8_9': 0.51,
    };

    const seedKey = `${favSeed}_${dogSeed}`;
    let favWinRate = SEED_WIN_RATE[seedKey] ?? null;
    if (favWinRate == null) {
      if (seedGap >= 12) favWinRate = 0.95;
      else if (seedGap >= 8) favWinRate = 0.82;
      else if (seedGap >= 5) favWinRate = 0.70;
      else if (seedGap >= 3) favWinRate = 0.62;
      else favWinRate = 0.55;
    }

    const seedEdge = (favWinRate - 0.5) * 0.85;
    const aIsFav = teamA.seed < teamB.seed;
    if (aIsFav) {
      scoreA += seedEdge;
      scoreB -= seedEdge;
    } else {
      scoreB += seedEdge;
      scoreA -= seedEdge;
    }
    enrichCount = 1;
  }

  // ── Main model edge (before tournament prior) ──────────────────
  const mainEdge = scoreA - scoreB;
  const mainEdgeMag = Math.abs(mainEdge);

  // ── Tournament history prior (lightweight calibration layer) ───
  let tournamentPriorResult = null;
  if (matchupMeta.round != null && teamA.seed != null && teamB.seed != null) {
    tournamentPriorResult = getTournamentPrior(
      teamA.seed, teamB.seed, matchupMeta.round, mainEdgeMag,
    );

    if (tournamentPriorResult.applied && tournamentPriorResult.adjustment > 0) {
      const aIsUnderdog = teamA.seed > teamB.seed;
      const adj = tournamentPriorResult.adjustment;
      if (aIsUnderdog) {
        scoreA += adj;
        scoreB -= adj;
      } else {
        scoreB += adj;
        scoreA -= adj;
      }
    }
  }

  // ── Final edge (after tournament prior) ────────────────────────
  const edge = scoreA - scoreB;
  const edgeMag = Math.abs(edge);
  const pickA = edge >= 0;

  let confidence = 0;
  if (edgeMag >= 0.14) confidence = 2;
  else if (edgeMag >= 0.07) confidence = 1;

  if (enrichCount === 0) confidence = 0;

  // Allow HIGH confidence for large seed gaps even with seed-only enrichment,
  // since a 1v16 is objectively a HIGH confidence pick.
  const seedGapForConf = (teamA.seed != null && teamB.seed != null)
    ? Math.abs(teamA.seed - teamB.seed) : 0;
  if (enrichCount <= 1 && seedGapForConf < 8) {
    confidence = Math.min(confidence, 1);
  }

  const winner = pickA ? teamA : teamB;
  const loser = pickA ? teamB : teamA;

  const isUpset = winner.seed != null && loser.seed != null && winner.seed > loser.seed;

  const signals = buildSignals(winner, loser, {
    rankMap, championshipOdds, atsA: pickA ? atsA : atsB, atsB: pickA ? atsB : atsA,
    winnerRank: pickA ? rankA : rankB, loserRank: pickA ? rankB : rankA,
    tournamentPrior: tournamentPriorResult,
  });

  const confLabel = confidence >= 2 ? 'HIGH' : confidence >= 1 ? 'MEDIUM' : 'LOW';

  const rationale = buildRationale(winner, loser, {
    confidence, confLabel, edgeMag, enrichCount, isUpset,
    winnerRank: pickA ? rankA : rankB, loserRank: pickA ? rankB : rankA,
    winnerChamp: pickA ? champA : champB,
    winnerAts: pickA ? atsA : atsB,
    tournamentPrior: tournamentPriorResult,
  });

  return {
    winner, loser, confidence, confidenceLabel: confLabel,
    signals, rationale, isUpset,
    edgeMagnitude: edgeMag, enrichmentCount: enrichCount,
    winProbability: clamp(0.5 + edge, 0.1, 0.95),
    tournamentPrior: tournamentPriorResult,
  };
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
      signals.push(`Ranked #${ctx.winnerRank} vs unranked`);
    } else if (ctx.winnerRank < ctx.loserRank) {
      signals.push(`Higher ranked (#${ctx.winnerRank} vs #${ctx.loserRank})`);
    }
  }
  const wChamp = ctx.championshipOdds[winner.slug]?.american;
  if (wChamp != null && wChamp < 5000) {
    signals.push('Championship odds advantage');
  }
  if (ctx.atsA != null && ctx.atsA >= 55) {
    signals.push(`Strong form (${Math.round(ctx.atsA)}% ATS)`);
  }
  if (ctx.atsB != null && ctx.atsB < 45) {
    signals.push(`Opponent struggling (${Math.round(ctx.atsB)}% ATS)`);
  }
  if (ctx.tournamentPrior?.applied) {
    signals.push('Tournament prior: historically volatile seed band');
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
  const edgePct = Math.round(ctx.edgeMag * 100);

  const seedGap = (winner.seed != null && loser.seed != null) ? Math.abs(winner.seed - loser.seed) : 0;
  if (ctx.enrichCount >= 3) {
    parts.push(`Full-model composite edge of ${edgePct}pp favors ${winner.name || winner.shortName}.`);
  } else if (ctx.enrichCount >= 1 && seedGap >= 8) {
    parts.push(`Strong historical favorite. #${Math.min(winner.seed, loser.seed)}-seeds win this matchup ~${Math.round((0.5 + ctx.edgeMag) * 100)}% of the time.`);
  } else if (ctx.enrichCount >= 1) {
    parts.push(`Partial-model edge of ${edgePct}pp with ${ctx.enrichCount} enrichment source${ctx.enrichCount > 1 ? 's' : ''}.`);
  } else {
    parts.push(`Minimal data available — directional lean on ${winner.name || winner.shortName}.`);
  }

  if (ctx.isUpset) {
    parts.push(`Model-driven upset pick: ${winner.seed}-seed over ${loser.seed}-seed.`);
  }

  if (ctx.winnerRank != null && ctx.winnerRank <= 25 && (ctx.loserRank == null || ctx.loserRank > 25)) {
    parts.push(`Ranking advantage: #${ctx.winnerRank} vs unranked.`);
  }

  if (ctx.winnerAts != null && ctx.winnerAts >= 58) {
    parts.push(`Strong recent form — ${Math.round(ctx.winnerAts)}% ATS cover rate.`);
  }

  if (ctx.tournamentPrior?.applied && ctx.tournamentPrior.rationale) {
    parts.push(ctx.tournamentPrior.rationale);
  }

  return parts.join(' ');
}
