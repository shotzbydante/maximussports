/**
 * Bracket Simulation Engine
 *
 * Provides three simulation modes:
 *   1. simulateEntireBracket — full bracket from empty state
 *   2. simulateRestOfBracket — fills remaining games, preserves manual picks
 *   3. regenerateMaximusPicks — re-randomizes Dice Roll + Upset Special,
 *      keeps High Conviction anchored
 *
 * Architecture:
 *   - Round-by-round execution: re-runs the model for each matchup after
 *     winners propagate, so later rounds are matchup-aware.
 *   - Controlled randomness: dice_roll and upset_special picks incorporate
 *     weighted coin flips based on model probability.
 *   - Upset cap: prevents unrealistic upset clustering.
 *
 * Data model per pick:
 *   { gameId, selectedTeam, selectionType: 'manual' | 'model' }
 */

import { resolveBracketMatchup } from './bracketMatchupResolver.js';
import { buildFullBracket } from '../data/bracketData.js';
import { isAnchorPick, shouldRegenerate } from './confidenceTier.js';
import { enforceUpsetCap } from './marchMadnessSignals.js';

const MAX_R1_UPSETS = 5;
const MAX_R2_UPSETS = 3;
const MAX_LATER_UPSETS = 2;

function getMaxUpsets(round) {
  if (round === 1) return MAX_R1_UPSETS;
  if (round === 2) return MAX_R2_UPSETS;
  return MAX_LATER_UPSETS;
}

/**
 * Apply controlled randomness to a matchup prediction.
 * For dice_roll and upset_special tiers, the model probability is used
 * as a weighted coin flip instead of deterministic pick.
 */
function applyControlledRandomness(prediction) {
  if (!prediction) return prediction;

  const tier = prediction.bracketTier;
  if (tier !== 'dice_roll' && tier !== 'upset_special') {
    return prediction;
  }

  const winProb = prediction.winProbability ?? 0.55;
  const roll = Math.random();

  if (tier === 'dice_roll') {
    if (roll > winProb) {
      return flipPrediction(prediction);
    }
    return prediction;
  }

  if (tier === 'upset_special') {
    const upsetProb = 1 - winProb;
    const boostedUpsetProb = Math.min(upsetProb * 1.3, 0.55);

    if (prediction.isUpset) {
      if (roll > boostedUpsetProb + 0.15) {
        return flipPrediction(prediction);
      }
      return prediction;
    }

    if (roll < boostedUpsetProb) {
      return flipPrediction(prediction);
    }
    return prediction;
  }

  return prediction;
}

function flipPrediction(prediction) {
  return {
    ...prediction,
    winner: prediction.loser,
    loser: prediction.winner,
    isUpset: !prediction.isUpset,
    _flipped: true,
    winProbability: 1 - (prediction.winProbability ?? 0.5),
  };
}

/**
 * Resolve a single round of the bracket.
 * Returns { picks, predictions } for this round only.
 */
function resolveRound(allMatchups, round, context, existingPicks = {}, options = {}) {
  const roundMatchups = Object.values(allMatchups)
    .filter(m => m.round === round);

  const picks = {};
  const predictions = {};
  const results = [];

  for (const matchup of roundMatchups) {
    if (existingPicks[matchup.matchupId] && !options.overrideExisting) {
      picks[matchup.matchupId] = existingPicks[matchup.matchupId];
      continue;
    }

    if (!matchup.topTeam?.slug || !matchup.bottomTeam?.slug) continue;
    if (matchup.topTeam.isPlaceholder || matchup.bottomTeam.isPlaceholder) continue;

    let prediction = resolveBracketMatchup(
      matchup.topTeam, matchup.bottomTeam, context,
      { round: matchup.round || round },
    );

    if (options.withRandomness) {
      prediction = applyControlledRandomness(prediction);
    }

    results.push({ ...prediction, matchupId: matchup.matchupId, matchup });

    const pickId = prediction.winner === matchup.topTeam ? 'top' : 'bottom';
    picks[matchup.matchupId] = pickId;
    predictions[matchup.matchupId] = prediction;
  }

  if (options.enforceUpsetCap && results.length > 0) {
    const maxUpsets = getMaxUpsets(round);
    const capped = enforceUpsetCap(results, maxUpsets);

    for (let i = 0; i < capped.length; i++) {
      if (capped[i]._upsetCapped) {
        const r = capped[i];
        const pickId = r.winner === r.matchup.topTeam ? 'top' : 'bottom';
        picks[r.matchupId] = pickId;
        predictions[r.matchupId] = r;
      }
    }
  }

  return { picks, predictions };
}

