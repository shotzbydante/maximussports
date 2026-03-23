/**
 * MLB Season Wins Projection Engine — v1
 *
 * Calculates projected wins for each team using a hybrid framework:
 *   1. Historical baseline (Pythagorean wins + regression to mean)
 *   2. Three-year weighted trend
 *   3. Roster delta (hitters + starters + bullpen/depth + aging + prospect upside)
 *   4. Manager delta
 *   5. Division / schedule context
 *   6. Market prior blend (championship odds → implied quality)
 *   7. Confidence bands (floor / ceiling)
 *   8. Natural-language rationale
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

const LEAGUE_AVG_WINS = 81;
const REGRESSION_FACTOR = 0.18;       // pull toward league avg
const TREND_WEIGHTS = [0.55, 0.30, 0.15]; // recent → oldest
const ROSTER_SCALE = 0.45;            // how much roster delta moves wins
const MANAGER_SCALE = 0.35;           // manager delta win impact
const DIVISION_SCALE = 0.50;          // division difficulty impact
const MARKET_BLEND_WEIGHT = 0.22;     // how much market prior anchors output
const OVERPERF_CORRECTION = 0.55;     // how much prior overperformance corrects
const WIN_FLOOR = 52;
const WIN_CEILING = 108;

// ── Helpers ──────────────────────────────────────────────────

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function round1(v) { return Math.round(v * 10) / 10; }
function roundWins(v) { return Math.round(v); }

/** Convert championship odds string to implied win quality. */
function champOddsToImpliedWins(odds) {
  const n = parseInt(String(odds).replace('+', ''), 10);
  if (!n || n <= 0) return LEAGUE_AVG_WINS;
  // Map: +200 → ~99, +500 → ~94, +1000 → ~90, +2000 → ~85, +5000 → ~77, +10000 → ~72, +30000 → ~62
  const impliedPct = 100 / (n + 100);
  return clamp(62 + impliedPct * 260, 58, 102);
}

/** 3-year weighted trend baseline. */
function trendBaseline(trend) {
  if (!trend || trend.length === 0) return LEAGUE_AVG_WINS;
  let sum = 0, wSum = 0;
  for (let i = 0; i < trend.length && i < TREND_WEIGHTS.length; i++) {
    sum += (trend[i] ?? LEAGUE_AVG_WINS) * TREND_WEIGHTS[i];
    wSum += TREND_WEIGHTS[i];
  }
  return sum / wSum;
}

/** Net roster delta → win impact. */
function rosterDelta(inp) {
  const hitterNet = (inp.hitterAdd || 0) - (inp.hitterLoss || 0);
  const starterNet = (inp.starterAdd || 0) - (inp.starterLoss || 0);
  const bpNet = inp.bullpenDelta || 0;
  const depthAdj = ((inp.depth || 5) - 5) * 0.4;
  const agingAdj = (inp.aging || 0) * 0.3;
  const injuryAdj = (inp.injury || 0) * 0.3;
  const prospectAdj = ((inp.prospect || 3) - 3) * 0.25;
  const raw = hitterNet * 0.35 + starterNet * 0.35 + bpNet * 0.15 +
              depthAdj + agingAdj + injuryAdj + prospectAdj;
  return raw * ROSTER_SCALE;
}

/** Manager quality → small win delta. */
function managerDelta(inp) {
  const base = ((inp.mgrScore || 5) - 5) * 0.6;
  const cont = (inp.mgrContinuity || 0) * 0.2;
  return (base + cont) * MANAGER_SCALE;
}

/** Division difficulty → small win adjustment (negative for harder divisions). */
function divisionAdj(inp) {
  const strength = (inp.divStrength || 5) - 5;
  const sched = (inp.scheduleDiff || 0);
  return -(strength * 0.5 + sched * 0.3) * DIVISION_SCALE;
}

// ── Main projection ──────────────────────────────────────────

