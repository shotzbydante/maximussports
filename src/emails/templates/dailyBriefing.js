/**
 * Daily AI Briefing email template.
 * Sent once per day at 8:00 AM PST to subscribers with preferences.briefing = true.
 *
 * @param {object} data
 * @param {string} [data.displayName]
 * @param {Array}  [data.scoresToday]
 * @param {Array}  [data.rankingsTop25]
 * @param {object} [data.atsLeaders]
 * @param {Array}  [data.headlines]
 * @param {Array}  [data.pinnedTeams]   — [{ name, slug }]
 */

import { EmailShell, heroBlock, sectionCard, pill } from '../EmailShell.js';

export function getSubject(data = {}) {
  const name = data.displayName ? `, ${data.displayName.split(' ')[0]}` : '';
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  return `Maximus Briefing${name}: Your edge for ${today}`;
}

export function renderHTML(data = {}) {
  const {
    displayName,
    scoresToday = [],
    rankingsTop25 = [],
    atsLeaders = {},
    headlines = [],
    pinnedTeams = [],
  } = data;

  const firstName = displayName ? displayName.split(' ')[0] : null;
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const greetingName = firstName ? `, ${firstName}` : '';

  // ── Pinned teams mention
  let pinnedLine = '';
  if (pinnedTeams.length >= 2) {
    const names = pinnedTeams.slice(0, 2).map(t => t.name);
    pinnedLine = `${names[0]} and ${names[1]} are both on your radar today.`;
  } else if (pinnedTeams.length === 1) {
    pinnedLine = `Your team, ${pinnedTeams[0].name}, has action today.`;
  }

  // ── Games today section
  const gameCount = scoresToday.length;
  let gamesBody = '';
  if (gameCount > 0) {
    const sample = scoresToday.slice(0, 3).map(g => {
      const teams = g.awayTeam && g.homeTeam ? `${g.awayTeam} @ ${g.homeTeam}` : 'Game TBD';
      const status = g.status || 'Scheduled';
      return `<span style="display:block;color:#8892a4;font-size:12px;padding:3px 0;border-bottom:1px solid rgba(255,255,255,0.04);">${teams} &mdash; <span style="color:#5a9fd4;">${status}</span></span>`;
    }).join('');
    gamesBody = `${gameCount} game${gameCount !== 1 ? 's' : ''} on the slate today. Here's what Maximus is tracking.<br/><br/><div style="margin-top:4px;">${sample}</div>`;
  } else {
    gamesBody = 'The schedule is light today. Maximus is staying disciplined — no forced action.';
  }

  // ── ATS Edge section
  const bestAts = atsLeaders.best || [];
  let atsBody = '';
  if (bestAts.length > 0) {
    const top = bestAts[0];
    const pct = top.pct != null ? `${Math.round(top.pct * 100)}%` : '';
    atsBody = `<strong style="color:#f0f4f8;">${top.name || top.team || 'A team'}</strong> ${pct ? `is covering at ${pct} ATS` : 'is your top ATS performer today'}. ${bestAts.length > 1 ? `${bestAts[1].name || bestAts[1].team} is also worth a look.` : ''}`;
  } else {
    atsBody = 'No major ATS edges detected today. Maximus is staying disciplined — patience is a strategy too.';
  }

  // ── Top 25 movement
  let rankBody = '';
  if (rankingsTop25.length > 0) {
    const top3 = rankingsTop25.slice(0, 3).map((r, i) => `#${i + 1} ${r.name || r.team || 'Unknown'}`).join(', ');
    rankBody = `Current top 3: ${top3}. The bubble is tightening as conference play heats up.`;
  } else {
    rankBody = 'Rankings data is refreshing. Check the app for the latest AP Top 25 movements.';
  }

  // ── Headlines
  let headlineItems = '';
  if (headlines.length > 0) {
    headlineItems = headlines.slice(0, 3).map(h => {
      const title = h.title || 'Breaking';
      const source = h.source || '';
      const link = h.link || 'https://maximussports.ai';
      return `<a href="${link}" style="display:block;color:#8892a4;font-size:12px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.04);text-decoration:none;line-height:1.4;" target="_blank">
        <span style="color:#c0cad8;">${title}</span>${source ? `<span style="color:#4a5568;"> &mdash; ${source}</span>` : ''}
      </a>`;
    }).join('');
  } else {
    headlineItems = '<span style="color:#4a5568;font-size:12px;">No major headlines at this hour.</span>';
  }

  const pinnedSection = pinnedLine ? sectionCard({
    pillLabel: 'YOUR TEAMS',
    pillType: 'watch',
    headline: pinnedLine,
    body: 'Open the app for full breakdowns, schedules, and live scores for your pinned teams.',
  }) : '';

  const content = `
${heroBlock({
    line: `Maximus Briefing${greetingName}: Here&rsquo;s your edge today.`,
    sublabel: today,
  })}

<tr>
  <td style="padding:0 32px 8px;" class="section-pad">
    <p style="margin:0;font-size:13px;color:#6b7f99;line-height:1.6;font-family:'DM Sans',Arial,sans-serif;">
      Good morning. Maximus has processed today&rsquo;s slate, lines, and trends. Here&rsquo;s what matters.
    </p>
  </td>
</tr>

${sectionCard({
    pillLabel: 'WHAT TO WATCH',
    pillType: 'watch',
    headline: `${gameCount > 0 ? `${gameCount} Games Today` : 'Light Slate'}`,
    body: gamesBody,
  })}

${sectionCard({
    pillLabel: 'ATS EDGE',
    pillType: 'ats',
    headline: 'Maximus ATS Radar',
    body: atsBody,
  })}

${sectionCard({
    pillLabel: 'RANKINGS',
    pillType: 'intel',
    headline: 'AP Top 25 Pulse',
    body: rankBody,
  })}

${pinnedSection}

<tr>
  <td style="padding:0 32px 16px;" class="section-pad">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
           style="background:#111827;border:1px solid rgba(255,255,255,0.07);border-radius:8px;overflow:hidden;">
      <tr>
        <td style="padding:16px 20px 14px;">
          <div style="margin-bottom:10px;">${pill('HEADLINES', 'headlines')}</div>
          ${headlineItems}
        </td>
      </tr>
    </table>
  </td>
</tr>`;

  return EmailShell({
    content,
    previewText: `Your Maximus edge for ${today}. ATS leaders, games, and intelligence — all in one read.`,
  });
}

export function renderText(data = {}) {
  const { displayName, scoresToday = [], atsLeaders = {}, headlines = [] } = data;
  const name = displayName ? displayName.split(' ')[0] : 'there';
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const lines = [
    `MAXIMUS SPORTS — Daily AI Briefing`,
    `${today}`,
    ``,
    `Good morning, ${name}. Here's your edge today.`,
    ``,
    `WHAT TO WATCH`,
    scoresToday.length > 0
      ? `${scoresToday.length} games on the slate today.`
      : 'Light slate today. Stay disciplined.',
    ``,
    `ATS EDGE`,
    atsLeaders.best?.length > 0
      ? `Top ATS performer: ${atsLeaders.best[0].name || atsLeaders.best[0].team}`
      : 'No major ATS edges detected today.',
    ``,
    `HEADLINES`,
    ...headlines.slice(0, 3).map(h => `- ${h.title || 'No title'}`),
    ``,
    `Open Maximus → https://maximussports.ai`,
    ``,
    `Not betting advice. Manage preferences: https://maximussports.ai/settings`,
  ];
  return lines.join('\n');
}