/**
 * Simulate the entire bracket from scratch.
 * Uses High Conviction as anchors, applies controlled randomness
 * to Dice Roll and Upset Special picks.
 *
 * @param {object} bracket - bracket data with regions
 * @param {object} context - model enrichment context
 * @param {object} options - { withRandomness?: boolean }
 * @returns {{ picks, predictions, origins }}
 */
export function simulateEntireBracket(bracket, context, options = {}) {
  if (!bracket?.regions) return { picks: {}, predictions: {}, origins: {} };

  const withRandomness = options.withRandomness !== false;
  let allPicks = {};
  let allPredictions = {};
  const origins = {};

  for (let round = 1; round <= 6; round++) {
    const allMatchups = buildFullBracket(bracket.regions, allPicks);

    const { picks: roundPicks, predictions: roundPredictions } = resolveRound(
      allMatchups, round, context, {},
      { withRandomness, enforceUpsetCap: withRandomness, overrideExisting: false },
    );

    allPicks = { ...allPicks, ...roundPicks };
    allPredictions = { ...allPredictions, ...roundPredictions };

    for (const matchupId of Object.keys(roundPicks)) {
      origins[matchupId] = 'maximus';
    }
  }

  return { picks: allPicks, predictions: allPredictions, origins };
}

/**
 * Simulate remaining games in the bracket.
 * Preserves all existing manual and model picks.
 *
 * @param {object} bracket - bracket data
 * @param {object} context - model enrichment context
 * @param {object} existingPicks - current user picks { matchupId: 'top'|'bottom' }
 * @param {object} existingOrigins - current pick origins { matchupId: 'manual'|'maximus' }
 * @returns {{ picks, predictions, origins }}
 */
export function simulateRestOfBracket(bracket, context, existingPicks = {}, existingOrigins = {}) {
  if (!bracket?.regions) return { picks: existingPicks, predictions: {}, origins: existingOrigins };

  let allPicks = { ...existingPicks };
  let allPredictions = {};
  const origins = { ...existingOrigins };

  for (let round = 1; round <= 6; round++) {
    const allMatchups = buildFullBracket(bracket.regions, allPicks);

    const { picks: roundPicks, predictions: roundPredictions } = resolveRound(
      allMatchups, round, context, allPicks,
      { withRandomness: true, enforceUpsetCap: true, overrideExisting: false },
    );

    for (const [matchupId, pickId] of Object.entries(roundPicks)) {
      if (!allPicks[matchupId]) {
        allPicks[matchupId] = pickId;
        origins[matchupId] = 'maximus';
      }
    }
    allPredictions = { ...allPredictions, ...roundPredictions };
  }

  return { picks: allPicks, predictions: allPredictions, origins };
}

/**
 * Regenerate Maximus picks with controlled randomness.
 * - High Conviction picks stay FIXED (anchors)
 * - Lean picks stay fixed
 * - Dice Roll and Upset Special picks get re-randomized
 * - Downstream picks are cleared and re-simulated
 *
 * @param {object} bracket - bracket data
 * @param {object} context - model enrichment context
 * @param {object} existingPicks - current picks
 * @param {object} existingOrigins - current origins
 * @param {object} existingPredictions - current prediction results
 * @returns {{ picks, predictions, origins }}
 */
