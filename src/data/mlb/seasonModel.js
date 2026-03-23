/**
 * MLB Season Wins Projection Engine — v3
 *
 * v3 adds:
 *   - Full decomposition outputs per team (baseline, trend, regression,
 *     offense, rotation, bullpen, manager, division, market blend)
 *   - Top-level takeaway fields (strongest driver, biggest drag, etc.)
 *   - Improved badge logic using decomposition data
 *   - Richer rationale incorporating decomposition + takeaways
 *
 * TODO: Plug in live data from:
 *   - MLB Stats API (standings, run differential)
 *   - Odds API (market win totals, championship lines)
 *   - FanGraphs depth charts
 *   - ESPN roster transactions
 */

import TEAM_INPUTS from './seasonModelInputs.js';
import { MLB_TEAMS } from '../../sports/mlb/teams.js';

const LEAGUE_AVG = 81;
const REGRESSION = 0.18;
const TREND_W = [0.55, 0.30, 0.15];
const ROSTER_SCALE = 0.42;
const MGR_SCALE = 0.35;
const DIV_SCALE = 0.50;
const MARKET_BLEND = 0.24;
const OVERPERF_CORR = 0.55;
const WIN_LO = 52;
const WIN_HI = 108;

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function r1(v) { return Math.round(v * 10) / 10; }
function rnd(v) { return Math.round(v); }

function trendBase(t) {
  if (!t?.length) return LEAGUE_AVG;
  let s = 0, w = 0;
  for (let i = 0; i < t.length && i < TREND_W.length; i++) {
    s += (t[i] ?? LEAGUE_AVG) * TREND_W[i]; w += TREND_W[i];
  }
  return s / w;
}

// ── Component calculators (return raw deltas) ────────────────

function calcOffense(inp) {
  return (((inp.topOfLineup || 5) - 5) * 0.5 +
          ((inp.lineupDepth || 5) - 5) * 0.35) * ROSTER_SCALE;
}

function calcRotation(inp) {
  return (((inp.frontlineRotation || 5) - 5) * 0.5 +
          ((inp.rotationDepth || 5) - 5) * 0.35) * ROSTER_SCALE;
}

function calcBullpen(inp) {
  return ((inp.bullpenQuality || 5) - 5) * 0.3 * ROSTER_SCALE;
}

function calcRosterMisc(inp) {
  return ((inp.aging || 0) * 0.3 + (inp.injury || 0) * 0.3 +
          ((inp.prospect || 3) - 3) * 0.22) * ROSTER_SCALE;
}

function calcManager(inp) {
  return (((inp.mgrScore || 5) - 5) * 0.6 + (inp.mgrContinuity || 0) * 0.2) * MGR_SCALE;
}

function calcDivision(inp) {
  return -(((inp.divStrength || 5) - 5) * 0.5 + (inp.scheduleDiff || 0) * 0.3) * DIV_SCALE;
}

// ── Confidence (9 factors → 5 tiers) ─────────────────────────

function computeConfidence(inp, marketDelta) {
  let s = 0;
  s += (inp.continuity || 0.5) * 14;
  s += clamp(10 + (inp.injury || 0) * 2, 0, 10);
  s += clamp((inp.rotationDepth || 5) * 1.4, 0, 10);
  s += clamp((inp.lineupDepth || 5) * 1.4, 0, 10);
  s += clamp(10 - (inp.bullpenVolatility || 3) * 1.5, 0, 10);
  s += clamp(10 - (inp.rosterConcentration || 3) * 1.3, 0, 10);
  s += clamp(10 - Math.abs(marketDelta || 0) * 1.5, 0, 10);
  s += clamp(10 - ((inp.divStrength || 5) - 3) * 1.5, 0, 10);
  s += clamp((inp.mgrContinuity || 0) * 3, 0, 10);
  const pct = s / 94 * 100;
  const tier = pct >= 72 ? 'High' : pct >= 58 ? 'Medium-High' :
               pct >= 44 ? 'Medium' : pct >= 30 ? 'Medium-Low' : 'Low';
  return { confidenceScore: r1(pct), confidenceTier: tier };
}

// ── Floor / Ceiling ──────────────────────────────────────────

