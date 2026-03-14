/**
 * Daily AI Briefing — editorial newsletter template.
 * Sent at 6:00 AM PT. Clean, readable, Morning Brew–inspired layout.
 *
 * @param {object} data
 * @param {string} [data.displayName]
 * @param {Array}  [data.scoresToday]
 * @param {Array}  [data.rankingsTop25]
 * @param {object} [data.atsLeaders]      — { best: [...], worst: [...] }
 * @param {Array}  [data.headlines]
 * @param {Array}  [data.pinnedTeams]     — [{ name, slug }]
 * @param {Array}  [data.botIntelBullets]
 */

import { EmailShell, heroBlock, sectionCard, sectionLabel, teamLogoImg } from '../EmailShell.js';
import { getTeamTodaySummary } from '../../../api/_lib/teamSchedule.js';
import { renderEmailGameList } from '../../../api/_lib/emailGameCards.js';

export function getSubject(data = {}) {
  const name = data.displayName ? data.displayName.split(' ')[0] : null;
  const dow = new Date().toLocaleDateString('en-US', { weekday: 'long' });
  if (name) return `${name}, here\u2019s your ${dow} hoops briefing`;
  return `Your ${dow} college hoops briefing`;
}

export function renderHTML(data = {}) {
  const {
    displayName,
    scoresToday = [],
    rankingsTop25 = [],
    atsLeaders = {},
    headlines = [],
    pinnedTeams = [],
    botIntelBullets = [],
  } = data;

  const firstName = displayName ? displayName.split(' ')[0] : null;
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const greetingName = firstName || 'there';

  const gameCount = scoresToday.length;
  const bestAts = atsLeaders.best || [];

  // Editorial intro paragraph
  let introParagraph;
  if (gameCount > 0 && bestAts.length > 0) {
    introParagraph = `Good morning, ${greetingName}. ${gameCount} game${gameCount !== 1 ? 's' : ''} on today\u2019s slate and the lines are moving. Here\u2019s what matters before tip-off.`;
  } else if (gameCount > 0) {
    introParagraph = `Good morning, ${greetingName}. ${gameCount} game${gameCount !== 1 ? 's' : ''} on today\u2019s slate. Here\u2019s what Maximus Sports is watching.`;
  } else {
    introParagraph = `Good morning, ${greetingName}. Light slate today \u2014 Maximus Sports is staying disciplined. Here\u2019s the intel that matters.`;
  }

  // Bot intel section
  let botIntelSection = '';
  if (botIntelBullets.length > 0) {
    const bullets = botIntelBullets.slice(0, 4).map(b =>
      `<tr>
        <td valign="top" style="width:18px;color:#2d6ca8;font-size:14px;padding-top:1px;font-family:'DM Sans',Arial,sans-serif;">&bull;</td>
        <td valign="top" style="font-size:14px;color:#4a5568;line-height:1.6;font-family:'DM Sans',Arial,sans-serif;padding-bottom:8px;">${b}</td>
      </tr>`
    ).join('');
    botIntelSection = `
<tr>
  <td style="padding:0 24px 14px;" class="section-td">
    <div style="margin-bottom:10px;">${sectionLabel('MAXIMUS SAYS')}</div>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
      ${bullets}
    </table>
  </td>
</tr>`;
  }

  // Games section
  const gameCardsHtml = gameCount > 0 ? renderEmailGameList(scoresToday, { max: 3, compact: true }) : '';
  let gamesSection = '';
  if (gameCount > 0) {
    gamesSection = `
<tr>
  <td style="padding:0 24px 4px;" class="section-td">
    <div style="margin-bottom:4px;">${sectionLabel('TODAY\u2019S GAMES')}</div>
    <p style="margin:0 0 8px;font-size:14px;color:#4a5568;line-height:1.5;font-family:'DM Sans',Arial,sans-serif;">${gameCount} game${gameCount !== 1 ? 's' : ''} on the slate.</p>
  </td>
</tr>
${gameCardsHtml}`;
  }

  // ATS section
  let atsBody = '';
  if (bestAts.length > 0) {
    const top = bestAts[0];
    const pct = top.pct != null ? `${Math.round(top.pct * 100)}%` : '';
    atsBody = `<strong style="color:#1a1a2e;">${top.name || top.team || 'A team'}</strong> ${pct ? `is covering at ${pct} ATS` : 'is the top ATS performer right now'}. ${bestAts.length > 1 ? `${bestAts[1].name || bestAts[1].team} is also worth watching.` : ''}`;
  } else {
    atsBody = 'No major ATS edges detected today. Patience is a strategy.';
  }

  // Rankings
  let rankBody = '';
  if (rankingsTop25.length > 0) {
    const top3 = rankingsTop25.slice(0, 3).map((r, i) => `#${i + 1} ${r.teamName || r.name || r.team || 'Unknown'}`).join(', ');
    rankBody = `Current top 3: ${top3}. The bubble is tightening.`;
  } else {
    rankBody = 'Rankings data is refreshing. Check the app for the latest AP Top 25.';
  }

  // Pinned teams
  let pinnedSection = '';
  if (pinnedTeams.length > 0) {
    const pinnedRows = pinnedTeams.slice(0, 3).map(team => {
      const teamSlug = team.slug || '';
      const teamUrl = teamSlug ? `https://maximussports.ai/teams/${teamSlug}` : 'https://maximussports.ai';
      const { gameInfo } = getTeamTodaySummary(team, scoresToday);
      const logoHtml = teamLogoImg(team, 20);
      return `<tr>
  <td style="padding:8px 0;border-bottom:1px solid #e8ecf0;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
      <tr>
        <td valign="middle" style="width:26px;padding-right:8px;">${logoHtml}</td>
        <td valign="middle">
          <a href="${teamUrl}" style="font-size:14px;font-weight:600;color:#1a1a2e;text-decoration:none;font-family:'DM Sans',Arial,sans-serif;">${team.name}</a>
          <div style="margin-top:2px;font-size:12px;color:#8a94a6;">${gameInfo}</div>
        </td>
      </tr>
    </table>
  </td>
</tr>`;
    }).join('');

    pinnedSection = `
<tr>
  <td style="padding:0 24px 14px;" class="section-td">
    <div style="margin-bottom:8px;">${sectionLabel('YOUR TEAMS')}</div>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
      ${pinnedRows}
    </table>
    <div style="margin-top:8px;">
      <a href="https://maximussports.ai/teams" style="font-size:12px;color:#2d6ca8;text-decoration:none;font-weight:600;font-family:'DM Sans',Arial,sans-serif;">All team intel &rarr;</a>
    </div>
  </td>
</tr>`;
  }

  // Headlines
  let headlineSection = '';
  if (headlines.length > 0) {
    const headlineItems = headlines.slice(0, 4).map(h => {
      const title = h.title || 'Breaking';
      const source = h.source || '';
      const link = h.link || 'https://maximussports.ai';
      const pubDate = h.pubDate
        ? new Date(h.pubDate).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
        : '';
      return `<tr>
  <td style="padding:8px 0;border-bottom:1px solid #e8ecf0;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
      <tr>
        <td>
          <a href="${link}" style="font-size:14px;font-weight:600;color:#1a1a2e;text-decoration:none;line-height:1.4;font-family:'DM Sans',Arial,sans-serif;display:block;" target="_blank">${title}</a>
          <div style="margin-top:3px;">
            ${source ? `<span style="font-size:11px;color:#8a94a6;font-family:'DM Sans',Arial,sans-serif;">${source}</span>` : ''}
            ${pubDate ? `<span style="font-size:11px;color:#b0b8c4;font-family:'DM Sans',Arial,sans-serif;"> &middot; ${pubDate}</span>` : ''}
          </div>
        </td>
        <td align="right" valign="top" style="padding-left:12px;white-space:nowrap;">
          <a href="${link}" style="font-size:12px;color:#2d6ca8;text-decoration:none;font-weight:600;" target="_blank">Read &rarr;</a>
        </td>
      </tr>
    </table>
  </td>
</tr>`;
    }).join('');
    headlineSection = `
<tr>
  <td style="padding:0 24px 14px;" class="section-td">
    <div style="margin-bottom:8px;">${sectionLabel('HEADLINES')}</div>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
      ${headlineItems}
    </table>
  </td>
</tr>`;
  }

  const content = `
${heroBlock({
    line: `What you need to know before tonight\u2019s games.`,
    sublabel: today,
  })}

<tr>
  <td style="padding:10px 24px 16px;" class="intro-td">
    <p style="margin:0;font-size:15px;color:#4a5568;line-height:1.65;font-family:'DM Sans',Arial,Helvetica,sans-serif;">
      ${introParagraph}
    </p>
  </td>
</tr>

<tr>
  <td style="padding:0 24px;" class="divider-td">
    <div style="height:1px;background-color:#e8ecf0;font-size:0;line-height:0;">&nbsp;</div>
  </td>
</tr>
<tr><td style="height:14px;font-size:0;line-height:0;">&nbsp;</td></tr>

${botIntelSection}

${gamesSection}

${sectionCard({
    pillLabel: 'ATS EDGE',
    pillType: 'ats',
    headline: 'Against the Spread',
    body: atsBody,
  })}

${sectionCard({
    pillLabel: 'RANKINGS',
    pillType: 'intel',
    headline: 'AP Top 25',
    body: rankBody,
  })}

${pinnedSection}

${headlineSection}`;

  return EmailShell({
    content,
    previewText: `Your Maximus Sports briefing for ${today} \u2014 games, ATS leaders, and intel in one read.`,
  });
}

