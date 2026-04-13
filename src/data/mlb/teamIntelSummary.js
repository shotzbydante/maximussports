/**
 * buildMlbTeamIntelSummary — premium editorial intelligence summary for MLB teams.
 *
 * Used by:
 *   - Pinned team cards
 *   - MLB Team Intel pages
 *
 * Produces narrative, premium, Intel-Briefing-aligned team summaries
 * from structured model/projection inputs.
 */

const TEAM_EMOJI = {
  nyy: '🗽', bos: '🧦', tor: '🍁', tb: '⚡', bal: '🦅',
  cle: '🛡️', min: '🎯', det: '🐯', cws: '🖤', kc: '👑',
  hou: '🚀', laa: '😇', sea: '🌊', tex: '🤠', oak: '🐘',
  lad: '🔵', sd: '🟤', sf: '🔶', ari: '🐍', col: '🏔️',
  atl: '🪓', nym: '🟠', phi: '🔔', was: '🇺🇸', mia: '🐠',
  mil: '🍺', chc: '🐻', stl: '🐦', cin: '🔴', pit: '🏴‍☠️',
};

const CONTENDER_THRESHOLD = 88;
const FRINGE_THRESHOLD = 80;

/**
 * @param {Object} opts
 * @param {Object} opts.team - MLB_TEAMS entry { slug, name, division, league }
 * @param {Object} opts.projection - from getTeamProjection()
 * @param {Object} opts.meta - from getTeamMeta() { record2025, finish, priorWins }
 * @param {Object} [opts.odds] - championship odds { bestChanceAmerican }
 * @param {string} [opts.currentRecord] - e.g. "0-0"
 * @returns {string}
 */
export function buildMlbTeamIntelSummary({ team, projection, meta, odds, currentRecord }) {
  if (!team) return '';
  const slug = team.slug;
  const emoji = TEAM_EMOJI[slug] || '⚾';
  const name = team.name;
  const mascot = /White Sox$/i.test(name) ? 'White Sox'
    : /Red Sox$/i.test(name) ? 'Red Sox'
    : /Blue Jays$/i.test(name) ? 'Blue Jays'
    : name.split(' ').pop();

  if (!projection) {
    return `${emoji} ${name} intelligence is building. Check back for projected wins, market positioning, and season outlook.`;
  }

  const proj = projection;
  const tk = proj.takeaways || {};
  const wins = proj.projectedWins;
  const floor = proj.floor;
  const ceiling = proj.ceiling;
  const delta = proj.marketDelta || 0;
  const conf = proj.confidenceTier || 'Medium';
  const priorWins = meta?.priorWins;
  const finish = meta?.finish;
  const driver = tk.strongestDriver;
  const drag = tk.biggestDrag;
  const risk = tk.riskProfile;

  const parts = [];

  // Opening — team position / identity
  if (wins >= 95) {
    parts.push(`${emoji} The ${mascot} project as one of baseball's elite clubs this season, with the model landing them at ${wins} wins.`);
  } else if (wins >= CONTENDER_THRESHOLD) {
    parts.push(`${emoji} The ${mascot} look like legitimate contenders, projected at ${wins} wins with a ${floor}–${ceiling} range.`);
  } else if (wins >= FRINGE_THRESHOLD) {
    parts.push(`${emoji} The ${mascot} sit in that interesting middle ground — projected at ${wins} wins, close enough to contend but not a lock for October.`);
  } else if (wins >= 72) {
    parts.push(`${emoji} It's a transition year for the ${mascot}, with the model projecting ${wins} wins. The path to meaningful October baseball is narrow.`);
  } else {
    parts.push(`${emoji} The ${mascot} face a long road, projected at just ${wins} wins. This looks like a rebuild year with limited upside in the short term.`);
  }

  // Driver / quality signal
  if (driver) {
    const driverLower = driver.toLowerCase();
    if (driverLower.includes('rotation') || driverLower.includes('pitching')) {
      parts.push(`Pitching anchors their outlook — the rotation gives them a legitimate edge on most nights.`);
    } else if (driverLower.includes('offense') || driverLower.includes('lineup')) {
      parts.push(`The lineup is the engine here, with enough firepower to keep them in games consistently.`);
    } else if (driverLower.includes('depth') || driverLower.includes('balanced')) {
      parts.push(`Balanced depth across the roster is their calling card — no single weakness dominates the profile.`);
    } else if (driverLower.includes('bullpen')) {
      parts.push(`A reliable bullpen gives them a late-game advantage that could pay dividends in tight races.`);
    } else {
      parts.push(`${driver} stands out as the strongest factor in their projection.`);
    }
  }

  // Drag / risk factor
  if (drag && risk) {
    const riskLower = (risk || '').toLowerCase();
    if (riskLower.includes('top-heavy') || riskLower.includes('fragile')) {
      parts.push(`The risk profile leans fragile — too much depends on a few key players staying healthy.`);
    } else if (riskLower.includes('volatile')) {
      parts.push(`There's real volatility in this roster, which could mean a surprising upside swing or a frustrating underperformance.`);
    }
  }

  // Confidence context
  if (conf === 'High' || conf === 'Medium-High') {
    parts.push(`Model confidence is ${conf.toLowerCase()}, suggesting the projection sits on solid analytical ground.`);
  } else if (conf === 'Medium-Low' || conf === 'Low') {
    parts.push(`Confidence sits at ${conf.toLowerCase()} — more data points would sharpen this outlook.`);
  }

  // Market stance
  if (delta > 2) {
    parts.push(`The model sees more value than the market — sitting ${delta} wins above the consensus line.`);
  } else if (delta < -2) {
    parts.push(`Market sentiment runs warmer than our model, which has them ${Math.abs(delta)} wins below the consensus.`);
  }

  // Current record context
  if (currentRecord && currentRecord !== '0-0') {
    const [cw, cl] = currentRecord.split('-').map(Number);
    if (cw + cl >= 3) {
      const pct = cw / (cw + cl);
      const pace = Math.round(pct * 162);
      if (pace >= wins + 5) {
        parts.push(`Early returns are hot — their current ${currentRecord} pace would project to ${pace} wins, well above the model's baseline.`);
      } else if (pace <= wins - 5) {
        parts.push(`A slow start at ${currentRecord} puts them below projected pace, though it's early and regression is likely.`);
      }
    }
  }

  // Championship odds context
  if (odds?.bestChanceAmerican != null) {
    const american = odds.bestChanceAmerican;
    if (american <= 500) {
      parts.push(`World Series odds of ${american > 0 ? '+' : ''}${american} reflect legitimate title contender status in the betting market.`);
    } else if (american >= 5000) {
      parts.push(`At ${american > 0 ? '+' : ''}${american} to win the World Series, the market sees this as a longer-shot scenario.`);
    }
  }

  // Prior year context
  if (priorWins && finish) {
    const trend = wins - priorWins;
    if (trend >= 5) {
      parts.push(`A projected step forward from last year's ${meta.record2025} campaign (${finish}).`);
    } else if (trend <= -5) {
      parts.push(`A step back from last season's ${meta.record2025} record is in the cards if the model is right.`);
    }
  }

  return parts.join(' ');
}
