/**
 * scoreMlbMatchup — compute model probabilities and edges for a normalized MLB matchup.
 *
 * Uses a weighted scorecard with all available signals from season model inputs.
 * Missing signals gracefully reduce data quality rather than crash.
 */

/**
 * @param {Object} matchup - normalized matchup from normalizeMlbMatchup
 * @returns {Object} scoring result
 */
export function scoreMlbMatchup(matchup) {
  const signals = [];
  let dataQuality = 0;
  let homeAdv = 0;
  let awayAdv = 0;

  const away = matchup.awayTeam;
  const home = matchup.homeTeam;

  // ── Signal 1: Projected wins delta (weight: 0.28) ──
  if (isUsable(away.projectedWins) && isUsable(home.projectedWins)) {
    const delta = normalizeDelta(away.projectedWins - home.projectedWins, 20);
    awayAdv += delta * 0.28;
    homeAdv -= delta * 0.28;
    signals.push(sig('Projected wins', delta));
    dataQuality += 0.20;
  }

  // ── Signal 2: Current record strength (weight: 0.14) ──
  const awayWpct = parseRecordStrength(away.record);
  const homeWpct = parseRecordStrength(home.record);
  if (isUsable(awayWpct) && isUsable(homeWpct)) {
    const delta = normalizeDelta(awayWpct - homeWpct, 0.25);
    awayAdv += delta * 0.14;
    homeAdv -= delta * 0.14;
    signals.push(sig('Current record', delta));
    dataQuality += 0.12;
  }

  // ── Signal 3: Offense composite (weight: 0.12) ──
  if (isUsable(away.offenseScore) && isUsable(home.offenseScore)) {
    const delta = normalizeDelta(away.offenseScore - home.offenseScore, 5);
    awayAdv += delta * 0.12;
    homeAdv -= delta * 0.12;
    signals.push(sig('Offense', delta));
    dataQuality += 0.10;
  }

  // ── Signal 4: Run prevention composite (weight: 0.16) ──
  if (isUsable(away.runPreventionScore) && isUsable(home.runPreventionScore)) {
    const delta = normalizeDelta(away.runPreventionScore - home.runPreventionScore, 5);
    awayAdv += delta * 0.16;
    homeAdv -= delta * 0.16;
    signals.push(sig('Pitching/defense', delta));
    dataQuality += 0.12;
  }

  // ── Signal 5: Bullpen quality (weight: 0.08) ──
  if (isUsable(away.bullpenQuality) && isUsable(home.bullpenQuality)) {
    const delta = normalizeDelta(away.bullpenQuality - home.bullpenQuality, 5);
    awayAdv += delta * 0.08;
    homeAdv -= delta * 0.08;
    signals.push(sig('Bullpen', delta));
    dataQuality += 0.06;
  }

  // ── Signal 6: Home field advantage (weight: 0.06) ──
  homeAdv += 0.06;
  dataQuality += 0.04;

  // ── Signal 7: Market dislocation from live enricher (weight: 0.10) ──
  if (isUsable(matchup.modelEdge)) {
    const edgeDir = matchup.modelEdge > 0 ? 1 : -1;
    awayAdv += matchup.modelEdge * 0.10 * edgeDir;
    signals.push(sig('Market edge', matchup.modelEdge * edgeDir));
    dataQuality += 0.10;
  }

  // ── Signal 8: Model confidence from season projection ──
  if (isUsable(away.confidenceScore) && isUsable(home.confidenceScore)) {
    dataQuality += 0.06;
  }

  // ── Signal 9: Frontline rotation (weight: 0.06) ──
  if (isUsable(away.frontlineRotation) && isUsable(home.frontlineRotation)) {
    const delta = normalizeDelta(away.frontlineRotation - home.frontlineRotation, 5);
    awayAdv += delta * 0.06;
    homeAdv -= delta * 0.06;
    signals.push(sig('Rotation quality', delta));
    dataQuality += 0.06;
  }

  // ── Adjust DQ based on signal differentiation ──
  // Base DQ from availability is always ~0.76-0.86 since all teams have
  // static inputs. Modulate by how much signals actually differentiate
  // this specific matchup (close teams → lower effective DQ).
  const totalSignalMagnitude = signals.reduce((sum, s) => sum + Math.abs(s.delta), 0);
  const avgMagnitude = signals.length > 0 ? totalSignalMagnitude / signals.length : 0;
  // Scale: avgMag ~0 (identical teams) → -0.30 penalty, avgMag ~0.5+ → no penalty
  const differentiationBonus = clamp(avgMagnitude * 2 - 0.30, -0.30, 0.10);
  dataQuality = clamp(dataQuality + differentiationBonus, 0.15, 1);

  // ── Convert advantages to win probabilities ──
  const netAdv = awayAdv - homeAdv;
  const awayWinProb = scoreToWinProb(netAdv);
  const homeWinProb = 1 - awayWinProb;

  // ── Implied probabilities from market ──
  const impliedAway = moneylineToImplied(matchup.market?.moneyline?.away);
  const impliedHome = moneylineToImplied(matchup.market?.moneyline?.home);

  // ── Edges ──
  const awayEdge = isUsable(impliedAway) ? awayWinProb - impliedAway : null;
  const homeEdge = isUsable(impliedHome) ? homeWinProb - impliedHome : null;

  // ── Signal agreement ──
  const signalAgreement = computeSignalAgreement(signals);

  // ── Expected total estimation (for totals picks) ──
  const expectedTotal = estimateExpectedTotal(away, home);

  return {
    awayWinProb,
    homeWinProb,
    impliedAwayWinProb: impliedAway ?? null,
    impliedHomeWinProb: impliedHome ?? null,
    awayEdge,
    homeEdge,
    dataQuality,
    signalAgreement,
    expectedTotal,
    topSignals: selectTopSignals(signals, 3),
  };
}