function computeBands(inp, projWins) {
  let dn = 0, up = 0;
  const cf = (1 - (inp.continuity || 0.5)) * 4;
  dn += cf; up += cf * 0.7;
  dn += Math.abs(Math.min(inp.injury || 0, 0)) * 1.2;
  up += Math.abs(Math.min(inp.injury || 0, 0)) * 0.4;
  up += ((inp.prospect || 3) - 2) * 0.6;
  dn += ((inp.prospect || 3) - 2) * 0.15;
  dn += Math.max(0, 6 - (inp.rotationDepth || 5)) * 0.8;
  dn += Math.max(0, 6 - (inp.lineupDepth || 5)) * 0.7;
  const bv = inp.bullpenVolatility || 3;
  dn += bv * 0.7; up += bv * 0.35;
  const cn = inp.rosterConcentration || 3;
  dn += cn * 0.5; up += cn * 0.35;
  up += Math.max(0, (inp.frontlineRotation || 5) - 5) * 0.5;
  up += Math.max(0, (inp.topOfLineup || 5) - 5) * 0.4;
  if ((inp.mgrContinuity || 0) >= 2) dn -= 0.5;
  if ((inp.mgrContinuity || 0) === 0) { dn += 1.0; up += 0.5; }
  return {
    floor: clamp(projWins - clamp(rnd(dn + 3), 4, 16), WIN_LO, projWins - 3),
    ceiling: clamp(projWins + clamp(rnd(up + 3), 4, 16), projWins + 3, WIN_HI),
  };
}

// ── Decomposition ────────────────────────────────────────────

function decompose(inp, baseline, trendVal, regressed, offAdj, rotAdj, bpAdj, miscAdj, mgrAdj, divAdj_, overperfAdj, rawProj, marketBlendAdj) {
  const items = [
    { label: 'Baseline', value: r1(baseline), desc: 'Pythagorean + regression blend' },
    { label: 'Trend', value: r1(trendVal - regressed), desc: '3-year weighted trajectory' },
    { label: 'Overperf. Corr.', value: r1(overperfAdj), desc: 'Luck regression adjustment' },
    { label: 'Offense', value: r1(offAdj), desc: 'Lineup star power + depth' },
    { label: 'Rotation', value: r1(rotAdj), desc: 'Frontline aces + pitching depth' },
    { label: 'Bullpen', value: r1(bpAdj), desc: 'Relief quality' },
    { label: 'Roster Misc', value: r1(miscAdj), desc: 'Aging, injury, prospects' },
    { label: 'Manager', value: r1(mgrAdj), desc: 'Track record + continuity' },
    { label: 'Division', value: r1(divAdj_), desc: 'Strength + schedule' },
    { label: 'Market Blend', value: r1(marketBlendAdj), desc: 'Anchored to consensus line' },
  ];
  return items;
}

// ── Takeaway fields ──────────────────────────────────────────

function deriveTakeaways(inp, decomp, proj) {
  // Find strongest positive and most negative component (excluding baseline/trend/market)
  const adjustable = decomp.filter(d =>
    !['Baseline', 'Trend', 'Market Blend'].includes(d.label));
  const sorted = [...adjustable].sort((a, b) => b.value - a.value);
  const strongest = sorted[0];
  const weakest = sorted[sorted.length - 1];

  const strongestDriver = strongest?.value > 0 ? strongest.label : 'Baseline quality';
  const biggestDrag = weakest?.value < -0.3 ? weakest.label : 'None significant';

  // Stability
  const bandWidth = proj.ceiling - proj.floor;
  const stability = bandWidth <= 14 ? 'Stable' :
                    bandWidth <= 18 ? 'Moderate' : 'Volatile';

  // Market stance
  const mStance = proj.marketDelta >= 2.5 ? 'Model above market' :
                  proj.marketDelta <= -2.5 ? 'Model below market' :
                  Math.abs(proj.marketDelta) <= 1 ? 'Aligned with market' : 'Near market';

  // Depth profile
  const offDepth = (inp.lineupDepth || 5) >= 7 && (inp.rotationDepth || 5) >= 7;
  const topHeavy = (inp.rosterConcentration || 3) >= 5;
  const depthProfile = offDepth ? 'Balanced depth' :
                       topHeavy ? 'Top-heavy' : 'Mixed depth';

  // Risk
  const riskProfile = (inp.bullpenVolatility || 3) >= 5 && (inp.rosterConcentration || 3) >= 5
    ? 'High volatility'
    : (inp.injury || 0) <= -2 ? 'Injury concern'
    : stability === 'Volatile' ? 'Wide outcome range'
    : 'Standard risk';

  return { strongestDriver, biggestDrag, stability, marketStance: mStance, depthProfile, riskProfile };
}