function projectTeam(slug, inp) {
  // 1. Pythagorean baseline (more stable than actual wins)
  const pythag = inp.pythagWins ?? inp.priorWins ?? LEAGUE_AVG_WINS;

  // 2. Regress toward mean
  const regressed = pythag + (LEAGUE_AVG_WINS - pythag) * REGRESSION_FACTOR;

  // 3. Blend with 3-year trend
  const trend = trendBaseline(inp.trend3y);
  const baseline = regressed * 0.60 + trend * 0.40;

  // 4. Correct for prior overperformance
  const overperfAdj = -(inp.overperformance || 0) * OVERPERF_CORRECTION;

  // 5. Roster delta
  const rDelta = rosterDelta(inp);

  // 6. Manager delta
  const mDelta = managerDelta(inp);

  // 7. Division adjustment
  const dAdj = divisionAdj(inp);

  // 8. Raw projection
  const rawProj = baseline + overperfAdj + rDelta + mDelta + dAdj;

  // 9. Blend with market prior
  const marketWins = inp.marketWins ?? champOddsToImpliedWins(inp.champOdds);
  const blended = rawProj * (1 - MARKET_BLEND_WEIGHT) + marketWins * MARKET_BLEND_WEIGHT;

  // 10. Clamp to realistic range
  const projectedWins = clamp(roundWins(blended), WIN_FLOOR, WIN_CEILING);

  // 11. Floor / ceiling bands
  const volatility = (10 - (inp.continuity || 0.5) * 10) * 0.5 +
                     Math.abs(inp.injury || 0) * 0.5 +
                     (inp.prospect || 0) * 0.3;
  const bandWidth = clamp(Math.round(volatility + 4), 5, 14);
  const floor = clamp(projectedWins - bandWidth, WIN_FLOOR, projectedWins - 3);
  const ceiling = clamp(projectedWins + bandWidth, projectedWins + 3, WIN_CEILING);

  // 12. Model vs market delta
  const marketDelta = round1(projectedWins - (inp.marketWins || projectedWins));

  // 13. Confidence tier
  const contScore = (inp.continuity || 0.5) * 10;
  const tier = contScore >= 7.5 ? 'High' : contScore >= 5 ? 'Medium' : 'Low';

  // 14. Division outlook
  const divOutlook = projectedWins >= 92 ? 'Contender' :
                     projectedWins >= 85 ? 'Competitive' :
                     projectedWins >= 78 ? 'Fringe' :
                     projectedWins >= 70 ? 'Rebuilding' : 'Retooling';

  return {
    slug,
    projectedWins,
    floor,
    ceiling,
    champOdds: inp.champOdds || '—',
    playoffProb: inp.playoffOdds ?? null,
    marketWins: inp.marketWins ?? null,
    marketDelta,
    divOutlook,
    confidenceTier: tier,
    manager: inp.manager || 'TBD',
  };
}

// ── Rationale generator ──────────────────────────────────────