export function renderText(data = {}) {
  const { displayName, scoresToday = [], atsLeaders = {}, headlines = [], botIntelBullets = [], pinnedTeams = [] } = data;
  const name = displayName ? displayName.split(' ')[0] : 'there';
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const lines = [
    'MAXIMUS SPORTS \u2014 Daily Briefing',
    today,
    '',
    `Good morning, ${name}. Here\u2019s your edge today.`,
    '',
    ...(botIntelBullets.length > 0 ? [
      'MAXIMUS SAYS',
      ...botIntelBullets.slice(0, 4).map(b => `- ${b}`),
      '',
    ] : []),
    'WHAT TO WATCH',
    scoresToday.length > 0 ? `${scoresToday.length} games on the slate today.` : 'Light slate today.',
    '',
    'ATS EDGE',
    atsLeaders.best?.length > 0
      ? `Top ATS performer: ${atsLeaders.best[0].name || atsLeaders.best[0].team}`
      : 'No major ATS edges today.',
    '',
    ...(pinnedTeams.length > 0 ? [
      'YOUR TEAMS',
      ...pinnedTeams.slice(0, 3).map(t => {
        const { gameInfoText } = getTeamTodaySummary(t, scoresToday);
        return `${t.name}: ${gameInfoText}`;
      }),
      '',
    ] : []),
    'HEADLINES',
    ...headlines.slice(0, 3).map(h => `- ${h.title || 'No title'}`),
    '',
    'Open Maximus Sports -> https://maximussports.ai',
    '',
    'Not betting advice. Manage preferences: https://maximussports.ai/settings',
  ];
  return lines.join('\n');
}
