/**
 * NFL launch announcement: a one-time email telling every user that football
 * is live on Maximus Sports. Sent once by /api/email/nfl-launch.
 *
 * Picks come from the live NFL picks board at send time, so the email states
 * exactly what the app shows: line, price, book and the reason for each pick.
 */

import { EmailShell } from '../EmailShell.js';
import { recommendedPicks, summarizePick } from '../../features/nfl/picks/pickSummary.js';

const F = "'DM Sans',Arial,Helvetica,sans-serif";
const NAVY = '#0f2440';
const ACCENT = '#2d6ca8';
const RED = '#c8102e';
const TEXT = '#1a1a2e';
const BODY = '#4b5563';
const DIM = '#8a94a6';
const BORDER = '#e8ecf0';
const SITE = 'https://maximussports.ai';
const UTM = 'utm_source=email&utm_medium=email&utm_campaign=nfl_launch';
const PICKS_URL = `${SITE}/nfl/insights?${UTM}`;
const NFL_URL = `${SITE}/nfl?${UTM}`;

const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function kickoff(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: '2-digit' }) + ' ET';
  } catch { return ''; }
}

/** Upcoming recommended picks from the board, with team logos. */
export function launchPicks(board, { max = 5, now = Date.now() } = {}) {
  return recommendedPicks(board)
    .filter((p) => !p.matchup?.startTime || Date.parse(p.matchup.startTime) > now)
    .slice(0, max)
    .map((p) => ({
      ...summarizePick(p),
      awayLogo: p.matchup?.awayTeam?.logo || null,
      homeLogo: p.matchup?.homeTeam?.logo || null,
      away: p.matchup?.awayTeam?.shortName || '',
      home: p.matchup?.homeTeam?.shortName || '',
      venue: p.matchup?.venue || '',
    }));
}

export function getSubject({ week } = {}) {
  return week ? `Football is here: Maximus's NFL picks for Week ${week}` : `Football is here: Maximus's NFL picks are live`;
}

const logo = (url, alt) => (url
  ? `<img src="${esc(url)}" alt="${esc(alt)}" width="22" height="22" style="display:inline-block;width:22px;height:22px;vertical-align:middle;border:0;" />`
  : '');

function pickCard(p) {
  const where = [p.price, p.book ? `at ${p.book}` : ''].filter(Boolean).join(' ');
  return `
<tr>
  <td style="padding:0 24px 12px;" class="section-td">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:separate;border:1px solid ${BORDER};border-left:4px solid #16a34a;border-radius:8px;">
      <tr>
        <td style="padding:14px 16px 13px;font-family:${F};" class="card-td">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
            <tr>
              <td style="vertical-align:middle;font-size:13px;font-weight:700;color:${TEXT};font-family:${F};">
                ${logo(p.awayLogo, p.away)}&nbsp;${esc(p.away)}&nbsp;<span style="color:${DIM};font-weight:500;">at</span>&nbsp;${logo(p.homeLogo, p.home)}&nbsp;${esc(p.home)}
              </td>
              <td align="right" style="vertical-align:middle;font-size:11px;color:${DIM};font-family:${F};white-space:nowrap;">${esc(kickoff(p.kickoff))}</td>
            </tr>
          </table>
          <p style="margin:10px 0 0;font-size:19px;font-weight:800;color:${NAVY};line-height:24px;letter-spacing:-0.01em;font-family:${F};"><span style="color:#16a34a;">&#10003;</span> ${esc(p.pick)} <span style="font-size:13px;font-weight:600;color:${BODY};">${esc(where)}</span></p>
          ${p.expectedValue ? `<p style="margin:6px 0 0;font-family:${F};"><span style="display:inline-block;font-size:10px;font-weight:700;color:#166534;background-color:#ecfdf3;border-radius:3px;padding:2px 7px;letter-spacing:0.04em;text-transform:uppercase;">${esc(p.expectedValue)} expected value at lock</span></p>` : ''}
          ${p.why ? `<p style="margin:8px 0 0;font-size:13px;color:${BODY};line-height:19px;font-family:${F};"><span style="font-weight:700;color:${NAVY};">Why:</span> ${esc(p.why)}</p>` : ''}
        </td>
      </tr>
    </table>
  </td>
</tr>`;
}

function sectionTitle(kicker, title) {
  return `
<tr>
  <td style="padding:22px 24px 10px;" class="section-td">
    <p style="margin:0 0 4px;font-size:10px;font-weight:700;color:${RED};letter-spacing:0.12em;text-transform:uppercase;font-family:${F};">${kicker}</p>
    <h2 style="margin:0;font-size:19px;font-weight:800;color:${TEXT};line-height:1.3;letter-spacing:-0.01em;font-family:${F};">${title}</h2>
  </td>
</tr>`;
}

function bullet(title, text) {
  return `
<tr>
  <td style="padding:0 24px 10px;" class="section-td">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
      <tr>
        <td width="26" valign="top" style="width:26px;font-size:15px;line-height:20px;font-family:${F};">&#127944;</td>
        <td valign="top" style="font-size:14px;line-height:20px;color:${BODY};font-family:${F};"><span style="font-weight:700;color:${TEXT};">${title}</span> ${text}</td>
      </tr>
    </table>
  </td>
</tr>`;
}

