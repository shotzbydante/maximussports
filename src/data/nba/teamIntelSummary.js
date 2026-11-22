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

import { nbaSeasonPhase } from '../../sports/nba/season.js';

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

/** "11-5, 2nd in Eastern" reads better as "11-5, 2nd in the East". */
function plainStanding(standing) {
  return String(standing || '').replace(/\bin (Eastern|Western)\b/, (_, c) => `in the ${c === 'Eastern' ? 'East' : 'West'}`);
}

function titleOddsLine(odds) {
  const american = odds?.bestChanceAmerican;
  if (american == null) return null;
  const price = `${american > 0 ? '+' : ''}${american}`;
  if (american <= 500) return `At ${price} to win the title, the market prices them as one of the favorites.`;
  if (american <= 2000) return `At ${price} to win the title, the market has them in the second tier of contenders.`;
  if (american >= 5000) return `At ${price} to win the title, the market is not counting on this season.`;
  return `They are ${price} to win the title.`;
}

/** What the page says from opening night until the play-in. */
function regularSeasonSummary({ team, odds, record, standing, streak }) {
  const mascot = team.name.split(' ').pop();
  const place = plainStanding(standing);
  const parts = [];
  const [w, l] = String(record || '').split('-').map(Number);
  const games = (w || 0) + (l || 0);

  if (games > 0) {
    const pct = w / games;
    const where = place ? `, ${place}` : '';
    if (pct >= 0.65) parts.push(`The ${mascot} are ${record}${where}, one of the best records in the league.`);
    else if (pct >= 0.55) parts.push(`The ${mascot} are ${record}${where}, comfortably on the right side of the standings.`);
    else if (pct >= 0.45) parts.push(`The ${mascot} are ${record}${where}, in the middle of the pack with most of the season to play.`);
    else parts.push(`The ${mascot} are ${record}${where}, and have ground to make up.`);
  } else {
    parts.push(`${team.name} have not played yet this season. Record, standing and title odds fill in here as games are played.`);
  }

  const run = /^([WL])(\d+)$/.exec(String(streak || ''));
  if (run && Number(run[2]) >= 3) {
    parts.push(run[1] === 'W' ? `They have won ${run[2]} in a row.` : `They have lost ${run[2]} in a row.`);
  }

  const price = titleOddsLine(odds);
  if (price) parts.push(price);
  return parts.join(' ');
}

/**
 * @param {Object} opts
 * @param {Object} opts.team - NBA_TEAMS entry
 * @param {Object} [opts.odds] - championship odds { bestChanceAmerican, bestPayoutAmerican }
 * @param {string} [opts.record] - e.g. "42-28"
 * @param {string} [opts.standing] - e.g. "2nd in East"
 * @param {string} [opts.streak] - e.g. "W3"
 * @param {'regular_season'|'playoffs'|'offseason'} [opts.phase] - defaults to today's
 * @returns {string}
 */
export function buildNbaTeamIntelSummary({ team, odds, record, standing, streak, phase = nbaSeasonPhase() }) {
  if (!team) return '';
  // The playoff copy below talks about seeds, series and brackets, which is
  // only true from the play-in to the Finals.
  if (phase !== 'playoffs') return regularSeasonSummary({ team, odds, record, standing, streak });
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
      if (pct >= 0.65) {
        parts.push(`${emoji} The ${mascot} finished the regular season at ${record}${standing ? `, ${standing}` : ''}, entering the playoffs as a top contender.`);
      } else if (pct >= 0.55) {
        parts.push(`${emoji} The ${mascot} closed the regular season at ${record}${standing ? `, ${standing}` : ''}, earning a playoff berth as a legitimate contender.`);
      } else if (pct >= 0.45) {
        parts.push(`${emoji} At ${record}${standing ? ` (${standing})` : ''}, the ${mascot} are in the playoff mix but will need to prove themselves in a best-of-7 format.`);
      } else {
        parts.push(`${emoji} The ${mascot} finished at ${record}${standing ? ` (${standing})` : ''}. An uphill postseason road awaits.`);
      }
    } else {
      parts.push(`${emoji} ${name} playoff intelligence is building. Check back for updated bracket position and series outlook.`);
    }
  } else {
    parts.push(`${emoji} ${name} playoff intelligence is building. Check back for bracket position, series predictions, and title odds.`);
  }

  // Playoff seed context
  if (standing) {
    if (standing.includes('1st')) {
      parts.push(`The top seed gives them home-court advantage throughout the conference bracket \u2014 a significant edge in a seven-game series.`);
    } else if (standing.includes('2nd') || standing.includes('3rd')) {
      parts.push(`A top-three seed means home-court advantage in the first two rounds, setting up a favorable path through the bracket.`);
    } else if (standing.includes('4th') || standing.includes('5th')) {
      parts.push(`Seeded in the middle of the bracket, they could face a tough second-round matchup against a top seed.`);
    } else if (standing.includes('7th') || standing.includes('8th')) {
      parts.push(`Entered the playoffs through the play-in tournament \u2014 road-tested and battle-ready, but facing a top seed in the first round.`);
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
