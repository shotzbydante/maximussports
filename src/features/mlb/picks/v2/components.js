/**
 * Bet Score component calculators.
 *
 * Each returns a bounded [0, 1] score. Missing inputs gracefully degrade.
 *
 *   edgeStrength(score, marketType, line)     — |modelProb - impliedProb| normalized
 *   modelConfidence(score)                     — DQ × signalAgreement
 *   situationalEdge(matchup, score)            — rotation, bullpen, home, form
 *   marketQuality(matchup)                     — consensus, line availability
 */

function clamp01(v) { return Math.max(0, Math.min(1, v)); }
function isNum(v) { return v != null && isFinite(v); }

/**
 * Edge strength — squashed probability edge appropriate to the market type.
 * @param {number} rawEdge  model - implied probability (can be negative)
 * @param {'moneyline'|'runline'|'total'} marketType
 * @param {number} totalDelta  only for totals: |expectedTotal - lineTotal| in runs
 * @param {object} caps  from config.components.edge
 */
export function edgeStrength(rawEdge, marketType, totalDelta, caps) {
  if (marketType === 'total') {
    if (!isNum(totalDelta)) return 0;
    const cap = caps?.totDeltaCap ?? 1.5;
    return clamp01(Math.abs(totalDelta) / cap);
  }
  if (!isNum(rawEdge)) return 0;
  const cap = marketType === 'runline' ? (caps?.rlCap ?? 0.08) : (caps?.mlCap ?? 0.10);
  // Soft squash: 1 − exp(−k·x) where k chosen so edge=cap → ~0.86
  const k = 2 / cap;
  return clamp01(1 - Math.exp(-k * Math.abs(rawEdge)));
}

/** Model confidence — how trustworthy is THIS matchup's score? */
export function modelConfidence(score) {
  const dq = isNum(score?.dataQuality) ? score.dataQuality : 0;
  const sa = isNum(score?.signalAgreement) ? score.signalAgreement : 0.5;
  return clamp01(dq * sa);
}

/**
 * Situational edge — non-market context that supports the selection.
 * All sub-components live in [0, 1] and we average the *present* ones so
 * missing data doesn't penalize (but small-input picks do get lower confidence
 * via modelConfidence anyway).
 */
export function situationalEdge(matchup, score, side /* 'away'|'home' */) {
  const away = matchup?.awayTeam || {};
  const home = matchup?.homeTeam || {};
  const isAway = side === 'away';

  const parts = [];

  // Rotation mismatch
  if (isNum(away.frontlineRotation) && isNum(home.frontlineRotation)) {
    const delta = isAway
      ? (away.frontlineRotation - home.frontlineRotation)
      : (home.frontlineRotation - away.frontlineRotation);
    parts.push(clamp01(0.5 + delta / 10));
  }

  // Bullpen quality
  if (isNum(away.bullpenQuality) && isNum(home.bullpenQuality)) {
    const delta = isAway
      ? (away.bullpenQuality - home.bullpenQuality)
      : (home.bullpenQuality - away.bullpenQuality);
    parts.push(clamp01(0.5 + delta / 10));
  }

  // Home-field tilt (constant +0.55 for home, 0.45 for away)
  parts.push(isAway ? 0.45 : 0.55);

  // Recent-form vs baseline: (current W% − projected W%) proxy
  const wpct = side === 'away' ? parseWpct(away.record) : parseWpct(home.record);
  const projWins = side === 'away' ? away.projectedWins : home.projectedWins;
  if (isNum(wpct) && isNum(projWins)) {
    const projW = projWins / 162;
    parts.push(clamp01(0.5 + (wpct - projW) * 2));
  }

  // Signal agreement already fed modelConfidence — add directional alignment
  // as a small situational bonus (same side favored by majority of signals)
  const signals = Array.isArray(score?.topSignals) ? score.topSignals : [];
  if (signals.length > 0) {
    const aligned = signals.filter(s => {
      const text = String(s).toLowerCase();
      return (isAway && text.includes('away')) || (!isAway && text.includes('home'));
    }).length;
    parts.push(clamp01(aligned / signals.length));
  }

  if (parts.length === 0) return 0.5; // neutral when no inputs
  return clamp01(parts.reduce((a, b) => a + b, 0) / parts.length);
}

/** Market quality — is this a line worth acting on? */
export function marketQuality(matchup, marketType, componentsConfig) {
  const parts = [];

  // Bookmaker consensus proxy (from _odds enricher: confidence = books/8)
  const cons = matchup?.modelConfidence;
  if (isNum(cons)) parts.push(clamp01(cons));

  // Is the relevant price present?
  const m = matchup?.market || {};
  if (marketType === 'moneyline') {
    if (isNum(m.moneyline?.away) && isNum(m.moneyline?.home)) parts.push(0.85); else parts.push(0.4);
  } else if (marketType === 'runline') {
    if (isNum(m.runLine?.homeLine)) parts.push(0.80); else parts.push(0.3);
  } else if (marketType === 'total') {
    if (isNum(m.total?.points)) parts.push(0.80); else parts.push(0.3);
  }

  if (parts.length === 0) return 0.5;
  return clamp01(parts.reduce((a, b) => a + b, 0) / parts.length);
}

function parseWpct(record) {
  if (!record || typeof record !== 'string') return null;
  const m = record.match(/^(\d+)-(\d+)/);
  if (!m) return null;
  const w = parseInt(m[1], 10), l = parseInt(m[2], 10);
  return (w + l) > 0 ? w / (w + l) : null;
}