function statTile(big, small) {
  return `<td width="33%" valign="top" style="padding:12px 8px;text-align:center;background-color:#f7f8fa;border:1px solid ${BORDER};border-radius:8px;font-family:${F};">
    <p style="margin:0;font-size:20px;font-weight:800;color:${NAVY};line-height:24px;font-family:${F};">${big}</p>
    <p style="margin:3px 0 0;font-size:11px;color:${BODY};line-height:15px;font-family:${F};">${small}</p>
  </td>`;
}

function screenshotBlock(shots = []) {
  const valid = (shots || []).filter((s) => s && /^https:\/\//.test(s.url || ''));
  if (valid.length === 0) return '';
  const rows = valid.map((s) => `
<tr>
  <td style="padding:0 24px 14px;" class="section-td">
    <a href="${esc(s.link || NFL_URL)}" style="text-decoration:none;">
      <img src="${esc(s.url)}" alt="${esc(s.alt || s.caption || 'Maximus Sports NFL')}" width="512" style="display:block;width:100%;max-width:512px;height:auto;border:1px solid ${BORDER};border-radius:8px;" />
    </a>
    ${s.caption ? `<p style="margin:6px 0 0;font-size:12px;color:${DIM};line-height:17px;text-align:center;font-family:${F};">${esc(s.caption)}</p>` : ''}
  </td>
</tr>`).join('');
  return `${sectionTitle('A look inside', 'What it looks like right now')}${rows}`;
}

/**
 * @param {object} data
 * @param {object|null} data.board        — live NFL picks board
 * @param {string} [data.displayName]
 * @param {string} [data.userId]
 * @param {Array<{url,caption,alt,link}>} [data.screenshots]
 */
export function renderHTML(data = {}) {
  const { board, displayName, userId, screenshots } = data;
  const week = board?.week || null;
  const picks = data.picks || launchPicks(board);
  const games = new Set((board?.fullSlatePicks || []).map((p) => p.gameId)).size || null;
  const lead = displayName ? `${esc(displayName)}, the` : 'The';

  const hero = `
<tr>
  <td bgcolor="${NAVY}" style="background-color:${NAVY};padding:26px 24px 24px;" class="hero-td">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
      <tr>
        <td valign="middle" style="font-family:${F};">
          <p style="margin:0 0 8px;font-size:11px;font-weight:700;color:#7fb2e5;letter-spacing:0.14em;text-transform:uppercase;font-family:${F};">New on Maximus Sports${week ? ` &middot; NFL Week ${week}` : ''}</p>
          <h1 class="hero-h1" style="margin:0;font-size:30px;font-weight:800;color:#ffffff;line-height:1.15;letter-spacing:-0.02em;font-family:${F};">Football is here.</h1>
          <p style="margin:10px 0 0;font-size:15px;color:#d6e2f0;line-height:22px;font-family:${F};">The NFL is live in the app, with a brand-new picks engine built for it.</p>
        </td>
        <td width="104" valign="middle" align="right" style="width:104px;padding-left:10px;">
          <img src="${SITE}/mascot.png" alt="Maximus, the Maximus Sports football mascot" width="96" height="96" style="display:block;width:96px;height:96px;border:0;" />
        </td>
      </tr>
    </table>
  </td>
</tr>`;

  const intro = `
<tr>
  <td style="padding:20px 24px 4px;" class="intro-td">
    <p style="margin:0;font-size:15px;color:${BODY};line-height:23px;font-family:${F};">${lead} NFL has arrived on Maximus Sports, and we went all in. The app now covers pro football end to end: every game, every team, live odds from a dozen sportsbooks, and <span style="font-weight:700;color:${TEXT};">Maximus&rsquo;s Picks</span> for the week. Here is what Maximus likes right now, and how the new engine decides.</p>
  </td>
</tr>`;

  const picksBlock = picks.length > 0
    ? `${sectionTitle(week ? `Week ${week}` : 'This week', 'Maximus&rsquo;s Picks')}
${picks.map(pickCard).join('')}
<tr>
  <td style="padding:0 24px 6px;" class="section-td">
    <p style="margin:0;font-size:12px;color:${DIM};line-height:18px;font-family:${F};">Each pick is locked at the line, price and book shown, then graded in public. Prices move, so check the current number before you act: the pick is only as good as the price.${games ? ` Maximus&rsquo;s lean on all ${games} games is in the app.` : ''}</p>
  </td>
</tr>
<tr>
  <td style="padding:10px 24px 4px;" class="section-td">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
      <tr><td bgcolor="${RED}" style="background-color:${RED};border-radius:6px;"><a href="${PICKS_URL}" style="display:inline-block;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;padding:11px 20px;font-family:${F};border-radius:6px;">See every pick and lean &rarr;</a></td></tr>
    </table>
  </td>
</tr>`
    : `${sectionTitle(week ? `Week ${week}` : 'This week', 'Maximus&rsquo;s Picks')}
<tr><td style="padding:0 24px 6px;" class="section-td"><p style="margin:0;font-size:14px;color:${BODY};line-height:21px;font-family:${F};"><span style="font-weight:700;color:${NAVY};">No recommended NFL bets right now.</span> Why: no sportsbook is paying enough over the market&rsquo;s fair price to clear our bar. Every game&rsquo;s lean is in the app, tracked and graded.</p></td></tr>`;

  const method = `
${sectionTitle('The new methodology', 'How Maximus picks football')}
<tr>
  <td style="padding:0 24px 12px;" class="section-td">
    <p style="margin:0;font-size:14px;color:${BODY};line-height:21px;font-family:${F};">We rebuilt the engine for the NFL around one idea: a pick has to be a better price than the market, and it has to prove itself in the open.</p>
  </td>
</tr>
<tr>
  <td style="padding:0 24px 14px;" class="section-td">
    <table role="presentation" cellpadding="0" cellspacing="6" width="100%" style="border-collapse:separate;">
      <tr>
        ${statTile('6,232', 'NFL games tested, 2003 to 2025')}
        ${statTile('12', 'sportsbooks compared on every game')}
        ${statTile('57%', 'of unders have won in 15+ mph wind')}
      </tr>
    </table>
  </td>
</tr>
${bullet('Price first.', 'A recommended pick is one sportsbook&rsquo;s line and price that beats the fair price across the market by at least 1.5% expected value. No edge, no pick.')}
${bullet('Locked and graded.', 'Every pick is locked with its line, price and book the moment it is published, then graded in units and against the closing line. No quiet edits.')}
${bullet('We tested the folk wisdom.', 'Trap games, bye weeks, letdown spots, west-coast teams in early kickoffs: we ran them all against two decades of closing lines. Most are already in the number. Wind is the one that held up, so it moves our totals.')}
${bullet('Weather at every stadium.', 'Kickoff wind, temperature and rain for the building the game is played in, international games included. The wind adjustment scales with the forecast instead of flipping on at a cutoff.')}
${bullet('A reason, every time.', 'Maximus never names a pick without saying why, in one plain sentence.')}`;

  const inside = `
${sectionTitle('Also new', 'Everything in the NFL section')}
${bullet('Every game, four ways.', 'Spread, moneyline, total and one best call per game, ranked by conviction.')}
${bullet('Matchup pages.', 'Position-group matchups, injuries, conditions and an aerial flyover of the stadium.')}
${bullet('All 32 teams.', 'Roster talent, schedule, news and odds for your team, with NFL now on your home page.')}
${bullet('A public record.', 'Results and the running scorecard, win or lose.')}`;

  const content = [hero, intro, picksBlock, method, screenshotBlock(screenshots), inside].join('\n');

  return EmailShell({
    content,
    previewText: picks.length > 0
      ? `The NFL is live on Maximus Sports. ${picks.length} pick${picks.length === 1 ? '' : 's'} for Week ${week || 'this week'}, each with the reason for it.`
      : 'The NFL is live on Maximus Sports, with a brand-new picks engine.',
    userId,
    ctaUrl: NFL_URL,
    ctaLabel: 'Open the NFL on Maximus Sports &rarr;',
  });
}

export function renderText(data = {}) {
  const { board, displayName } = data;
  const week = board?.week || null;
  const picks = data.picks || launchPicks(board);
  const lines = [
    'FOOTBALL IS HERE.',
    '',
    `${displayName ? `${displayName}, the` : 'The'} NFL is live on Maximus Sports, with a brand-new picks engine built for it: every game, every team, live odds from a dozen sportsbooks, and Maximus's Picks for the week.`,
    '',
    `MAXIMUS'S PICKS${week ? `: WEEK ${week}` : ''}`,
  ];
  if (picks.length > 0) {
    picks.forEach((p) => {
      const where = [p.price, p.book ? `at ${p.book}` : ''].filter(Boolean).join(' ');
      lines.push(`- ${p.matchup}${p.kickoff ? ` (${kickoff(p.kickoff)})` : ''}: ${p.pick} ${where}`.trim());
      if (p.why) lines.push(`  Why: ${p.why}`);
    });
    lines.push('Each pick is locked at the line, price and book shown, then graded in public. Prices move, so check the current number before you act.');
  } else {
    lines.push("No recommended NFL bets right now. Why: no sportsbook is paying enough over the market's fair price to clear our bar.");
  }
  lines.push(
    '',
    'HOW MAXIMUS PICKS FOOTBALL',
    "- Price first: a recommended pick is one sportsbook's line and price that beats the fair price across the market by at least 1.5% expected value.",
    '- Locked and graded: every pick is locked with its line, price and book when published, then graded in units and against the closing line.',
    '- We tested the folk wisdom: trap games, bye weeks and letdown spots, against two decades of closing lines (6,232 games). Most are already in the number. Wind held up: unders have won 57% of the time in 15+ mph wind.',
    '- Weather at every stadium, international games included.',
    '- A reason, every time.',
    '',
    `See every pick: ${PICKS_URL}`,
    '',
    'Not betting advice. Sports intelligence for informational purposes only.',
    `Manage preferences: ${SITE}/settings`,
  );
  return lines.join('\n');
}
