/**
 * Breaking News Digest email template.
 * Sent once per day at 4:00 PM PST to subscribers with preferences.newsDigest = true.
 *
 * @param {object} data
 * @param {string} [data.displayName]
 * @param {Array}  [data.headlines]     — [{ id, title, link, pubDate, source }]
 * @param {Array}  [data.scoresToday]
 * @param {Array}  [data.pinnedTeams]
 * @param {Array}  [data.rankingsTop25]
 */

import { EmailShell, heroBlock, sectionCard, pill } from '../EmailShell.js';

export function getSubject(data = {}) {
  const { headlines = [] } = data;
  if (headlines.length > 0 && headlines[0].title) {
    const short = headlines[0].title.length > 55
      ? headlines[0].title.slice(0, 55) + '…'
      : headlines[0].title;
    return `Maximus News: ${short}`;
  }
  return 'Maximus: Breaking News Digest — Today\'s top stories';
}

export function renderHTML(data = {}) {
  const {
    displayName,
    headlines = [],
    scoresToday = [],
    pinnedTeams = [],
    rankingsTop25 = [],
  } = data;

  const firstName = displayName ? displayName.split(' ')[0] : null;
  const greetingName = firstName ? `, ${firstName}` : '';
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const hour = new Date().getHours();
  const partOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';

  // Main headlines
  const topHeadlines = headlines.slice(0, 6);
  let headlineRows = '';
  if (topHeadlines.length > 0) {
    headlineRows = topHeadlines.map((h, i) => {
      const link = h.link || 'https://maximussports.ai';
      const source = h.source || '';
      const pubDate = h.pubDate ? new Date(h.pubDate).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : '';
      const isTop = i === 0;
      return `<tr>
  <td style="padding:${isTop ? '14px 20px 12px' : '10px 20px'};border-bottom:1px solid rgba(255,255,255,0.05);">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
      <tr>
        <td>
          <a href="${link}" style="font-size:${isTop ? '14px' : '12.5px'};font-weight:${isTop ? '700' : '600'};color:${isTop ? '#f0f4f8' : '#c0cad8'};text-decoration:none;line-height:1.4;font-family:'DM Sans',Arial,sans-serif;" target="_blank">${h.title || 'No title'}</a>
          <div style="margin-top:4px;">
            ${source ? `<span style="font-size:10px;color:#4a5568;font-family:'DM Sans',Arial,sans-serif;">${source}</span>` : ''}
            ${pubDate ? `<span style="font-size:10px;color:#3d4f63;font-family:'DM Sans',Arial,sans-serif;"> &middot; ${pubDate}</span>` : ''}
          </div>
        </td>
        <td align="right" valign="top" style="padding-left:12px;">
          <a href="${link}" style="font-size:10px;color:#3C79B4;text-decoration:none;font-weight:600;white-space:nowrap;" target="_blank">Read →</a>
        </td>
      </tr>
    </table>
  </td>
</tr>`;
    }).join('');
  } else {
    headlineRows = `<tr><td style="padding:14px 20px;font-size:12px;color:#4a5568;font-family:'DM Sans',Arial,sans-serif;">No major headlines right now. The app has real-time news as it breaks.</td></tr>`;
  }

  // Score results from today
  const finishedGames = scoresToday.filter(g =>
    (g.status || '').toLowerCase().includes('final') ||
    (g.statusType || '') === 'STATUS_FINAL'
  );
  let scoreRows = '';
  if (finishedGames.length > 0) {
    scoreRows = finishedGames.slice(0, 4).map(g => {
      const score = g.homeScore != null && g.awayScore != null
        ? `${g.awayScore} – ${g.homeScore}`
        : 'Final';
      return `<span style="display:block;font-size:12px;color:#8892a4;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.04);font-family:'DM Sans',Arial,sans-serif;">
    <strong style="color:#c0cad8;">${g.awayTeam || 'Away'}</strong> vs <strong style="color:#c0cad8;">${g.homeTeam || 'Home'}</strong> &mdash; <span style="color:#3d9c74;">${score}</span>
  </span>`;
    }).join('');
  }

  // Pinned teams news
  const teamNames = pinnedTeams.map(t => (t.name || '').toLowerCase());
  const teamNews = headlines.filter(h =>
    teamNames.some(n => (h.title || '').toLowerCase().includes(n.split(' ').pop()))
  );

  const pinnedNewsSection = teamNews.length > 0 ? sectionCard({
    pillLabel: 'YOUR TEAMS',
    pillType: 'watch',
    headline: `${pinnedTeams[0]?.name || 'Your teams'} in the news`,
    body: teamNews.slice(0, 2).map(h =>
      `<a href="${h.link || '#'}" style="display:block;color:#8892a4;text-decoration:none;padding:3px 0;font-size:12px;" target="_blank"><span style="color:#c0cad8;">${h.title}</span></a>`
    ).join(''),
  }) : '';

  const content = `
${heroBlock({
    line: `Breaking${greetingName}: What you need to know before tonight.`,
    sublabel: today,
  })}

<tr>
  <td style="padding:0 32px 8px;" class="section-pad">
    <p style="margin:0;font-size:13px;color:#6b7f99;line-height:1.6;font-family:'DM Sans',Arial,sans-serif;">
      Good ${partOfDay}. Here&rsquo;s the news that moved the needle today.
    </p>
  </td>
</tr>

<tr>
  <td style="padding:0 32px 16px;" class="section-pad">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
           style="background:#111827;border:1px solid rgba(255,255,255,0.07);border-radius:8px;overflow:hidden;">
      <tr>
        <td style="padding:16px 20px 8px;">
          <div style="margin-bottom:2px;">${pill('HEADLINES', 'headlines')}</div>
        </td>
      </tr>
      ${headlineRows}
      <tr>
        <td style="padding:10px 20px 12px;">
          <a href="https://maximussports.ai/news" style="font-size:11px;color:#3C79B4;text-decoration:none;font-weight:600;">All news →</a>
        </td>
      </tr>
    </table>
  </td>
</tr>

${finishedGames.length > 0 ? `
<tr>
  <td style="padding:0 32px 16px;" class="section-pad">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
           style="background:#111827;border:1px solid rgba(255,255,255,0.07);border-radius:8px;overflow:hidden;">
      <tr>
        <td style="padding:16px 20px 10px;">
          <div style="margin-bottom:10px;">${pill('SCORES', 'intel')}</div>
          <p style="margin:0 0 10px;font-size:13px;font-weight:700;color:#f0f4f8;font-family:'DM Sans',Arial,sans-serif;">Final Scores</p>
          ${scoreRows}
        </td>
      </tr>
      <tr>
        <td style="padding:8px 20px 12px;">
          <a href="https://maximussports.ai" style="font-size:11px;color:#3C79B4;text-decoration:none;font-weight:600;">Full scoreboard →</a>
        </td>
      </tr>
    </table>
  </td>
</tr>` : ''}

${pinnedNewsSection}`;

  return EmailShell({
    content,
    previewText: headlines.length > 0
      ? `Breaking: ${headlines[0].title || 'Top stories from today in college hoops.'}`
      : `Today's breaking news digest from Maximus Sports.`,
  });
}

export function renderText(data = {}) {
  const { displayName, headlines = [], scoresToday = [] } = data;
  const name = displayName ? displayName.split(' ')[0] : 'there';
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const lines = [
    `MAXIMUS SPORTS — Breaking News Digest`,
    `${today}`,
    ``,
    `Hey ${name}, here's what you need to know.`,
    ``,
    `TOP HEADLINES`,
    ...headlines.slice(0, 5).map((h, i) => `${i + 1}. ${h.title || 'No title'}${h.source ? ` (${h.source})` : ''}`),
    ``,
    `SCORES`,
    scoresToday
      .filter(g => (g.status || '').toLowerCase().includes('final'))
      .slice(0, 4)
      .map(g => `${g.awayTeam} ${g.awayScore} @ ${g.homeTeam} ${g.homeScore}`)
      .join('\n') || 'No final scores yet.',
    ``,
    `Open Maximus → https://maximussports.ai`,
    ``,
    `Not betting advice. Manage preferences: https://maximussports.ai/settings`,
  ];
  return lines.join('\n');
}
