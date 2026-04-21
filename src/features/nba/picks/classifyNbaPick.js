/**
 * classifyNbaPick — apply thresholds to generate 0-4 picks per game.
 * Categories: pickEms (moneyline), ats (spread), leans (soft ML), totals.
 */

function formatOdds(american) {
  if (american == null) return '';
  return american > 0 ? `+${american}` : `${american}`;
}

function formatSpread(v) {
  if (v == null) return '';
  return v > 0 ? `+${v}` : `${v}`;
}

function confidenceTier(edge, thresholds) {
  const abs = Math.abs(edge);
  if (abs >= thresholds.high) return 'high';
  if (abs >= thresholds.medium) return 'medium';
  if (abs >= thresholds.low) return 'low';
  return null;
}

export function classifyNbaPick(matchup, score, thresholds) {
  if (!matchup || !score) return [];
  if (score.dataQuality < thresholds.minDataQuality) return [];

  const picks = [];
  const { awayTeam, homeTeam, market = {}, startTime, gameId, network } = matchup;
  const mlHome = market.moneyline;
  const spread = market.pregameSpread;
  const total = market.pregameTotal;

  // Adjusted edge uses data quality and signal agreement as confidence multipliers
  const dqSa = score.dataQuality * (0.6 + 0.4 * score.signalAgreement);
  const adjEdge = score.edge * dqSa;

  // NBA-native signal builder — reads playoff / home-court / record context
  function buildNbaSignals(team, opp, pickHome, tier) {
    const signals = [];
    // Home-court advantage
    if (pickHome) signals.push(`Home-court edge at ${team.shortName || team.name}`);
    // Record comparison
    const homePct = homeTeam.record ? parseRecord(homeTeam.record) : null;
    const awayPct = awayTeam.record ? parseRecord(awayTeam.record) : null;
    if (homePct != null && awayPct != null) {
      const betterPct = Math.max(homePct, awayPct);
      const worsePct = Math.min(homePct, awayPct);
      if (betterPct - worsePct >= 0.08) {
        signals.push(`${team.shortName || team.name} hold the better regular-season record`);
      }
    }
    // Spread-implied market signal
    if (spread != null) {
      const homeFavorite = spread < 0;
      if (pickHome === homeFavorite) {
        signals.push(`Market has ${team.shortName || team.name} as favorite at ${formatSpread(pickHome ? spread : -spread)}`);
      } else {
        signals.push(`Taking underdog value vs. market favorite`);
      }
    }
    // Conviction tier
    signals.push(tier === 'high' ? 'High-conviction play' : tier === 'medium' ? 'Solid lean' : 'Slight edge');
    return signals.slice(0, 3);
  }

  function parseRecord(r) {
    if (!r) return null;
    const parts = r.split('-').map(Number);
    const total = parts[0] + parts[1];
    return total > 0 ? parts[0] / total : null;
  }

  // ── Pick 'Ems — moneyline pick (adjusted edge) ──
  const pickEmTier = confidenceTier(adjEdge, thresholds.moneyline);
  if (pickEmTier && mlHome != null) {
    const pickHome = score.edge > 0;
    const team = pickHome ? homeTeam : awayTeam;
    const opp = pickHome ? awayTeam : homeTeam;
    const mlVal = pickHome ? mlHome : (mlHome > 0 ? -mlHome : Math.abs(mlHome));
    picks.push({
      id: `${gameId}-pickems`,
      gameId,
      category: 'pickEms',
      confidence: pickEmTier,
      confidenceScore: Math.abs(adjEdge),
      matchup: { awayTeam, homeTeam, startTime, network },
      market: { moneyline: mlHome, spread, total },
      model: { edge: Math.abs(score.edge), dataQuality: score.dataQuality, signalAgreement: score.signalAgreement },
      pick: {
        label: `${team.abbrev || team.shortName} ${formatOdds(mlVal)}`,
        side: pickHome ? 'home' : 'away',
        value: mlVal,
        marketType: 'moneyline',
        explanation: `Model gives ${team.shortName || team.name} ${Math.round((pickHome ? score.homeWinProb : score.awayWinProb) * 100)}% win probability vs. ${Math.round((pickHome ? (score.impliedHomeWinProb ?? 0.5) : (score.impliedAwayWinProb ?? 0.5)) * 100)}% implied by the market.`,
        topSignals: buildNbaSignals(team, opp, pickHome, pickEmTier),
      },
    });
  }

  // ── ATS — spread pick (adjusted spread edge) ──
  const atsTier = confidenceTier(score.spreadEdge, thresholds.spread);
  if (atsTier && spread != null) {
    const pickHome = score.spreadEdge > 0;
    const team = pickHome ? homeTeam : awayTeam;
    const opp = pickHome ? awayTeam : homeTeam;
    const spreadVal = pickHome ? spread : -spread;
    picks.push({
      id: `${gameId}-ats`,
      gameId,
      category: 'ats',
      confidence: atsTier,
      confidenceScore: Math.abs(score.spreadEdge),
      matchup: { awayTeam, homeTeam, startTime, network },
      market: { moneyline: mlHome, spread, total },
      model: { edge: Math.abs(score.spreadEdge) / 20, dataQuality: score.dataQuality, signalAgreement: score.signalAgreement },
      pick: {
        label: `${team.abbrev || team.shortName} ${formatSpread(spreadVal)}`,
        side: pickHome ? 'home' : 'away',
        value: spreadVal,
        marketType: 'spread',
        explanation: `Model fair spread disagrees with the market by ${Math.abs(score.spreadEdge).toFixed(1)} points. Value is on ${team.shortName || team.name} at ${formatSpread(spreadVal)}.`,
        topSignals: [
          `${Math.abs(score.spreadEdge).toFixed(1)}pt disagreement vs. market`,
          pickHome ? `${team.shortName} at home` : `Road value on ${team.shortName}`,
          atsTier === 'high' ? 'High-conviction cover' : atsTier === 'medium' ? 'Strong lean' : 'Mild lean',
        ],
      },
    });
  }

  // ── Value Leans — softer ML threshold, only if pickEm didn't fire ──
  const leanTier = confidenceTier(score.edge, thresholds.lean);
  const pickEmFired = picks.some(p => p.category === 'pickEms');
  if (!pickEmFired && leanTier && mlHome != null) {
    const pickHome = score.edge > 0;
    const team = pickHome ? homeTeam : awayTeam;
    const opp = pickHome ? awayTeam : homeTeam;
    picks.push({
      id: `${gameId}-leans`,
      gameId,
      category: 'leans',
      confidence: 'low',
      confidenceScore: Math.abs(score.edge),
      matchup: { awayTeam, homeTeam, startTime, network },
      market: { moneyline: mlHome, spread, total },
      model: { edge: Math.abs(score.edge), dataQuality: score.dataQuality, signalAgreement: score.signalAgreement },
      pick: {
        label: `Lean ${team.abbrev || team.shortName}`,
        side: pickHome ? 'home' : 'away',
        marketType: 'moneyline',
        explanation: `Soft value on ${team.shortName || team.name}. Model sees a small pricing gap vs. ${opp.shortName || opp.name} that may be underpriced by the market.`,
        topSignals: [
          `${Math.round(Math.abs(score.edge) * 1000) / 10}% moneyline edge`,
          pickHome ? 'Home-court value' : 'Road underdog value',
          'Market mispricing signal',
        ],
      },
    });
  }

  // ── Totals ──
  // Uses spread dislocation as a variance proxy for pace/scoring environment.
  if (total != null && score.modelSpread != null && Math.abs(score.modelSpread - (spread ?? 0)) >= thresholds.total.low) {
    const tEdge = Math.abs(score.spreadEdge ?? 0) * 1.8;
    const totalTier = confidenceTier(tEdge, thresholds.total);
    if (totalTier) {
      const overUnder = (score.spreadEdge ?? 0) > 0 ? 'Over' : 'Under';
      const isOver = overUnder === 'Over';
      picks.push({
        id: `${gameId}-totals`,
        gameId,
        category: 'totals',
        confidence: totalTier,
        confidenceScore: tEdge,
        matchup: { awayTeam, homeTeam, startTime, network },
        market: { moneyline: mlHome, spread, total },
        model: { edge: tEdge / 20, dataQuality: score.dataQuality, signalAgreement: score.signalAgreement },
        pick: {
          label: `${overUnder} ${total}`,
          side: overUnder.toLowerCase(),
          value: total,
          marketType: 'total',
          explanation: isOver
            ? `Model projects a higher-scoring pace than the ${total} total suggests. Value on the Over.`
            : `Model expects a tighter defensive game than the ${total} total suggests. Value on the Under.`,
          topSignals: [
            isOver ? 'Higher-pace scoring environment' : 'Tighter defensive projection',
            `${Math.abs(score.spreadEdge ?? 0).toFixed(1)}pt spread disagreement`,
            `Line: ${total}`,
          ],
        },
      });
    }
  }

  return picks.slice(0, thresholds.MAX_PICKS_PER_GAME);
}