function generateRationale(slug, inp, proj) {
  const team = MLB_TEAMS.find((t) => t.slug === slug);
  const name = team?.name || slug;
  const parts = [];

  // Opening — anchor on projection
  const winsWord = proj.projectedWins >= 90 ? 'strong' :
                   proj.projectedWins >= 82 ? 'solid' :
                   proj.projectedWins >= 74 ? 'modest' : 'challenging';
  parts.push(`Projected at ${proj.projectedWins} wins — a ${winsWord} outlook for the ${name}.`);

  // Historical context
  const prior = inp.priorWins;
  const diff = proj.projectedWins - prior;
  if (Math.abs(diff) >= 5) {
    const dir = diff > 0 ? 'improvement' : 'decline';
    parts.push(`That represents a notable ${Math.abs(diff)}-win ${dir} from last season's ${prior}-win finish.`);
  } else if (Math.abs(diff) >= 2) {
    const dir = diff > 0 ? 'uptick' : 'dip';
    parts.push(`A slight ${dir} from their ${prior}-win campaign last year.`);
  } else {
    parts.push(`Roughly in line with their ${prior}-win mark from last season.`);
  }

  // Pythagorean context
  if (Math.abs((inp.pythagWins || prior) - prior) >= 3) {
    const pyDiff = (inp.pythagWins || prior) - prior;
    if (pyDiff > 0) {
      parts.push(`Run differential data suggests they underperformed by about ${Math.abs(pyDiff)} wins relative to true quality, signaling bounce-back potential.`);
    } else {
      parts.push(`Their run differential pointed to about ${Math.abs(pyDiff)} fewer expected wins — some regression is baked into this projection.`);
    }
  }

  // Roster context
  const hNet = (inp.hitterAdd || 0) - (inp.hitterLoss || 0);
  const sNet = (inp.starterAdd || 0) - (inp.starterLoss || 0);
  if (hNet >= 3) parts.push(`Meaningful offensive upgrades strengthen the lineup.`);
  else if (hNet <= -2) parts.push(`Offensive losses create some lineup uncertainty.`);

  if (sNet >= 3) parts.push(`Added rotation depth provides a clear pitching boost.`);
  else if (sNet <= -2) parts.push(`Rotation turnover introduces pitching risk.`);

  if ((inp.bullpenDelta || 0) >= 2) parts.push(`The bullpen looks notably improved heading into the season.`);
  if ((inp.prospect || 0) >= 5) parts.push(`A strong prospect pipeline provides significant upside if top talents break through.`);
  if ((inp.aging || 0) <= -2) parts.push(`An aging roster profile introduces some durability concerns.`);
  if ((inp.injury || 0) <= -2) parts.push(`Injury history across key contributors remains a headwind.`);

  // Manager
  if ((inp.mgrScore || 5) >= 7) {
    parts.push(`Manager ${inp.manager} brings an elite track record that adds stability and in-game edge.`);
  } else if ((inp.mgrContinuity || 0) === 0) {
    parts.push(`A first-year manager in ${inp.manager} introduces some tactical adjustment uncertainty.`);
  }

  // Division
  if ((inp.divStrength || 5) >= 6) {
    parts.push(`Playing in a loaded division will test depth across the full 162-game grind.`);
  } else if ((inp.divStrength || 5) <= 3) {
    parts.push(`A relatively soft division provides a friendlier path to wins.`);
  }

  // Market context
  if (proj.marketDelta >= 2) {
    parts.push(`The model sees ${round1(proj.marketDelta)} more wins than the market consensus (${inp.marketWins}), flagging potential value.`);
  } else if (proj.marketDelta <= -2) {
    parts.push(`At ${round1(Math.abs(proj.marketDelta))} wins below market consensus, the model is somewhat more bearish than public sentiment.`);
  }

  // Championship odds
  const oddsNum = parseInt(String(inp.champOdds).replace('+', ''), 10);
  if (oddsNum && oddsNum <= 500) {
    parts.push(`Championship odds of ${inp.champOdds} reflect consensus top-tier contender status.`);
  } else if (oddsNum && oddsNum <= 2000) {
    parts.push(`At ${inp.champOdds} to win the World Series, the market sees a legitimate postseason threat.`);
  }

  // Confidence / band
  parts.push(`Win range: ${proj.floor}–${proj.ceiling}. Confidence: ${proj.confidenceTier}.`);

  return parts.join(' ');
}

// ── Public API ───────────────────────────────────────────────

/** Returns full projections for all 30 teams, merged with team registry data. */
export function getSeasonProjections() {
  return MLB_TEAMS.map((team) => {
    const inp = TEAM_INPUTS[team.slug];
    if (!inp) {
      // Fallback for any missing team inputs
      return {
        ...team,
        projectedWins: LEAGUE_AVG_WINS,
        floor: 74, ceiling: 88,
        champOdds: '—', playoffProb: null, marketWins: null,
        marketDelta: 0, divOutlook: 'Fringe', confidenceTier: 'Low',
        manager: 'TBD', rationale: 'Projection data not yet available for this team.',
      };
    }
    const proj = projectTeam(team.slug, inp);
    const rationale = generateRationale(team.slug, inp, proj);
    return { ...team, ...proj, rationale };
  });
}

/** Pre-defined sort functions. */
export const SORT_OPTIONS = [
  { key: 'wins-desc', label: 'Projected Wins (High → Low)' },
  { key: 'wins-asc',  label: 'Projected Wins (Low → High)' },
  { key: 'odds',      label: 'Championship Odds' },
  { key: 'alpha',     label: 'Alphabetical' },
  { key: 'delta',     label: 'Model vs Market' },
];

function parseOdds(s) {
  const n = parseInt(String(s).replace('+', ''), 10);
  return Number.isFinite(n) ? n : 999999;
}

export function sortTeams(teams, key) {
  const arr = [...teams];
  switch (key) {
    case 'wins-desc': return arr.sort((a, b) => b.projectedWins - a.projectedWins);
    case 'wins-asc':  return arr.sort((a, b) => a.projectedWins - b.projectedWins);
    case 'odds':      return arr.sort((a, b) => parseOdds(a.champOdds) - parseOdds(b.champOdds));
    case 'alpha':     return arr.sort((a, b) => a.name.localeCompare(b.name));
    case 'delta':     return arr.sort((a, b) => (b.marketDelta || 0) - (a.marketDelta || 0));
    default:          return arr;
  }
}

/** Filter helpers. */
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
