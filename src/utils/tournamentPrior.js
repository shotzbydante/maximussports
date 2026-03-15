/**
 * Historical NCAA Tournament Prior Layer
 *
 * Provides lightweight upset-frequency calibration based on long-run
 * tournament data (2011–2025, 13 completed tournaments). Used as a
 * modest secondary input alongside the main Maximus prediction model.
 *
 * Design principles:
 *   - Calibration layer, NOT a primary driver
 *   - Only activates when the main model edge is small
 *   - Dampened in later rounds where chaos historically decreases
 *   - Seed is NOT used as a direct winner predictor
 *   - Maximum score adjustment is capped at 0.025 (~2.5 pp win prob)
 *
 * Data source: NCAA Tournament brackets 2011–2019, 2021–2025
 * (2020 cancelled). 52 games per seed-matchup type across 13 years.
 */

// ── Historical Round-of-64 upset rates by seed matchup ──────────────
// "Upset" = lower seed (higher number) defeats higher seed.
//
// Derived from 13 tournaments × 4 regions = 52 games per matchup type.
//   1v16  ~2/52   UMBC 2018, FDU 2023
//   2v15  ~5/52   Lehigh '12, FGCU '13, Mid Tenn '16, Oral Roberts '21,
//                  Saint Peter's '22, Princeton '23
//   3v14  ~8/52   Mercer '14, Georgia St '15, Buffalo '18, Abilene Chr '21…
//   4v13  ~11/52  Harvard '14, UC Irvine '19, Ohio '21, Iona '23…
//   5v12  ~18/52  perennial upset spot
//   6v11  ~19/52  11-seeds consistently dangerous (VCU, Loyola Chi, etc.)
//   7v10  ~20/52  volatile pairing
//   8v9   ~25/52  near coin flip every year
const R1_HISTORICAL_UPSET_RATE = {
  '1_16': 0.02,
  '2_15': 0.08,
  '3_14': 0.15,
  '4_13': 0.22,
  '5_12': 0.36,
  '6_11': 0.37,
  '7_10': 0.40,
  '8_9':  0.49,
};

// Baseline rates a quality-based model would imply without tournament
// context. The gap between historical and baseline is what the prior
// corrects — it captures "March Madness volatility" that regular-season
// metrics underestimate.
const BASELINE_IMPLIED_UPSET_RATE = {
  '1_16': 0.02,
  '2_15': 0.07,
  '3_14': 0.12,
  '4_13': 0.17,
  '5_12': 0.28,
  '6_11': 0.30,
  '7_10': 0.33,
  '8_9':  0.45,
};

// Chaos decreases as the tournament progresses.
const ROUND_DAMPENING = {
  1: 1.00,
  2: 0.60,
  3: 0.35,
  4: 0.20,
  5: 0.10,
  6: 0.05,
};

const MAX_PRIOR_ADJUSTMENT = 0.025;
const PRIOR_SCALE = 0.06;

/**
 * Compute tournament-history prior adjustment for a bracket matchup.
 *
 * The adjustment is always in the direction of the underdog (higher
 * seed number). It only activates when the main model edge is small.
 *
 * @param {number|null} seedA
 * @param {number|null} seedB
 * @param {number}      round         Tournament round 1–6
 * @param {number}      mainModelEdge Absolute edge from the main model
 * @returns {{ adjustment, applied, favoredSide, rationale, historicalUpsetRate }}
 */
export function getTournamentPrior(seedA, seedB, round = 1, mainModelEdge = 0) {
  const NULL_RESULT = {
    adjustment: 0,
    applied: false,
    favoredSide: null,
    rationale: null,
    historicalUpsetRate: null,
  };

  if (seedA == null || seedB == null) return NULL_RESULT;

  const higherSeed = Math.min(seedA, seedB);
  const lowerSeed = Math.max(seedA, seedB);
  const seedKey = `${higherSeed}_${lowerSeed}`;

  let historicalRate = R1_HISTORICAL_UPSET_RATE[seedKey] ?? null;
  let baselineRate = BASELINE_IMPLIED_UPSET_RATE[seedKey] ?? null;

  // For matchups not in the R1 lookup (later rounds, non-standard pairings),
  // use a generalized seed-gap heuristic.
  if (historicalRate == null) {
    const seedGap = lowerSeed - higherSeed;
    if (seedGap <= 2) {
      historicalRate = 0.42;
      baselineRate = 0.38;
    } else if (seedGap <= 5) {
      historicalRate = 0.28;
      baselineRate = 0.24;
    } else if (seedGap <= 8) {
      historicalRate = 0.18;
      baselineRate = 0.15;
    } else {
      historicalRate = 0.08;
      baselineRate = 0.06;
    }
  }

  const excessRate = Math.max(0, historicalRate - baselineRate);
  if (excessRate < 0.01) {
    return { ...NULL_RESULT, historicalUpsetRate: historicalRate };
  }

  const roundMult = ROUND_DAMPENING[round] ?? 0.30;

  // Edge gating: prior only matters when the main model can't clearly
  // separate the teams. Strong model edges are never overridden.
  let edgeGate;
  if (mainModelEdge < 0.06) edgeGate = 1.0;
  else if (mainModelEdge < 0.10) edgeGate = 0.6;
  else if (mainModelEdge < 0.14) edgeGate = 0.25;
  else edgeGate = 0;

  if (edgeGate === 0) {
    return { ...NULL_RESULT, historicalUpsetRate: historicalRate };
  }

  const rawAdj = excessRate * PRIOR_SCALE * roundMult * edgeGate;
  const adjustment = Math.min(rawAdj, MAX_PRIOR_ADJUSTMENT);
  const applied = adjustment > 0.002;

  return {
    adjustment,
    applied,
    favoredSide: 'lower',
    rationale: applied
      ? buildPriorRationale(higherSeed, lowerSeed, round, historicalRate)
      : null,
    historicalUpsetRate: historicalRate,
  };
}

function buildPriorRationale(higherSeed, lowerSeed, round, rate) {
  const pct = Math.round(rate * 100);
  const roundLabel = round > 1 ? ` (Rd ${round})` : '';

  if (higherSeed === 8 && lowerSeed === 9) {
    return `Tournament history: 8/9 games are near coin flips (${pct}% upset rate).`;
  }
  if (rate >= 0.33) {
    return `Historically volatile ${higherSeed}/${lowerSeed} seed band${roundLabel} — ${pct}% upset rate; upset prior applied.`;
  }
  if (rate >= 0.20) {
    return `Tournament history slightly increases upset probability in this ${higherSeed}/${lowerSeed} seed band (${pct}%).`;
  }
  return `Modest historical upset prior for this seed matchup.`;
}

export const TOURNAMENT_PRIOR_META = {
  dataSource: 'NCAA Tournament results 2011–2025 (13 tournaments)',
  philosophy: 'Calibration layer — not a primary driver. Activates only on close matchups.',
  maxAdjustment: MAX_PRIOR_ADJUSTMENT,
  mostVolatileMatchups: ['5/12', '6/11', '7/10', '8/9'],
  mostStableMatchups: ['1/16', '2/15'],
};