export function regenerateMaximusPicks(bracket, context, existingPicks = {}, existingOrigins = {}, existingPredictions = {}) {
  if (!bracket?.regions) return { picks: existingPicks, predictions: existingPredictions, origins: existingOrigins };

  const anchoredPicks = {};
  const anchoredOrigins = {};
  const matchupsToRegenerate = new Set();

  for (const [matchupId, pickId] of Object.entries(existingPicks)) {
    if (existingOrigins[matchupId] === 'manual') {
      anchoredPicks[matchupId] = pickId;
      anchoredOrigins[matchupId] = 'manual';
      continue;
    }

    const prediction = existingPredictions[matchupId];
    if (prediction && isAnchorPick(prediction)) {
      anchoredPicks[matchupId] = pickId;
      anchoredOrigins[matchupId] = 'maximus';
    } else if (prediction && shouldRegenerate(prediction)) {
      matchupsToRegenerate.add(matchupId);
    } else {
      anchoredPicks[matchupId] = pickId;
      anchoredOrigins[matchupId] = existingOrigins[matchupId] || 'maximus';
    }
  }

  const downstreamCleared = clearDownstreamOfRegenerated(
    bracket, anchoredPicks, matchupsToRegenerate,
  );

  let allPicks = { ...downstreamCleared };
  let allPredictions = {};
  const origins = { ...anchoredOrigins };

  for (let round = 1; round <= 6; round++) {
    const allMatchups = buildFullBracket(bracket.regions, allPicks);

    const { picks: roundPicks, predictions: roundPredictions } = resolveRound(
      allMatchups, round, context, allPicks,
      { withRandomness: true, enforceUpsetCap: true, overrideExisting: false },
    );

    for (const [matchupId, pickId] of Object.entries(roundPicks)) {
      if (!allPicks[matchupId]) {
        allPicks[matchupId] = pickId;
        origins[matchupId] = 'maximus';
      }
    }
    allPredictions = { ...allPredictions, ...roundPredictions };
  }

  return { picks: allPicks, predictions: allPredictions, origins };
}

/**
 * Clear all downstream picks that depend on regenerated matchups.
 */
function clearDownstreamOfRegenerated(bracket, anchoredPicks, regeneratedIds) {
  const allMatchups = buildFullBracket(bracket.regions, anchoredPicks);
  const cleared = { ...anchoredPicks };

  for (const regenId of regeneratedIds) {
    const queue = [regenId];
    const visited = new Set();

    while (queue.length > 0) {
      const current = queue.shift();
      if (visited.has(current)) continue;
      visited.add(current);
      delete cleared[current];

      for (const m of Object.values(allMatchups)) {
        if (m.topSourceId === current || m.bottomSourceId === current) {
          queue.push(m.matchupId);
        }
      }
    }
  }

  return cleared;
}

/**
 * Get simulation statistics for display.
 */
export function getSimulationStats(predictions) {
  if (!predictions || Object.keys(predictions).length === 0) {
    return { totalGames: 0, upsets: 0, highConviction: 0, diceRolls: 0, upsetSpecials: 0, leans: 0 };
  }

  const entries = Object.values(predictions);

  let champProfileWinners = 0;
  let heuristicInfluenced = 0;
  for (const p of entries) {
    const wOverlay = p.winner === p.heuristics?.championshipOverlay?.a
      ? p.heuristics?.championshipOverlay?.a
      : p.heuristics?.championshipOverlay?.b;
    if (wOverlay?.championshipFlags?.includes('fullChampionshipProfile')) {
      champProfileWinners++;
    }
    if (p.heuristics?.matchupRefinements?.matchupFlags?.length > 0) {
      heuristicInfluenced++;
    }
  }

  return {
    totalGames: entries.length,
    upsets: entries.filter(p => p.isUpset).length,
    highConviction: entries.filter(p => p.bracketTier === 'high_conviction').length,
    diceRolls: entries.filter(p => p.bracketTier === 'dice_roll').length,
    upsetSpecials: entries.filter(p => p.bracketTier === 'upset_special').length,
    leans: entries.filter(p => p.bracketTier === 'lean').length,
    avgConfidence: entries.reduce((sum, p) => sum + (p.winProbability ?? 0.5), 0) / entries.length,
    champProfileWinners,
    heuristicInfluenced,
  };
}
