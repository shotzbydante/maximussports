/**
 * NBA Series Resolver — predicts best-of-7 playoff series outcomes.
 *
 * Uses available inputs: seed, record, championship odds, home-court,
 * and team-board standings to compute series win probabilities.
 */

/**
 * Compute implied win probability from American odds.
 */
function oddsToProb(american) {
  if (american == null) return null;
  return american < 0
    ? Math.abs(american) / (Math.abs(american) + 100)
    : 100 / (american + 100);
}

/**
 * Compute record win percentage.
 */
function recordPct(record) {
  if (!record) return null;
  const parts = record.split('-').map(Number);
  if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return null;
  const total = parts[0] + parts[1];
  return total > 0 ? parts[0] / total : null;
}

/**
 * Compute single-game win probability for teamA vs teamB.
 * Blends seed, record, and championship odds signals.
 */
function computeGameWinProb(teamA, teamB, context = {}) {
  const signals = [];
  let totalWeight = 0;
  let weightedSum = 0;

  // 1. Seed-based baseline (higher seed = lower number = better)
  const seedA = teamA.seed;
  const seedB = teamB.seed;
  if (seedA != null && seedB != null) {
    const seedGap = seedB - seedA; // positive = A is higher seed
    // Map seed gap to probability: 0 gap = 50%, 7 gap = ~75%
    const seedProb = 0.5 + (seedGap / 14) * 0.25;
    const clamped = Math.max(0.35, Math.min(0.65, seedProb));
    signals.push({ label: 'Seed', prob: clamped, weight: 25 });
    totalWeight += 25;
    weightedSum += clamped * 25;
  }

  // 2. Record-based
  const pctA = recordPct(teamA.record);
  const pctB = recordPct(teamB.record);
  if (pctA != null && pctB != null) {
    const combined = pctA + pctB;
    const recProb = combined > 0 ? pctA / combined : 0.5;
    const clamped = Math.max(0.35, Math.min(0.65, recProb));
    signals.push({ label: 'Record', prob: clamped, weight: 30 });
    totalWeight += 30;
    weightedSum += clamped * 30;
  }

  // 3. Championship odds
  const oddsA = context.championshipOdds?.[teamA.slug];
  const oddsB = context.championshipOdds?.[teamB.slug];
  const probA = oddsA?.bestChanceAmerican != null ? oddsToProb(oddsA.bestChanceAmerican) : null;
  const probB = oddsB?.bestChanceAmerican != null ? oddsToProb(oddsB.bestChanceAmerican) : null;
  if (probA != null && probB != null) {
    const combined = probA + probB;
    const oddsProb = combined > 0 ? probA / combined : 0.5;
    const clamped = Math.max(0.30, Math.min(0.70, oddsProb));
    signals.push({ label: 'Title Odds', prob: clamped, weight: 35 });
    totalWeight += 35;
    weightedSum += clamped * 35;
  }

  // 4. Home-court advantage (higher seed gets it)
  if (seedA != null && seedB != null && seedA < seedB) {
    signals.push({ label: 'Home Court', prob: 0.54, weight: 10 });
    totalWeight += 10;
    weightedSum += 0.54 * 10;
  } else if (seedA != null && seedB != null && seedB < seedA) {
    signals.push({ label: 'Home Court', prob: 0.46, weight: 10 });
    totalWeight += 10;
    weightedSum += 0.46 * 10;
  }

  const blended = totalWeight > 0 ? weightedSum / totalWeight : 0.5;
  return {
    gameWinProb: Math.max(0.35, Math.min(0.65, blended)),
    signals,
    enrichmentCount: signals.length,
  };
}

/**
 * Compute probability of winning a best-of-7 series
 * given single-game win probability p.
 * P(series win) = sum over i=4..7 of C(i-1,3) * p^4 * (1-p)^(i-4)
 */