// ── Signal / Badge (v3 — decomposition-aware) ────────────────

function generateSignal(inp, proj, decomp) {
  const badges = [];
  const bw = proj.ceiling - proj.floor;

  // Check if rotation is the dominant positive driver
  const rotItem = decomp.find(d => d.label === 'Rotation');
  const rotationLed = rotItem && rotItem.value >= 0.8;

  // Primary
  if (proj.projectedWins >= 92 && proj.floor >= 85 &&
     (proj.confidenceTier === 'High' || proj.confidenceTier === 'Medium-High')) {
    badges.push('Stable Contender');
  } else if (proj.projectedWins >= 90 && proj.marketDelta <= -1.5) {
    badges.push('Market Favorite');
  } else if (proj.marketDelta >= 2.5) {
    badges.push('Model Overweight');
  } else if (rotationLed && proj.projectedWins >= 84) {
    badges.push('Rotation-Led');
  } else if (proj.projectedWins >= 82 && proj.marketDelta >= 1 &&
             (inp.rosterConcentration || 3) <= 4) {
    badges.push('Quiet Value');
  } else if (proj.projectedWins >= 85 && (inp.rosterConcentration || 3) >= 5 && bw >= 18) {
    badges.push('Fragile Upside');
  } else if (proj.projectedWins >= 78 && proj.projectedWins < 86 && bw >= 16) {
    badges.push('High Variance');
  } else if (proj.projectedWins >= 82 && (inp.divContenderDensity || 3) >= 3) {
    badges.push('Division Grinder');
  } else if (proj.projectedWins >= 76 && proj.projectedWins < 83) {
    badges.push('Volatile Middle');
  } else if (proj.projectedWins < 72) {
    badges.push('Rebuild Watch');
  } else {
    badges.push('Developing');
  }

  // Secondary
  if (badges[0] !== 'Market Favorite' && proj.marketDelta <= -2) badges.push('Market Favorite');
  else if (badges[0] !== 'Model Overweight' && proj.marketDelta >= 3) badges.push('Model Overweight');
  if ((inp.prospect || 3) >= 5 && badges.length < 2) badges.push('Prospect Rich');
  if ((inp.bullpenVolatility || 3) >= 5 && badges.length < 2) badges.push('Bullpen Risk');
  if ((inp.rosterConcentration || 3) >= 6 && badges.length < 2) badges.push('Top-Heavy');
  if ((inp.lineupDepth || 5) >= 7 && (inp.rotationDepth || 5) >= 7 && badges.length < 2) badges.push('Balanced Depth');

  return badges.slice(0, 2);
}

// ── Main projection ──────────────────────────────────────────

function projectTeam(slug, inp) {
  const pythag = inp.pythagWins ?? inp.priorWins ?? LEAGUE_AVG;
  const regressed = pythag + (LEAGUE_AVG - pythag) * REGRESSION;
  const trendVal = trendBase(inp.trend3y);
  const baseline = regressed * 0.60 + trendVal * 0.40;
  const overperfAdj = -(inp.overperformance || 0) * OVERPERF_CORR;

  const offAdj = calcOffense(inp);
  const rotAdj = calcRotation(inp);
  const bpAdj = calcBullpen(inp);
  const miscAdj = calcRosterMisc(inp);
  const mgrAdj = calcManager(inp);
  const divAdj_ = calcDivision(inp);

  const rawProj = baseline + overperfAdj + offAdj + rotAdj + bpAdj + miscAdj + mgrAdj + divAdj_;
  const mkt = inp.marketWinTotal ?? LEAGUE_AVG;
  const blended = rawProj * (1 - MARKET_BLEND) + mkt * MARKET_BLEND;
  const marketBlendAdj = blended - rawProj;
  const projectedWins = clamp(rnd(blended), WIN_LO, WIN_HI);
  const marketDelta = r1(projectedWins - (inp.marketWinTotal || projectedWins));

  const { floor, ceiling } = computeBands(inp, projectedWins);
  const { confidenceScore, confidenceTier } = computeConfidence(inp, marketDelta);

  const divOutlook = projectedWins >= 92 ? 'Contender' :
                     projectedWins >= 85 ? 'Competitive' :
                     projectedWins >= 78 ? 'Fringe' :
                     projectedWins >= 70 ? 'Rebuilding' : 'Retooling';

  const decompItems = decompose(inp, baseline, trendVal, regressed, offAdj, rotAdj, bpAdj, miscAdj, mgrAdj, divAdj_, overperfAdj, rawProj, marketBlendAdj);

  const result = {
    slug, projectedWins, floor, ceiling,
    champOdds: inp.champOdds || '—',
    playoffProb: inp.playoffOdds ?? null,
    marketWinTotal: inp.marketWinTotal ?? null,
    marketDelta, divOutlook, confidenceScore, confidenceTier,
    manager: inp.manager || 'TBD',
    decomposition: decompItems,
  };

  result.signals = generateSignal(inp, result, decompItems);
  result.takeaways = deriveTakeaways(inp, decompItems, result);
  return result;
}

