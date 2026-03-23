/**
 * MLB Season Wins Projection Engine — v2
 *
 * Upgrades from v1:
 *   - Split offense: topOfLineup + lineupDepth
 *   - Split pitching: frontlineRotation + rotationDepth
 *   - Bullpen quality + volatility as separate drivers
 *   - Roster concentration risk widens bands
 *   - Division contender density as explicit input
 *   - Market win total as primary market prior (not just champ odds)
 *   - Richer confidence tiers (5 levels)
 *   - Richer floor/ceiling driven by 9 factors
 *   - Deterministic model-signal badge generation
 *   - Improved rationale prose
 *
 * TODO: Plug in live data from:
 *   - MLB Stats API (standings, run differential)
 *   - Odds API (market win totals, championship lines)
 *   - FanGraphs depth charts
 *   - ESPN roster transactions
 */

import TEAM_INPUTS from './seasonModelInputs.js';
import { MLB_TEAMS } from '../../sports/mlb/teams.js';

// ── Constants ────────────────────────────────────────────────

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

// ── Helpers ──────────────────────────────────────────────────

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

// ── Roster delta (v2 — split inputs) ─────────────────────────

function rosterDelta(inp) {
  const offenseNet = ((inp.topOfLineup || 5) - 5) * 0.5 +
                     ((inp.lineupDepth || 5) - 5) * 0.35;
  const pitchNet = ((inp.frontlineRotation || 5) - 5) * 0.5 +
                   ((inp.rotationDepth || 5) - 5) * 0.35;
  const bpNet = ((inp.bullpenQuality || 5) - 5) * 0.3;
  const agingAdj = (inp.aging || 0) * 0.3;
  const injuryAdj = (inp.injury || 0) * 0.3;
  const prospectAdj = ((inp.prospect || 3) - 3) * 0.22;
  const raw = offenseNet + pitchNet + bpNet + agingAdj + injuryAdj + prospectAdj;
  return raw * ROSTER_SCALE;
}

function mgrDelta(inp) {
  const base = ((inp.mgrScore || 5) - 5) * 0.6;
  const cont = (inp.mgrContinuity || 0) * 0.2;
  return (base + cont) * MGR_SCALE;
}

function divAdj(inp) {
  const str = (inp.divStrength || 5) - 5;
  const sched = inp.scheduleDiff || 0;
  return -(str * 0.5 + sched * 0.3) * DIV_SCALE;
}

// ── Confidence scoring (v2 — 9 factors) ──────────────────────

function computeConfidence(inp, proj) {
  let score = 0;
  score += (inp.continuity || 0.5) * 14;                         // 0-14
  score += clamp(10 + (inp.injury || 0) * 2, 0, 10);             // 0-10
  score += clamp((inp.rotationDepth || 5) * 1.4, 0, 10);         // 0-10
  score += clamp((inp.lineupDepth || 5) * 1.4, 0, 10);           // 0-10
  score += clamp(10 - (inp.bullpenVolatility || 3) * 1.5, 0, 10);// 0-10
  score += clamp(10 - (inp.rosterConcentration || 3) * 1.3, 0, 10); // 0-10
  score += clamp(10 - Math.abs(proj.marketDelta || 0) * 1.5, 0, 10); // 0-10
  score += clamp(10 - ((inp.divStrength || 5) - 3) * 1.5, 0, 10);// 0-10
  score += clamp((inp.mgrContinuity || 0) * 3, 0, 10);           // 0-10
  // max ≈ 94
  const pct = score / 94 * 100;
  const tier = pct >= 72 ? 'High' :
               pct >= 58 ? 'Medium-High' :
               pct >= 44 ? 'Medium' :
               pct >= 30 ? 'Medium-Low' : 'Low';
  return { confidenceScore: r1(pct), confidenceTier: tier };
}

// ── Floor / Ceiling (v2 — 9 factors) ─────────────────────────

function computeBands(inp, projWins) {
  let downside = 0, upside = 0;

  // Continuity: low → wider both ways
  const contFactor = (1 - (inp.continuity || 0.5)) * 4;
  downside += contFactor; upside += contFactor * 0.7;

  // Injury risk
  downside += Math.abs(Math.min(inp.injury || 0, 0)) * 1.2;
  upside += Math.abs(Math.min(inp.injury || 0, 0)) * 0.4;

  // Prospect upside: more ceiling
  upside += ((inp.prospect || 3) - 2) * 0.6;
  downside += ((inp.prospect || 3) - 2) * 0.15;

  // Rotation depth: low → more downside
  downside += Math.max(0, 6 - (inp.rotationDepth || 5)) * 0.8;

  // Lineup depth: low → more downside
  downside += Math.max(0, 6 - (inp.lineupDepth || 5)) * 0.7;

  // Bullpen volatility: widens both ways, skewed downside
  const bpVol = (inp.bullpenVolatility || 3);
  downside += bpVol * 0.7;
  upside += bpVol * 0.35;

  // Roster concentration: widens bands
  const conc = (inp.rosterConcentration || 3);
  downside += conc * 0.5;
  upside += conc * 0.35;

  // Frontline talent: boosts ceiling
  upside += Math.max(0, (inp.frontlineRotation || 5) - 5) * 0.5;
  upside += Math.max(0, (inp.topOfLineup || 5) - 5) * 0.4;

  // Manager stability
  if ((inp.mgrContinuity || 0) >= 2) { downside -= 0.5; }
  if ((inp.mgrContinuity || 0) === 0) { downside += 1.0; upside += 0.5; }

  const floorRaw = projWins - clamp(rnd(downside + 3), 4, 16);
  const ceilRaw = projWins + clamp(rnd(upside + 3), 4, 16);
  return {
    floor: clamp(floorRaw, WIN_LO, projWins - 3),
    ceiling: clamp(ceilRaw, projWins + 3, WIN_HI),
  };
}

