/**
 * scoreMlbMatchup — compute model probabilities and edges for a normalized MLB matchup.
 *
 * Uses a weighted scorecard with available signals.
 * Missing signals gracefully reduce data quality rather than crash.
 */

/**
 * @param {Object} matchup - normalized matchup from normalizeMlbMatchup
 * @returns {Object} scoring result
 */
export function scoreMlbMatchup(matchup) {
  const signals = [];
  let dataQuality = 0;
  let homeAdvantage = 0;
  let awayAdvantage = 0;

  const away = matchup.awayTeam;
  const home = matchup.homeTeam;

  // ── Signal 1: Projected wins delta (weight: 0.30) ──
  if (isUsable(away.projectedWins) && isUsable(home.projectedWins)) {
    const delta = normalizeDelta(away.projectedWins - home.projectedWins, 20);
    awayAdvantage += delta * 0.30;
    homeAdvantage -= delta * 0.30;
    signals.push({ label: 'Projected wins', delta, direction: delta > 0 ? 'away' : 'home' });
    dataQuality += 0.22;
  }

  // ── Signal 2: Current record strength (weight: 0.18) ──
  const awayRecStr = parseRecordStrength(away.record);
  const homeRecStr = parseRecordStrength(home.record);
  if (isUsable(awayRecStr) && isUsable(homeRecStr)) {
    const delta = normalizeDelta(awayRecStr - homeRecStr, 0.25);
    awayAdvantage += delta * 0.18;
    homeAdvantage -= delta * 0.18;
    signals.push({ label: 'Current record', delta, direction: delta > 0 ? 'away' : 'home' });
    dataQuality += 0.14;
  }

  // ── Signal 3: Home field advantage (weight: 0.08) ──
  homeAdvantage += 0.08;
  signals.push({ label: 'Home field', delta: -0.08, direction: 'home' });

  // ── Signal 4: Starting pitcher (weight: 0.24) ──
  if (isUsable(away.startingPitcherScore) && isUsable(home.startingPitcherScore)) {
    const delta = normalizeDelta(away.startingPitcherScore - home.startingPitcherScore, 25);
    awayAdvantage += delta * 0.24;
    homeAdvantage -= delta * 0.24;
    signals.push({ label: 'Starting pitcher', delta, direction: delta > 0 ? 'away' : 'home' });
    dataQuality += 0.20;
  }

  // ── Signal 5: Run prevention (weight: 0.10) ──
  if (isUsable(away.runPreventionScore) && isUsable(home.runPreventionScore)) {
    const delta = normalizeDelta(away.runPreventionScore - home.runPreventionScore, 20);
    awayAdvantage += delta * 0.10;
    homeAdvantage -= delta * 0.10;
    signals.push({ label: 'Run prevention', delta, direction: delta > 0 ? 'away' : 'home' });
    dataQuality += 0.08;
  }

  // ── Signal 6: Offense (weight: 0.10) ──
  if (isUsable(away.offenseScore) && isUsable(home.offenseScore)) {
    const delta = normalizeDelta(away.offenseScore - home.offenseScore, 20);
    awayAdvantage += delta * 0.10;
    homeAdvantage -= delta * 0.10;
    signals.push({ label: 'Offense', delta, direction: delta > 0 ? 'away' : 'home' });
    dataQuality += 0.08;
  }

  // ── Signal 7: Model confidence from season model (weight: 0.10) ──
  if (isUsable(away.confidenceScore) && isUsable(home.confidenceScore)) {
    // Higher confidence in projection = more reliable signal
    dataQuality += 0.08;
  }

  // ── Signal 8: Market edge from existing model enrichment ──
  if (isUsable(matchup.modelEdge)) {
    // Existing model edge from the live games enricher — treat as a corroborating signal
    const edgeDir = matchup.modelEdge > 0 ? 'away' : 'home';
    signals.push({ label: 'Market dislocation', delta: matchup.modelEdge * 0.5, direction: edgeDir });
    dataQuality += 0.10;
  }

  dataQuality = clamp(dataQuality, 0, 1);

  // ── Convert advantages to win probabilities ──
  const netAdvantage = awayAdvantage - homeAdvantage;
  const awayWinProb = scoreToWinProb(netAdvantage);
  const homeWinProb = 1 - awayWinProb;

  // ── Implied probabilities from market ──
  const impliedAwayWinProb = moneylineToImplied(matchup.market?.moneyline?.away);
  const impliedHomeWinProb = moneylineToImplied(matchup.market?.moneyline?.home);

  // ── Edges ──
  const awayEdge = isUsable(impliedAwayWinProb) ? awayWinProb - impliedAwayWinProb : null;
  const homeEdge = isUsable(impliedHomeWinProb) ? homeWinProb - impliedHomeWinProb : null;

  // ── Signal agreement ──
  const signalAgreement = computeSignalAgreement(signals);

  return {
    awayWinProb,
    homeWinProb,
    impliedAwayWinProb: impliedAwayWinProb ?? null,
    impliedHomeWinProb: impliedHomeWinProb ?? null,
    awayEdge,
    homeEdge,
    dataQuality,
    signalAgreement,
    topSignals: selectTopSignals(signals, 3),
  };
}

// ── Helpers ──

function isUsable(v) { return v != null && isFinite(v); }

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

/** Compress raw delta into roughly -1 to 1 range */
function normalizeDelta(value, scale) {
  return clamp(value / scale, -1, 1);
}

/** Sigmoid: convert net advantage to win probability */
function scoreToWinProb(netAdvantage) {
  // Scale factor tuned so ±0.3 → roughly 57/43% split
  const k = 4.0;
  return 1 / (1 + Math.exp(-k * netAdvantage));
}

/** Convert American moneyline to implied probability (0–1) */
function moneylineToImplied(ml) {
  if (ml == null || !isFinite(ml)) return null;
  if (ml > 0) return 100 / (ml + 100);
  if (ml < 0) return -ml / (-ml + 100);
  return 0.5;
}

/** Parse "W-L" record string to win fraction */
function parseRecordStrength(record) {
  if (!record || typeof record !== 'string') return null;
  const m = record.match(/^(\d+)-(\d+)/);
  if (!m) return null;
  const w = parseInt(m[1], 10);
  const l = parseInt(m[2], 10);
  const total = w + l;
  if (total === 0) return null;
  return w / total;
}

/** Measure how consistently signals point the same direction */
function computeSignalAgreement(signals) {
  if (signals.length < 2) return 0.5;
  const dirs = signals.filter(s => s.direction).map(s => s.direction);
  if (dirs.length < 2) return 0.5;
  const homeCount = dirs.filter(d => d === 'home').length;
  const awayCount = dirs.filter(d => d === 'away').length;
  const majority = Math.max(homeCount, awayCount);
  return majority / dirs.length;
}

/** Select top N signals by absolute delta magnitude */
function selectTopSignals(signals, n) {
  return signals
    .filter(s => s.label !== 'Home field') // always present, not interesting
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, n)
    .map(s => {
      const dir = s.direction === 'away' ? 'Away' : 'Home';
      const strength = Math.abs(s.delta) > 0.15 ? 'strong' : Math.abs(s.delta) > 0.05 ? 'moderate' : 'slight';
      return `${s.label} (${strength} ${dir.toLowerCase()} edge)`;
    });
}
