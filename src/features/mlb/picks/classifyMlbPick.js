/**
 * classifyMlbPick — convert a scored matchup into zero or more pick cards.
 *
 * Pick categories: pickEms, ats, leans, totals
 *
 * Key design decisions:
 *   - Pick'Ems and ATS use adjusted edge (DQ/SA multiplier)
 *   - Value Leans and Totals use RAW edge (no multiplier) for softer qualification
 *   - Every game can generate picks in all 4 categories independently
 *   - MAX_PICKS_PER_GAME = 4 so a game can appear in all columns
 *   - Low conviction picks are surfaced rather than hidden
 */

import { MAX_PICKS_PER_GAME } from './mlbPickThresholds.js';

export function classifyMlbPick(matchup, score, thresholds) {
  const picks = [];

  if (score.dataQuality < thresholds.minDataQuality) {
    return picks;
  }

  const mlSide = chooseBestSide(score);

  // ── Moneyline / Pick 'Em (adjusted edge) ──
  if (mlSide) {
    const conf = resolveConfidence(mlSide.edge, thresholds.moneyline, score.dataQuality, score.signalAgreement);
    if (conf) {
      picks.push(buildPick(matchup, score, mlSide, 'pickEms', 'moneyline', conf));
    }
  }

  // ── Value Lean (RAW edge — softer, independent of Pick'Em) ──
  // Every game with ANY positive edge gets a lean. This ensures Leans
  // always populate. Uses raw edge without DQ/SA multiplier.
  if (mlSide && mlSide.edge > 0) {
    const conf = resolveRawConfidence(mlSide.edge, thresholds.lean, score.dataQuality);
    if (conf) {
      picks.push(buildPick(matchup, score, mlSide, 'leans', 'moneyline', conf));
    }
  }

  // ── Run Line / ATS (adjusted edge) ──
  const rlPick = evaluateRunLine(matchup, score, thresholds);
  if (rlPick) picks.push(rlPick);

  // ── Totals (RAW edge — softer) ──
  const totalPick = evaluateTotal(matchup, score, thresholds);
  if (totalPick) picks.push(totalPick);

  return picks.slice(0, MAX_PICKS_PER_GAME);
}

// ── Helpers ──

function chooseBestSide(score) {
  const { awayEdge, homeEdge } = score;
  if (awayEdge == null && homeEdge == null) return null;

  const bestAway = awayEdge != null && awayEdge > 0 ? awayEdge : 0;
  const bestHome = homeEdge != null && homeEdge > 0 ? homeEdge : 0;

  if (bestAway <= 0 && bestHome <= 0) return null;

  if (bestAway >= bestHome) {
    return { side: 'away', edge: bestAway, prob: score.awayWinProb };
  }
  return { side: 'home', edge: bestHome, prob: score.homeWinProb };
}

/** Standard confidence resolution — applies DQ/SA adjustment multiplier */
function resolveConfidence(edge, thresholdSet, dataQuality, signalAgreement) {
  if (edge == null || !isFinite(edge)) return null;

  const adjusted = edge * (0.7 + 0.2 * dataQuality + 0.1 * signalAgreement);

  let tier, tierScore;
  if (adjusted >= thresholdSet.high) { tier = 'high'; tierScore = 0.8 + Math.min(0.2, (adjusted - thresholdSet.high) * 2); }
  else if (adjusted >= thresholdSet.medium) { tier = 'medium'; tierScore = 0.5 + (adjusted - thresholdSet.medium) / (thresholdSet.high - thresholdSet.medium) * 0.3; }
  else if (adjusted >= thresholdSet.low) { tier = 'low'; tierScore = 0.2 + (adjusted - thresholdSet.low) / (thresholdSet.medium - thresholdSet.low) * 0.3; }
  else return null;

  return { tier, score: Math.round(tierScore * 100) / 100 };
}

/** Raw confidence resolution — NO DQ/SA multiplier, just raw edge vs thresholds.
 *  Used for Value Leans and Totals to ensure they populate. */
function resolveRawConfidence(rawEdge, thresholdSet, dataQuality) {
  if (rawEdge == null || !isFinite(rawEdge)) return null;

  let tier, tierScore;
  if (rawEdge >= thresholdSet.high) { tier = 'high'; tierScore = 0.8; }
  else if (rawEdge >= thresholdSet.medium) { tier = 'medium'; tierScore = 0.5; }
  else if (rawEdge >= thresholdSet.low) { tier = 'low'; tierScore = 0.25; }
  else return null;

  // Mild DQ adjustment on the score (not the threshold gate)
  tierScore = tierScore * (0.85 + 0.15 * dataQuality);
  return { tier, score: Math.round(tierScore * 100) / 100 };
}

