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

  // ── Pick 'Ems — moneyline pick (adjusted edge) ──
  const pickEmTier = confidenceTier(adjEdge, thresholds.moneyline);
  if (pickEmTier && mlHome != null) {
    const pickHome = score.edge > 0;
    const team = pickHome ? homeTeam : awayTeam;
    const opp = pickHome ? awayTeam : homeTeam;
    // Use home ML directly; away side is approximated by flipping sign conservatively
    const mlVal = pickHome ? mlHome : (mlHome > 0 ? -mlHome : Math.abs(mlHome));
    const edgePct = Math.round(Math.abs(score.edge) * 1000) / 10;
    picks.push({
      id: `${gameId}-pickems`,
      gameId,
      category: 'pickEms',
      confidence: pickEmTier,
      confidenceScore: Math.abs(adjEdge),
      matchup: { awayTeam, homeTeam, startTime, network },
      market: { moneyline: mlHome, spread, total },
      pick: {
        label: `${team.abbrev || team.shortName} ${formatOdds(mlVal)}`,
        side: pickHome ? 'home' : 'away',
        value: mlVal,
        marketType: 'moneyline',
        explanation: `Model gives ${team.shortName || team.name} ${Math.round((pickHome ? score.homeWinProb : score.awayWinProb) * 100)}% win probability vs. ${Math.round((pickHome ? (score.impliedHomeWinProb ?? 0.5) : (score.impliedAwayWinProb ?? 0.5)) * 100)}% implied.`,
        topSignals: [
          `${edgePct}% edge`,
          `${Math.round(score.dataQuality * 100)}% data quality`,
          pickEmTier === 'high' ? 'High conviction' : pickEmTier === 'medium' ? 'Solid lean' : 'Slight edge',
        ],
      },
    });
  }

  // ── ATS — spread pick (adjusted spread edge) ──
  const atsTier = confidenceTier(score.spreadEdge, thresholds.spread);
  if (atsTier && spread != null) {
    // Positive spreadEdge means model thinks HOME should be favored MORE than market
    const pickHome = score.spreadEdge > 0;
    const team = pickHome ? homeTeam : awayTeam;
    const spreadVal = pickHome ? spread : -spread;
    picks.push({
      id: `${gameId}-ats`,
      gameId,
      category: 'ats',
      confidence: atsTier,
      confidenceScore: Math.abs(score.spreadEdge),
      matchup: { awayTeam, homeTeam, startTime, network },
      market: { moneyline: mlHome, spread, total },
      pick: {
        label: `${team.abbrev || team.shortName} ${formatSpread(spreadVal)}`,
        side: pickHome ? 'home' : 'away',
        value: spreadVal,
        marketType: 'spread',
        explanation: `Model fair spread differs from market by ${Math.abs(score.spreadEdge).toFixed(1)} points \u2014 lean ${team.shortName || team.name} against the number.`,
        topSignals: [
          `${Math.abs(score.spreadEdge).toFixed(1)}pt spread edge`,
          `Market ${formatSpread(spread)}`,
          atsTier === 'high' ? 'High conviction' : atsTier === 'medium' ? 'Strong lean' : 'Mild lean',
        ],
      },
    });
  }

  // ── Value Leans — softer ML threshold, only if pickEm didn't fire (or fired low) ──
  const leanTier = confidenceTier(score.edge, thresholds.lean);
  const pickEmFired = picks.some(p => p.category === 'pickEms');
  if (!pickEmFired && leanTier && mlHome != null) {
    const pickHome = score.edge > 0;
    const team = pickHome ? homeTeam : awayTeam;
    picks.push({
      id: `${gameId}-leans`,
      gameId,
      category: 'leans',
      confidence: 'low',
      confidenceScore: Math.abs(score.edge),
      matchup: { awayTeam, homeTeam, startTime, network },
      market: { moneyline: mlHome, spread, total },
      pick: {
        label: `Lean ${team.abbrev || team.shortName}`,
        side: pickHome ? 'home' : 'away',
        marketType: 'moneyline',
        explanation: `Slight value on ${team.shortName || team.name} \u2014 model sees a small edge vs. the market price.`,
        topSignals: [
          'Value lean',
          `${Math.round(Math.abs(score.edge) * 1000) / 10}% edge`,
        ],
      },
    });
  }

  // ── Totals ──
  // We don't currently have a team-total model, so totals only fire when
  // the game has a total line AND we have a usable spread edge to borrow
  // variance context. Conservative by design.
  if (total != null && score.modelSpread != null && Math.abs(score.modelSpread - (spread ?? 0)) >= thresholds.total.low) {
    // Use spread dislocation as a loose total proxy — wider-than-expected edge
    // often implies higher variance which correlates with totals.
    const tEdge = Math.abs(score.spreadEdge ?? 0) * 1.8;
    const totalTier = confidenceTier(tEdge, thresholds.total);
    if (totalTier) {
      // Default lean: if model sees home much stronger, expect higher-scoring (more blowout volatility)
      const overUnder = (score.spreadEdge ?? 0) > 0 ? 'Over' : 'Under';
      picks.push({
        id: `${gameId}-totals`,
        gameId,
        category: 'totals',
        confidence: totalTier,
        confidenceScore: tEdge,
        matchup: { awayTeam, homeTeam, startTime, network },
        market: { moneyline: mlHome, spread, total },
        pick: {
          label: `${overUnder} ${total}`,
          side: overUnder.toLowerCase(),
          value: total,
          marketType: 'total',
          explanation: `Spread dislocation (${Math.abs(score.spreadEdge ?? 0).toFixed(1)}pt) suggests variance trends ${overUnder.toLowerCase()} the ${total} total.`,
          topSignals: [
            `O/U ${total}`,
            `${totalTier} conviction`,
          ],
        },
      });
    }
  }

  return picks.slice(0, thresholds.MAX_PICKS_PER_GAME);
}
