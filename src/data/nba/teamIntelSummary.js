/**
 * buildNbaTeamIntelSummary — premium editorial intelligence summary for NBA teams.
 *
 * Used by:
 *   - NBA Team Intel pages
 *   - NBA Home briefing
 *
 * Produces narrative, premium, Intel-Briefing-aligned team summaries
 * from structured projection/odds inputs.
 */

const TEAM_EMOJI = {
  bos: '\u2618\uFE0F', lal: '\uD83D\uDFE1', gsw: '\uD83D\uDFE1', nyk: '\uD83D\uDDFD',
  mil: '\uD83E\uDD8C', phi: '\uD83D\uDD14', den: '\u26CF\uFE0F', phx: '\u2600\uFE0F',
  mia: '\uD83D\uDD25', dal: '\uD83D\uDC0E', cle: '\u2694\uFE0F', mem: '\uD83D\uDC3B',
  sac: '\uD83D\uDC51', okc: '\u26A1', min: '\uD83D\uDC3A', ind: '\uD83C\uDFCE\uFE0F',
  atl: '\uD83E\uDD85', chi: '\uD83D\uDC02', tor: '\uD83E\uDD96', bkn: '\uD83C\uDF09',
  orl: '\u2728', cha: '\uD83D\uDC1D', was: '\uD83C\uDDFA\uD83C\uDDF8', det: '\uD83D\uDD27',
  hou: '\uD83D\uDE80', nop: '\u269C\uFE0F', sas: '\uD83E\uDDB6', por: '\uD83C\uDF32',
  uta: '\u26F7\uFE0F', lac: '\u2693',
};

/**
 * @param {Object} opts
 * @param {Object} opts.team - NBA_TEAMS entry
 * @param {Object} [opts.odds] - championship odds { bestChanceAmerican, bestPayoutAmerican }
 * @param {string} [opts.record] - e.g. "42-28"
 * @param {string} [opts.standing] - e.g. "2nd in East"
 * @param {string} [opts.streak] - e.g. "W3"
 * @returns {string}
 */
export function buildNbaTeamIntelSummary({ team, odds, record, standing, streak }) {
  if (!team) return '';
  const slug = team.slug;
  const emoji = TEAM_EMOJI[slug] || '\uD83C\uDFC0';
  const name = team.name;
  const mascot = name.split(' ').pop();

  const parts = [];

  // Opening — team identity + context
  if (record) {
    const [w, l] = record.split('-').map(Number);
    const total = w + l;
    if (total > 0) {
      const pct = w / total;
      const pace82 = Math.round(pct * 82);
      if (pct >= 0.65) {
        parts.push(`${emoji} The ${mascot} are on a dominant run at ${record}, on pace for ${pace82} wins${standing ? ` and currently sitting ${standing}` : ''}.`);
      } else if (pct >= 0.55) {
        parts.push(`${emoji} The ${mascot} hold a solid ${record} record${standing ? `, ${standing}` : ''}, positioning themselves as a legitimate playoff contender.`);
      } else if (pct >= 0.45) {
        parts.push(`${emoji} At ${record}${standing ? ` (${standing})` : ''}, the ${mascot} are in that competitive middle tier — close enough to make a push, but with work to do.`);
      } else {
        parts.push(`${emoji} The ${mascot} sit at ${record}${standing ? ` (${standing})` : ''}, facing an uphill climb in the conference standings.`);
      }
    } else {
      parts.push(`${emoji} The ${mascot} are gearing up for the season${standing ? `, projected ${standing}` : ''}.`);
    }
  } else {
    parts.push(`${emoji} ${name} intelligence is building. Check back for updated standings, odds, and season outlook.`);
  }

  // Streak context
  if (streak) {
    if (streak.startsWith('W') && parseInt(streak.slice(1)) >= 3) {
      parts.push(`Currently riding a ${streak} streak, showing strong form heading into upcoming matchups.`);
    } else if (streak.startsWith('L') && parseInt(streak.slice(1)) >= 3) {
      parts.push(`A ${streak} skid has cooled momentum — the next few games will be crucial for righting the ship.`);
    }
  }

  // Conference positioning
  if (standing) {
    if (standing.includes('1st')) {
      parts.push(`Holding the top spot in the conference puts them in prime position for home-court advantage through the playoffs.`);
    } else if (standing.includes('2nd') || standing.includes('3rd')) {
      parts.push(`A top-three conference seed gives them a favorable playoff path if they can maintain this level.`);
    } else if (standing.includes('7th') || standing.includes('8th') || standing.includes('9th') || standing.includes('10th')) {
      parts.push(`Sitting in play-in territory, every game carries extra weight down the stretch.`);
    }
  }

  // Championship odds context
  if (odds?.bestChanceAmerican != null) {
    const american = odds.bestChanceAmerican;
    if (american <= 500) {
      parts.push(`Championship odds of ${american > 0 ? '+' : ''}${american} reflect legitimate title contender status in the betting market.`);
    } else if (american <= 2000) {
      parts.push(`At ${american > 0 ? '+' : ''}${american} to win the title, the market sees them as a dark-horse contender with real upside.`);
    } else if (american >= 5000) {
      parts.push(`Championship odds of ${american > 0 ? '+' : ''}${american} suggest the market views this as a longer-term project.`);
    }
  }

  return parts.join(' ');
}