// ── Signal / Badge generation ────────────────────────────────

function generateSignal(inp, proj) {
  const badges = [];

  // Primary signal
  if (proj.projectedWins >= 92 && proj.floor >= 85 && proj.confidenceTier === 'High') {
    badges.push('Stable Contender');
  } else if (proj.projectedWins >= 90 && proj.marketDelta <= -1.5) {
    badges.push('Market Favorite');
  } else if (proj.marketDelta >= 2.5) {
    badges.push('Model Overweight');
  } else if (proj.projectedWins >= 82 && proj.marketDelta >= 1 &&
             (inp.rosterConcentration || 3) <= 4) {
    badges.push('Quiet Value');
  } else if (proj.projectedWins >= 85 && (inp.rosterConcentration || 3) >= 5 &&
             (proj.ceiling - proj.floor) >= 18) {
    badges.push('Fragile Upside');
  } else if (proj.projectedWins >= 78 && proj.projectedWins < 86 &&
             (proj.ceiling - proj.floor) >= 16) {
    badges.push('High Variance');
  } else if (proj.projectedWins >= 82 && (inp.divContenderDensity || 3) >= 3) {
    badges.push('Division Grinder');
  } else if (proj.projectedWins >= 76 && proj.projectedWins < 83 &&
             proj.confidenceTier === 'Medium') {
    badges.push('Volatile Middle');
  } else if (proj.projectedWins < 72) {
    badges.push('Rebuild Watch');
  } else {
    badges.push('Developing');
  }

  // Secondary contextual badge
  if (badges[0] !== 'Market Favorite' && proj.marketDelta <= -2) {
    badges.push('Market Favorite');
  } else if (badges[0] !== 'Model Overweight' && proj.marketDelta >= 3) {
    badges.push('Model Overweight');
  }
  if ((inp.prospect || 3) >= 5 && !badges.includes('Fragile Upside')) {
    badges.push('Prospect Rich');
  }
  if ((inp.bullpenVolatility || 3) >= 5 && badges.length < 2) {
    badges.push('Bullpen Risk');
  }
  if ((inp.rosterConcentration || 3) >= 6 && badges.length < 2) {
    badges.push('Top-Heavy');
  }

  return badges.slice(0, 2);
}

// ── Main projection ──────────────────────────────────────────

function projectTeam(slug, inp) {
  const pythag = inp.pythagWins ?? inp.priorWins ?? LEAGUE_AVG;
  const regressed = pythag + (LEAGUE_AVG - pythag) * REGRESSION;
  const trend = trendBase(inp.trend3y);
  const baseline = regressed * 0.60 + trend * 0.40;
  const overperfAdj = -(inp.overperformance || 0) * OVERPERF_CORR;
  const rDelta = rosterDelta(inp);
  const mDelta = mgrDelta(inp);
  const dAdj = divAdj(inp);
  const rawProj = baseline + overperfAdj + rDelta + mDelta + dAdj;

  // Market prior — use marketWinTotal as primary, champ odds as secondary
  const mkt = inp.marketWinTotal ?? LEAGUE_AVG;
  const blended = rawProj * (1 - MARKET_BLEND) + mkt * MARKET_BLEND;
  const projectedWins = clamp(rnd(blended), WIN_LO, WIN_HI);

  const marketDelta = r1(projectedWins - (inp.marketWinTotal || projectedWins));

  const { floor, ceiling } = computeBands(inp, projectedWins);
  const { confidenceScore, confidenceTier } = computeConfidence(
    inp,
    { marketDelta },
  );

  const divOutlook = projectedWins >= 92 ? 'Contender' :
                     projectedWins >= 85 ? 'Competitive' :
                     projectedWins >= 78 ? 'Fringe' :
                     projectedWins >= 70 ? 'Rebuilding' : 'Retooling';

  const result = {
    slug,
    projectedWins, floor, ceiling,
    champOdds: inp.champOdds || '—',
    playoffProb: inp.playoffOdds ?? null,
    marketWinTotal: inp.marketWinTotal ?? null,
    marketDelta,
    divOutlook,
    confidenceScore, confidenceTier,
    manager: inp.manager || 'TBD',
  };

  result.signals = generateSignal(inp, result);
  return result;
}