function seriesWinProb(p) {
  const q = 1 - p;
  let total = 0;
  // Win in 4: p^4
  total += Math.pow(p, 4);
  // Win in 5: C(4,3) * p^4 * q^1 = 4 * p^4 * q
  total += 4 * Math.pow(p, 4) * q;
  // Win in 6: C(5,3) * p^4 * q^2 = 10 * p^4 * q^2
  total += 10 * Math.pow(p, 4) * Math.pow(q, 2);
  // Win in 7: C(6,3) * p^4 * q^3 = 20 * p^4 * q^3
  total += 20 * Math.pow(p, 4) * Math.pow(q, 3);
  return total;
}

/**
 * Compute most likely series length given per-game win probability.
 */
function mostLikelyLength(p) {
  const q = 1 - p;
  const lengths = {
    4: Math.pow(p, 4) + Math.pow(q, 4),
    5: 4 * (Math.pow(p, 4) * q + Math.pow(q, 4) * p),
    6: 10 * (Math.pow(p, 4) * Math.pow(q, 2) + Math.pow(q, 4) * Math.pow(p, 2)),
    7: 20 * (Math.pow(p, 4) * Math.pow(q, 3) + Math.pow(q, 4) * Math.pow(p, 3)),
  };
  let best = 4;
  let bestProb = lengths[4];
  for (const [len, prob] of Object.entries(lengths)) {
    if (prob > bestProb) { best = Number(len); bestProb = prob; }
  }
  return { length: best, probability: bestProb };
}

/**
 * Resolve a playoff series between two teams.
 *
 * @param {Object} teamA - Top team (usually higher seed)
 * @param {Object} teamB - Bottom team
 * @param {Object} context - { championshipOdds, boardMap }
 * @returns {Object} Series prediction
 */
export function resolveNbaSeries(teamA, teamB, context = {}) {
  if (!teamA || !teamB || teamA.isPlaceholder || teamB.isPlaceholder) {
    return null;
  }

  const { gameWinProb, signals, enrichmentCount } = computeGameWinProb(teamA, teamB, context);
  const seriesProb = seriesWinProb(gameWinProb);
  const series = mostLikelyLength(gameWinProb);

  const winnerIsA = seriesProb >= 0.5;
  const winner = winnerIsA ? teamA : teamB;
  const loser = winnerIsA ? teamB : teamA;
  const winProb = winnerIsA ? seriesProb : 1 - seriesProb;

  // Confidence tier
  let confidenceTier, confidenceLabel;
  if (winProb >= 0.72) { confidenceTier = 'high_conviction'; confidenceLabel = 'HIGH'; }
  else if (winProb >= 0.58) { confidenceTier = 'lean'; confidenceLabel = 'MEDIUM'; }
  else { confidenceTier = 'toss_up'; confidenceLabel = 'LOW'; }

  // Upset detection
  const isUpset = winner.seed != null && loser.seed != null && winner.seed > loser.seed;

  // Series prediction string
  const seriesCall = `${winner.shortName || winner.name} in ${series.length}`;

  // Rationale
  const rationaleParts = [];
  if (winProb >= 0.72) rationaleParts.push(`Strong favorite at ${Math.round(winProb * 100)}% series probability.`);
  else if (winProb >= 0.58) rationaleParts.push(`Lean ${winner.shortName} at ${Math.round(winProb * 100)}% series probability.`);
  else rationaleParts.push(`Near coin-flip series \u2014 ${Math.round(winProb * 100)}% series win probability.`);

  if (isUpset) rationaleParts.push('Lower seed projected to pull the upset.');
  if (signals.length >= 3) rationaleParts.push('Multiple data signals converge on this projection.');

  return {
    winner,
    loser,
    winProbability: winProb,
    gameWinProb,
    seriesCall,
    seriesLength: series.length,
    seriesLengthProb: series.probability,
    confidenceTier,
    confidenceLabel,
    isUpset,
    signals,
    rationale: rationaleParts.join(' '),
    enrichmentCount,
  };
}