// ── Rationale (v3 — uses takeaways + decomposition) ──────────

function generateRationale(slug, inp, proj) {
  const team = MLB_TEAMS.find((t) => t.slug === slug);
  const nm = team?.name || slug;
  const tk = proj.takeaways;
  const p = [];

  const tone = proj.projectedWins >= 92 ? 'strong contender' :
               proj.projectedWins >= 85 ? 'solid' :
               proj.projectedWins >= 78 ? 'middling' : 'rebuilding';
  p.push(`${proj.projectedWins} projected wins puts the ${nm} in ${tone} territory.`);

  // Y-o-Y
  const yd = proj.projectedWins - inp.priorWins;
  if (Math.abs(yd) >= 5) p.push(`A ${Math.abs(yd)}-win ${yd > 0 ? 'jump' : 'drop'} from last year's ${inp.priorWins}-win finish.`);
  else if (Math.abs(yd) >= 2) p.push(`${Math.abs(yd)}-win ${yd > 0 ? 'bump' : 'dip'} from ${inp.priorWins} wins last season.`);

  // Pythagorean
  const pyG = (inp.pythagWins || inp.priorWins) - inp.priorWins;
  if (pyG >= 3) p.push(`Run differential indicated ~${pyG} wins of underperformance — bounce-back candidate.`);
  else if (pyG <= -3) p.push(`Run differential was ${Math.abs(pyG)} wins weaker than the record — some regression is priced in.`);

  // Strongest driver / biggest drag (from takeaways)
  if (tk.strongestDriver !== 'Baseline quality') {
    const driverCopy = {
      'Offense': 'Offensive firepower is the strongest positive factor in this projection.',
      'Rotation': 'The rotation is the primary engine behind this win total.',
      'Bullpen': 'Bullpen quality provides a notable lift.',
      'Manager': 'Strong managerial continuity adds a meaningful edge.',
    };
    p.push(driverCopy[tk.strongestDriver] || `${tk.strongestDriver} is the primary positive driver.`);
  }
  if (tk.biggestDrag !== 'None significant') {
    const dragCopy = {
      'Division': 'A tough division is the biggest headwind in the projection.',
      'Roster Misc': 'Aging and injury concerns represent the most significant drag.',
      'Bullpen': 'Bullpen uncertainty is the largest negative factor.',
      'Overperf. Corr.': 'Regression from prior overperformance pulls the number down.',
    };
    p.push(dragCopy[tk.biggestDrag] || `${tk.biggestDrag} creates the largest drag.`);
  }

  // Offense profile
  if ((inp.topOfLineup || 5) >= 8 && (inp.lineupDepth || 5) <= 5)
    p.push(`Elite bats atop the order, but lineup depth thins beyond the core.`);
  else if ((inp.lineupDepth || 5) >= 7)
    p.push(`A deep, balanced lineup provides consistent run production.`);
  else if ((inp.topOfLineup || 5) <= 4 && (inp.lineupDepth || 5) <= 4)
    p.push(`The offense lacks both star power and depth.`);

  // Pitching profile
  if ((inp.frontlineRotation || 5) >= 8 && (inp.rotationDepth || 5) <= 5)
    p.push(`Frontline pitching talent is elite but depth behind the aces is thin.`);
  else if ((inp.rotationDepth || 5) >= 7)
    p.push(`Rotation depth anchors the pitching staff for the full 162-game grind.`);

  // Bullpen / risk
  if ((inp.bullpenVolatility || 3) >= 5) p.push(`Bullpen volatility widens the outcome range.`);
  if ((inp.rosterConcentration || 3) >= 6) p.push(`Heavy reliance on a few key players adds fragility.`);
  if ((inp.prospect || 3) >= 5) p.push(`A rich farm system provides meaningful upside if prospects break through.`);

  // Market
  if (proj.marketDelta >= 2.5) p.push(`The model sits ${r1(proj.marketDelta)} wins above the market line of ${inp.marketWinTotal} — a value signal.`);
  else if (proj.marketDelta <= -2.5) p.push(`Below market consensus of ${inp.marketWinTotal} by ${r1(Math.abs(proj.marketDelta))} wins.`);

  // Division density
  if ((inp.divContenderDensity || 3) >= 4) p.push(`A division packed with contenders toughens the path.`);

  // Close
  p.push(`Range: ${proj.floor}–${proj.ceiling}. ${tk.stability} profile, ${proj.confidenceTier} confidence.`);

  return p.join(' ');
}