// ── Rationale generator (v2) ─────────────────────────────────

function generateRationale(slug, inp, proj) {
  const team = MLB_TEAMS.find((t) => t.slug === slug);
  const name = team?.name || slug;
  const p = [];

  // Opener
  const tone = proj.projectedWins >= 92 ? 'strong contender' :
               proj.projectedWins >= 85 ? 'solid' :
               proj.projectedWins >= 78 ? 'middling' : 'rebuilding';
  p.push(`The model lands at ${proj.projectedWins} wins for the ${name} — a ${tone} projection.`);

  // Y-o-Y delta
  const yDiff = proj.projectedWins - inp.priorWins;
  if (Math.abs(yDiff) >= 5) {
    p.push(`That's a ${Math.abs(yDiff)}-win ${yDiff > 0 ? 'jump' : 'drop'} from last season's ${inp.priorWins}-win finish.`);
  } else if (Math.abs(yDiff) >= 2) {
    p.push(`A ${Math.abs(yDiff)}-win ${yDiff > 0 ? 'bump' : 'dip'} relative to ${inp.priorWins} wins last year.`);
  }

  // Pythagorean
  const pyGap = (inp.pythagWins || inp.priorWins) - inp.priorWins;
  if (pyGap >= 3) p.push(`Run differential suggests they were about ${pyGap} wins better than their record — bounce-back candidate.`);
  else if (pyGap <= -3) p.push(`Underlying run differential was ${Math.abs(pyGap)} wins weaker than their record — regression risk.`);

  // Offense
  if ((inp.topOfLineup || 5) >= 8) {
    p.push(`An elite top of the order drives premium run creation.`);
    if ((inp.lineupDepth || 5) <= 5) p.push(`But lineup depth thins out beyond the core bats, adding volatility.`);
  } else if ((inp.topOfLineup || 5) <= 4 && (inp.lineupDepth || 5) <= 4) {
    p.push(`The offense lacks both star power and depth — a clear limitation.`);
  } else if ((inp.lineupDepth || 5) >= 7) {
    p.push(`A deep, balanced lineup provides consistent offensive production throughout the order.`);
  }

  // Pitching
  if ((inp.frontlineRotation || 5) >= 8) {
    p.push(`A frontline rotation anchored by elite arms gives this staff a high ceiling.`);
    if ((inp.rotationDepth || 5) <= 5) p.push(`Rotation depth behind the top arm(s) is a concern for a full 162-game campaign.`);
  } else if ((inp.rotationDepth || 5) >= 7) {
    p.push(`A deep, stable rotation offers consistency even without a true frontline ace.`);
  } else if ((inp.frontlineRotation || 5) <= 4 && (inp.rotationDepth || 5) <= 4) {
    p.push(`The rotation lacks both top-end talent and depth — a major vulnerability.`);
  }

  // Bullpen
  if ((inp.bullpenVolatility || 3) >= 5) {
    p.push(`Bullpen volatility is a real risk factor that widens the outcome range.`);
  } else if ((inp.bullpenQuality || 5) >= 7) {
    p.push(`A reliable bullpen provides late-game stability.`);
  }

  // Concentration / top-heaviness
  if ((inp.rosterConcentration || 3) >= 6) {
    p.push(`The roster is heavily dependent on a few key players — injuries to stars could dramatically shift the outlook.`);
  }

  // Prospect
  if ((inp.prospect || 3) >= 5) p.push(`A deep farm system provides meaningful upside if breakout prospects contribute.`);

  // Manager
  if ((inp.mgrScore || 5) >= 7 && (inp.mgrContinuity || 0) >= 2) {
    p.push(`An established, high-caliber manager in ${inp.manager} reinforces organizational stability.`);
  } else if ((inp.mgrContinuity || 0) === 0) {
    p.push(`First-year manager ${inp.manager} introduces a transition variable.`);
  }

  // Division
  if ((inp.divContenderDensity || 3) >= 4) {
    p.push(`A division packed with multiple legitimate contenders makes every game tougher.`);
  } else if ((inp.divContenderDensity || 3) <= 1) {
    p.push(`Minimal division competition creates a clear path if the team stays healthy.`);
  }

  // Market disagreement
  if (proj.marketDelta >= 2.5) {
    p.push(`The model is notably above the market line of ${inp.marketWinTotal} — flagging this as a potential value opportunity.`);
  } else if (proj.marketDelta <= -2.5) {
    p.push(`The model sits below market consensus of ${inp.marketWinTotal}, suggesting the public may be overvaluing this roster.`);
  }

  // Close with range + confidence
  p.push(`Outcome range: ${proj.floor}–${proj.ceiling} wins. Confidence: ${proj.confidenceTier}.`);

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
        manager: 'TBD', signals: ['Developing'],
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

const CONF_ORDER = { 'High': 0, 'Medium-High': 1, 'Medium': 2, 'Medium-Low': 3, 'Low': 4 };

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