/**
 * Resolve all matchups in the bracket, round by round.
 * Returns picks and predictions for every matchup.
 */
export function resolveFullNbaBracket(allMatchups, context = {}) {
  const picks = {};
  const predictions = {};
  const working = { ...allMatchups };

  // Process rounds 1 through 4
  for (let round = 1; round <= 4; round++) {
    const roundMatchups = Object.values(working).filter(m => m.round === round);

    for (const m of roundMatchups) {
      if (!m.topTeam || !m.bottomTeam || m.topTeam.isPlaceholder || m.bottomTeam.isPlaceholder) {
        continue;
      }

      const pred = resolveNbaSeries(m.topTeam, m.bottomTeam, context);
      if (!pred) continue;

      predictions[m.matchupId] = pred;
      const position = pred.winner === m.topTeam ? 'top' : 'bottom';
      picks[m.matchupId] = position;

      // Propagate winner to downstream matchups
      for (const [id, downstream] of Object.entries(working)) {
        if (downstream.topSourceId === m.matchupId) {
          working[id] = { ...working[id], topTeam: pred.winner, status: 'ready' };
        }
        if (downstream.bottomSourceId === m.matchupId) {
          working[id] = { ...working[id], bottomTeam: pred.winner, status: 'ready' };
        }
      }
    }
  }

  return { picks, predictions };
}

/**
 * Run Monte Carlo simulation of the full bracket.
 * Returns championship probabilities for each team.
 *
 * @param {Object} allMatchups - Full bracket
 * @param {Object} context - Enrichment context
 * @param {number} numSims - Number of simulations (default 1000)
 * @returns {Object} { champCounts, finalsCounts, confChampCounts }
 */
export function simulateNbaBracket(allMatchups, context = {}, numSims = 1000) {
  const champCounts = {};
  const finalsCounts = {};
  const confChampCounts = { Western: {}, Eastern: {} };

  for (let sim = 0; sim < numSims; sim++) {
    const working = {};
    for (const [id, m] of Object.entries(allMatchups)) {
      working[id] = { ...m };
    }

    for (let round = 1; round <= 4; round++) {
      const roundMatchups = Object.values(working).filter(m => m.round === round);

      for (const m of roundMatchups) {
        if (!m.topTeam || !m.bottomTeam || m.topTeam.isPlaceholder || m.bottomTeam.isPlaceholder) continue;

        const { gameWinProb } = computeGameWinProb(m.topTeam, m.bottomTeam, context);

        // Simulate best-of-7: each game is a weighted coin flip
        let winsA = 0, winsB = 0;
        while (winsA < 4 && winsB < 4) {
          if (Math.random() < gameWinProb) winsA++;
          else winsB++;
        }

        const winner = winsA === 4 ? m.topTeam : m.bottomTeam;

        // Propagate
        for (const [id, downstream] of Object.entries(working)) {
          if (downstream.topSourceId === m.matchupId) {
            working[id] = { ...working[id], topTeam: winner };
          }
          if (downstream.bottomSourceId === m.matchupId) {
            working[id] = { ...working[id], bottomTeam: winner };
          }
        }

        // Track conference champions (round 3)
        if (round === 3 && m.conference && winner.slug) {
          confChampCounts[m.conference][winner.slug] = (confChampCounts[m.conference][winner.slug] || 0) + 1;
        }

        // Track finals appearances (round 4)
        if (round === 4 && winner.slug) {
          champCounts[winner.slug] = (champCounts[winner.slug] || 0) + 1;
          // Track both finalists
          const loser = winner === m.topTeam ? m.bottomTeam : m.topTeam;
          if (winner.slug) finalsCounts[winner.slug] = (finalsCounts[winner.slug] || 0) + 1;
          if (loser?.slug) finalsCounts[loser.slug] = (finalsCounts[loser.slug] || 0) + 1;
        }
      }
    }
  }

  return { champCounts, finalsCounts, confChampCounts, numSims };
}