// ── Public API ───────────────────────────────────────────────

export function getSeasonProjections() {
  return MLB_TEAMS.map((team) => {
    const inp = TEAM_INPUTS[team.slug];
    if (!inp) {
      return {
        ...team,
        projectedWins: LEAGUE_AVG, floor: 74, ceiling: 88,
        champOdds: '—', playoffProb: null, marketWinTotal: null,
        marketDelta: 0, divOutlook: 'Fringe',
        confidenceScore: 40, confidenceTier: 'Low',
        manager: 'TBD', signals: ['Developing'], decomposition: [],
        takeaways: { strongestDriver: '—', biggestDrag: '—', stability: 'Unknown',
                     marketStance: '—', depthProfile: '—', riskProfile: '—' },
        rationale: 'Projection data not yet available.',
      };
    }
    const proj = projectTeam(team.slug, inp);
    const rationale = generateRationale(team.slug, inp, proj);
    return { ...team, ...proj, rationale };
  });
}

export const SORT_OPTIONS = [
  { key: 'wins-desc',  label: 'Projected Wins ↓' },
  { key: 'wins-asc',   label: 'Projected Wins ↑' },
  { key: 'odds',       label: 'Championship Odds' },
  { key: 'playoff',    label: 'Playoff Probability' },
  { key: 'delta',      label: 'Model vs Market' },
  { key: 'confidence', label: 'Confidence' },
  { key: 'floor',      label: 'Floor Wins' },
  { key: 'ceiling',    label: 'Ceiling Wins' },
  { key: 'alpha',      label: 'Alphabetical' },
];

function parseOdds(s) {
  const n = parseInt(String(s).replace('+', ''), 10);
  return Number.isFinite(n) ? n : 999999;
}

export function sortTeams(teams, key) {
  const a = [...teams];
  switch (key) {
    case 'wins-desc':  return a.sort((x, y) => y.projectedWins - x.projectedWins);
    case 'wins-asc':   return a.sort((x, y) => x.projectedWins - y.projectedWins);
    case 'odds':       return a.sort((x, y) => parseOdds(x.champOdds) - parseOdds(y.champOdds));
    case 'playoff':    return a.sort((x, y) => (y.playoffProb ?? 0) - (x.playoffProb ?? 0));
    case 'delta':      return a.sort((x, y) => (y.marketDelta || 0) - (x.marketDelta || 0));
    case 'confidence': return a.sort((x, y) => (y.confidenceScore || 0) - (x.confidenceScore || 0));
    case 'floor':      return a.sort((x, y) => y.floor - x.floor);
    case 'ceiling':    return a.sort((x, y) => y.ceiling - x.ceiling);
    case 'alpha':      return a.sort((x, y) => x.name.localeCompare(y.name));
    default:           return a;
  }
}

export const LEAGUE_FILTERS = ['All', 'AL', 'NL'];
export const DIVISION_FILTERS = [
  'All', 'AL East', 'AL Central', 'AL West', 'NL East', 'NL Central', 'NL West',
];

export function filterTeams(teams, { league = 'All', division = 'All' } = {}) {
  return teams.filter((t) => {
    if (league !== 'All' && t.league !== league) return false;
    if (division !== 'All' && t.division !== division) return false;
    return true;
  });
}