// ── Helpers ──

function isUsable(v) { return v != null && isFinite(v); }
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function normalizeDelta(value, scale) { return clamp(value / scale, -1, 1); }
function sig(label, delta) {
  return { label, delta, direction: delta > 0 ? 'away' : delta < 0 ? 'home' : 'neutral' };
}

/** Sigmoid: net advantage → win probability. k=3.5 so ±0.3 → ~58/42% */
function scoreToWinProb(netAdv) {
  return 1 / (1 + Math.exp(-3.5 * netAdv));
}

/** American moneyline → implied probability (0–1) */
function moneylineToImplied(ml) {
  if (ml == null || !isFinite(ml)) return null;
  if (ml > 0) return 100 / (ml + 100);
  if (ml < 0) return -ml / (-ml + 100);
  return 0.5;
}

/** "W-L" → win fraction */
function parseRecordStrength(record) {
  if (!record || typeof record !== 'string') return null;
  const m = record.match(/^(\d+)-(\d+)/);
  if (!m) return null;
  const w = parseInt(m[1], 10), l = parseInt(m[2], 10);
  return (w + l) > 0 ? w / (w + l) : null;
}

function computeSignalAgreement(signals) {
  const dirs = signals.filter(s => s.direction && s.direction !== 'neutral').map(s => s.direction);
  if (dirs.length < 2) return 0.5;
  const homeCount = dirs.filter(d => d === 'home').length;
  const awayCount = dirs.filter(d => d === 'away').length;
  return Math.max(homeCount, awayCount) / dirs.length;
}

function selectTopSignals(signals, n) {
  return signals
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, n)
    .map(s => {
      const dir = s.direction === 'away' ? 'away' : 'home';
      const strength = Math.abs(s.delta) > 0.3 ? 'strong' : Math.abs(s.delta) > 0.1 ? 'moderate' : 'slight';
      return `${s.label} (${strength} ${dir} edge)`;
    });
}

/** Estimate expected game total from team quality inputs. */
function estimateExpectedTotal(away, home) {
  const leagueAvg = 8.5;
  let adj = 0;
  // Offense drives total up
  if (isUsable(away.offenseScore) && isUsable(home.offenseScore)) {
    adj += ((away.offenseScore - 5.5) + (home.offenseScore - 5.5)) * 0.12;
  }
  // Run prevention drives total down
  if (isUsable(away.runPreventionScore) && isUsable(home.runPreventionScore)) {
    adj -= ((away.runPreventionScore - 5.5) + (home.runPreventionScore - 5.5)) * 0.10;
  }
  // Projected wins proxy (higher combined → more balanced → closer to avg)
  if (isUsable(away.projectedWins) && isUsable(home.projectedWins)) {
    adj += ((away.projectedWins - 81) + (home.projectedWins - 81)) * 0.005;
  }
  return leagueAvg + adj;
}
