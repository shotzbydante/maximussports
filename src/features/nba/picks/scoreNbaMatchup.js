/**
 * scoreNbaMatchup — compute model probabilities and edges for an NBA matchup.
 *
 * Signals used:
 *   - Market moneyline (implied probability)
 *   - Market spread (implied advantage)
 *   - Teams' records if present
 *   - Home-court advantage (~3 pts)
 *
 * Returns { awayWinProb, homeWinProb, impliedAwayWinProb, impliedHomeWinProb,
 *           edge, dataQuality, signalAgreement, expectedTotal, spreadEdge, totalEdge }
 */

function americanToImpliedProb(american) {
  if (american == null || !Number.isFinite(american)) return null;
  if (american < 0) return (-american) / ((-american) + 100);
  return 100 / (american + 100);
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function recordPct(record) {
  if (!record || typeof record !== 'string') return null;
  const parts = record.split('-').map(Number);
  if (parts.length < 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) return null;
  const total = parts[0] + parts[1];
  return total > 0 ? parts[0] / total : null;
}

/**
 * Convert spread to a pseudo win probability using a logistic curve.
 * A -7.5 favorite in the NBA wins roughly 72% of the time.
 */
function spreadToWinProb(spread) {
  if (spread == null || !Number.isFinite(spread)) return null;
  // Negative spread = favored; ~0.28 stddev scaling produces NBA-shaped curve
  return 1 / (1 + Math.exp(0.125 * spread));
}

export function scoreNbaMatchup(matchup) {
  if (!matchup) return null;
  const { homeTeam, awayTeam, market = {} } = matchup;

  const mlHome = market.moneyline;
  // NBA odds API sometimes provides home-only ML; compute away as complement via implied probabilities
  const impliedHome = americanToImpliedProb(mlHome);
  const impliedAway = impliedHome != null ? 1 - impliedHome : null;

  // Spread-based win prob (home perspective, negative spread = home favored)
  const spread = market.pregameSpread;
  const spreadProbHome = spreadToWinProb(spread);

  // Record-based baseline
  const homeRecPct = recordPct(homeTeam?.record);
  const awayRecPct = recordPct(awayTeam?.record);
  let recBaselineHome = null;
  if (homeRecPct != null && awayRecPct != null) {
    const combined = homeRecPct + awayRecPct;
    if (combined > 0) {
      recBaselineHome = homeRecPct / combined;
    }
  }

  // Home-court bonus: ~3pt advantage in NBA = ~6% probability boost
  const hcaBoost = 0.055;

  // Blend available signals
  const signals = [];
  if (impliedHome != null) signals.push({ prob: impliedHome, weight: 0.45 });
  if (spreadProbHome != null) signals.push({ prob: spreadProbHome, weight: 0.35 });
  if (recBaselineHome != null) signals.push({ prob: clamp(recBaselineHome + hcaBoost, 0.2, 0.8), weight: 0.20 });

  if (signals.length === 0) {
    return {
      awayWinProb: 0.5, homeWinProb: 0.5,
      impliedAwayWinProb: null, impliedHomeWinProb: null,
      edge: 0, dataQuality: 0, signalAgreement: 0,
      expectedTotal: null, spreadEdge: null, totalEdge: null,
    };
  }

  const totalWeight = signals.reduce((s, x) => s + x.weight, 0);
  const modelHomeProb = signals.reduce((s, x) => s + x.prob * x.weight, 0) / totalWeight;
  const modelAwayProb = 1 - modelHomeProb;

  // Edge: model vs market (if market available, positive = home edge)
  let edge = 0;
  if (impliedHome != null) edge = modelHomeProb - impliedHome;

  // Spread edge: model's implied spread (from modelHomeProb) vs market spread
  // Convert probability back to spread estimate using inverse logistic
  let modelSpread = null;
  if (modelHomeProb > 0.01 && modelHomeProb < 0.99) {
    modelSpread = Math.log((1 / modelHomeProb) - 1) / 0.125;
  }
  const spreadEdge = (modelSpread != null && spread != null) ? (spread - modelSpread) : null;

  // Data quality — count how many signals we have, weighted
  const dataQuality = clamp(totalWeight / 1.0, 0, 1);

  // Signal agreement — variance across signals (lower variance = higher agreement)
  const meanProb = modelHomeProb;
  const variance = signals.reduce((s, x) => s + Math.pow(x.prob - meanProb, 2), 0) / signals.length;
  const signalAgreement = clamp(1 - variance * 4, 0, 1);

  // Total edge (not used for spread/ML picks, but kept for completeness)
  // We don't have a team-level scoring prior, so we default to 0
  const totalEdge = 0;

  return {
    awayWinProb: modelAwayProb,
    homeWinProb: modelHomeProb,
    impliedAwayWinProb: impliedAway,
    impliedHomeWinProb: impliedHome,
    edge,
    dataQuality,
    signalAgreement,
    expectedTotal: null,
    spreadEdge,
    totalEdge,
    modelSpread,
  };
}
