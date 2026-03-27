/**
 * classifyMlbPick — convert a scored matchup into zero or more pick cards.
 *
 * Picks are classified into: pickEms, ats, leans, totals
 * Each pick gets a confidence tier and score.
 */

import { MAX_PICKS_PER_GAME } from './mlbPickThresholds.js';

/**
 * @param {Object} matchup - normalized matchup
 * @param {Object} score - from scoreMlbMatchup
 * @param {Object} thresholds - from MLB_PICK_THRESHOLDS
 * @returns {Array} pick card models
 */
export function classifyMlbPick(matchup, score, thresholds) {
  const picks = [];

  if (score.dataQuality < thresholds.minDataQuality) {
    return picks;
  }

  // ── Moneyline / Pick 'Em ──
  const mlSide = chooseBestSide(score);
  if (mlSide) {
    const conf = resolveConfidence(mlSide.edge, thresholds.moneyline, score.dataQuality, score.signalAgreement);
    if (conf) {
      picks.push(buildPick(matchup, score, mlSide, 'pickEms', 'moneyline', conf));
    } else {
      // Try as lean instead
      const leanConf = resolveConfidence(mlSide.edge, thresholds.lean, score.dataQuality, score.signalAgreement);
      if (leanConf) {
        picks.push(buildPick(matchup, score, mlSide, 'leans', 'moneyline', leanConf));
      }
    }
  }

  // ── Run Line / ATS ──
  const rlPick = evaluateRunLine(matchup, score, thresholds);
  if (rlPick) picks.push(rlPick);

  // ── Totals ──
  const totalPick = evaluateTotal(matchup, score, thresholds);
  if (totalPick) picks.push(totalPick);

  // Cap picks per game
  return picks
    .sort((a, b) => b.confidenceScore - a.confidenceScore)
    .slice(0, MAX_PICKS_PER_GAME);
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

function evaluateRunLine(matchup, score, thresholds) {
  const rl = matchup.market?.runLine;
  if (!rl || rl.homeLine == null) return null;

  const side = chooseBestSide(score);
  if (!side || side.edge < thresholds.runLine.low * 0.8) return null;

  // Run line requires stronger conviction — need margin proxy
  const marginProxy = Math.abs(score.awayWinProb - score.homeWinProb);
  if (marginProxy < 0.06) return null; // too close for run line

  const rlEdge = side.edge * 0.85; // discount for spread risk
  const conf = resolveConfidence(rlEdge, thresholds.runLine, score.dataQuality, score.signalAgreement);
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
      side: side.side,
      value: line,
      marketType: 'runline',
      explanation: `Model favors ${team.shortName} to cover the run line.`,
      topSignals: score.topSignals,
    },
    model: buildModelPayload(score),
  };
}

function evaluateTotal(matchup, score, thresholds) {
  const total = matchup.market?.total;
  if (!total || total.points == null) return null;

  // Estimate expected total from team quality proxies
  const awayOff = matchup.awayTeam.projectedWins;
  const homeOff = matchup.homeTeam.projectedWins;
  if (awayOff == null || homeOff == null) return null;

  // Rough: higher projected wins ≈ better offense/pitching ratio
  // Use league-average total as anchor and adjust based on team quality
  const leagueAvgTotal = 8.5;
  const awayAdj = (awayOff - 81) * 0.015; // slight adjustment per team
  const homeAdj = (homeOff - 81) * 0.015;
  const estimatedTotal = leagueAvgTotal + awayAdj + homeAdj;

  const diff = estimatedTotal - total.points;
  const edge = Math.abs(diff) * 0.08; // normalize to edge scale

  if (edge < thresholds.total.low) return null;

  const conf = resolveConfidence(edge, thresholds.total, score.dataQuality * 0.7, score.signalAgreement);
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
      side: direction.toLowerCase(),
      value: total.points,
      marketType: 'total',
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
      side: side.side,
      value: ml,
      marketType,
      explanation: category === 'leans'
        ? `Directional lean toward ${team.name} — model sees value but edge is moderate.`
        : `Model favors ${team.name} with a ${(side.edge * 100).toFixed(1)}% edge.`,
      topSignals: score.topSignals,
    },
    model: buildModelPayload(score),
  };
}

function buildMatchupPayload(matchup) {
  return {
    awayTeam: {
      slug: matchup.awayTeam.slug,
      name: matchup.awayTeam.name,
      shortName: matchup.awayTeam.shortName,
      logo: matchup.awayTeam.logo,
      record: matchup.awayTeam.record,
    },
    homeTeam: {
      slug: matchup.homeTeam.slug,
      name: matchup.homeTeam.name,
      shortName: matchup.homeTeam.shortName,
      logo: matchup.homeTeam.logo,
      record: matchup.homeTeam.record,
    },
    startTime: matchup.startTime,
  };
}

function buildModelPayload(score) {
  return {
    awayWinProb: round(score.awayWinProb),
    homeWinProb: round(score.homeWinProb),
    impliedAwayWinProb: round(score.impliedAwayWinProb),
    impliedHomeWinProb: round(score.impliedHomeWinProb),
    edge: round(Math.max(score.awayEdge ?? 0, score.homeEdge ?? 0)),
    dataQuality: round(score.dataQuality),
    signalAgreement: round(score.signalAgreement),
  };
}

function round(v) { return v != null ? Math.round(v * 1000) / 1000 : null; }