function evaluateRunLine(matchup, score, thresholds) {
  const rl = matchup.market?.runLine;
  if (!rl || rl.homeLine == null) return null;

  const side = chooseBestSide(score);
  if (!side || side.edge <= 0) return null;

  // Run line needs some directional conviction
  const marginProxy = Math.abs(score.awayWinProb - score.homeWinProb);
  if (marginProxy < 0.03) return null;

  // Use raw confidence (like Leans/Totals) so ATS actually populates
  const rlEdge = side.edge * 0.90;
  const conf = resolveRawConfidence(rlEdge, thresholds.runLine, score.dataQuality);
  if (!conf) return null;

  const team = side.side === 'away' ? matchup.awayTeam : matchup.homeTeam;
  const line = side.side === 'away' ? rl.awayLine : rl.homeLine;

  return {
    id: `${matchup.gameId}-ats`,
    gameId: matchup.gameId,
    category: 'ats',
    confidence: conf.tier,
    confidenceScore: conf.score,
    matchup: buildMatchupPayload(matchup),
    market: matchup.market,
    pick: {
      label: `${team.shortName} ${line > 0 ? '+' : ''}${line}`,
      side: side.side, value: line, marketType: 'runline',
      explanation: `Model favors ${team.shortName} to cover the run line.`,
      topSignals: score.topSignals,
    },
    model: buildModelPayload(score),
  };
}

function evaluateTotal(matchup, score, thresholds) {
  const total = matchup.market?.total;
  if (!total || total.points == null) return null;

  const estimatedTotal = score.expectedTotal;
  if (!estimatedTotal || !isFinite(estimatedTotal)) return null;

  const diff = estimatedTotal - total.points;
  // Boosted multiplier for narrow MLB total variance
  const edge = Math.abs(diff) * 0.22;

  // Use RAW confidence (no DQ/SA multiplier) so totals populate reliably
  const conf = resolveRawConfidence(edge, thresholds.total, score.dataQuality);
  if (!conf) return null;

  const direction = diff > 0 ? 'Over' : 'Under';

  return {
    id: `${matchup.gameId}-total`,
    gameId: matchup.gameId,
    category: 'totals',
    confidence: conf.tier,
    confidenceScore: conf.score,
    matchup: buildMatchupPayload(matchup),
    market: matchup.market,
    pick: {
      label: `${direction} ${total.points}`,
      side: direction.toLowerCase(), value: total.points, marketType: 'total',
      explanation: `Model leans ${direction.toLowerCase()} based on team quality matchup.`,
      topSignals: score.topSignals,
    },
    model: buildModelPayload(score),
  };
}

function buildPick(matchup, score, side, category, marketType, conf) {
  const team = side.side === 'away' ? matchup.awayTeam : matchup.homeTeam;
  const ml = side.side === 'away' ? matchup.market?.moneyline?.away : matchup.market?.moneyline?.home;
  const mlDisplay = ml != null ? (ml > 0 ? `+${ml}` : `${ml}`) : '';

  return {
    id: `${matchup.gameId}-${category}`,
    gameId: matchup.gameId,
    category,
    confidence: conf.tier,
    confidenceScore: conf.score,
    matchup: buildMatchupPayload(matchup),
    market: matchup.market,
    pick: {
      label: `${team.shortName} ${mlDisplay}`.trim(),
      side: side.side, value: ml, marketType,
      explanation: category === 'leans'
        ? `Directional lean toward ${team.name} — moderate value signal.`
        : `Model favors ${team.name} with a ${(side.edge * 100).toFixed(1)}% edge.`,
      topSignals: score.topSignals,
    },
    model: buildModelPayload(score),
  };
}

function buildMatchupPayload(matchup) {
  return {
    awayTeam: { slug: matchup.awayTeam.slug, name: matchup.awayTeam.name, shortName: matchup.awayTeam.shortName, logo: matchup.awayTeam.logo, record: matchup.awayTeam.record },
    homeTeam: { slug: matchup.homeTeam.slug, name: matchup.homeTeam.name, shortName: matchup.homeTeam.shortName, logo: matchup.homeTeam.logo, record: matchup.homeTeam.record },
    startTime: matchup.startTime,
  };
}

function buildModelPayload(score) {
  return {
    awayWinProb: round(score.awayWinProb), homeWinProb: round(score.homeWinProb),
    impliedAwayWinProb: round(score.impliedAwayWinProb), impliedHomeWinProb: round(score.impliedHomeWinProb),
    edge: round(Math.max(score.awayEdge ?? 0, score.homeEdge ?? 0)),
    dataQuality: round(score.dataQuality), signalAgreement: round(score.signalAgreement),
  };
}

function round(v) { return v != null ? Math.round(v * 1000) / 1000 : null; }
