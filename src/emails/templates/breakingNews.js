/**
 * Breaking News Digest — editorial newsletter template.
 * Sent at 9:30 AM PT. Clean, headline-first, mobile-optimized.
 *
 * @param {object} data
 * @param {string} [data.displayName]
 * @param {Array}  [data.headlines]
 * @param {Array}  [data.scoresToday]
 * @param {Array}  [data.pinnedTeams]    — [{ name, slug }]
 */

import { EmailShell, heroBlock, sectionLabel, teamLogoImg } from '../EmailShell.js';
import { plainTextSubject, truncate } from '../../../api/_lib/text.js';

export function getSubject(data = {}) {
  const name = data.displayName ? data.displayName.split(' ')[0] : null;
  const { headlines = [] } = data;
  if (headlines.length > 0 && headlines[0].title) {
    const clean = plainTextSubject(headlines[0].title);
    const short = truncate(clean, 50);
    if (name) return `${name}: ${short}`;
    return short;
  }
  if (name) return `${name}, today\u2019s top stories`;
  return 'Today\u2019s top stories';
}

export function renderHTML(data = {}) {
  const {
    displayName,
    headlines = [],
    scoresToday = [],
    pinnedTeams = [],
  } = data;

  const firstName = displayName ? displayName.split(' ')[0] : null;
  const greetingName = firstName || 'there';
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
      const pubDate = h.pubDate
        ? new Date(h.pubDate).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
        : '';
      const isTop = i === 0;
      return `<tr>
  <td style="padding:${isTop ? '10px 0 10px' : '8px 0 8px'};border-bottom:1px solid #e8ecf0;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
      <tr>
        <td>
          <a href="${link}" style="font-size:${isTop ? '15px' : '14px'};font-weight:${isTop ? '700' : '600'};color:#1a1a2e;text-decoration:none;line-height:1.4;font-family:'DM Sans',Arial,sans-serif;display:block;" target="_blank">${h.title || 'No title'}</a>
          <div style="margin-top:3px;">
            ${source ? `<span style="font-size:11px;color:#8a94a6;font-family:'DM Sans',Arial,sans-serif;">${source}</span>` : ''}
            ${pubDate ? `<span style="font-size:11px;color:#b0b8c4;font-family:'DM Sans',Arial,sans-serif;"> &middot; ${pubDate}</span>` : ''}
          </div>
        </td>
        <td align="right" valign="top" style="padding-left:12px;white-space:nowrap;">
          <a href="${link}" style="font-size:12px;color:#2d6ca8;text-decoration:none;font-weight:600;display:inline-block;padding:2px 0;" target="_blank">Read &rarr;</a>
        </td>
      </tr>
    </table>
  </td>
</tr>`;
    }).join('');
  } else {
    headlineRows = `<tr><td style="padding:10px 0;font-size:14px;color:#8a94a6;font-family:'DM Sans',Arial,sans-serif;">No major headlines right now. The app has real-time news as it breaks.</td></tr>`;
  }

  // Scores
  const finishedGames = scoresToday.filter(g =>
    /final|postponed/i.test(g.status || g.gameStatus || '') ||
    (g.statusType || '') === 'STATUS_FINAL'
  );
  let scoreSection = '';
  if (finishedGames.length > 0) {
    const scoreRows = finishedGames.slice(0, 4).map(g => {
      const score = g.homeScore != null && g.awayScore != null
        ? `${g.awayScore} \u2013 ${g.homeScore}`
        : 'Final';
      return `<tr><td style="padding:5px 0;border-bottom:1px solid #e8ecf0;font-size:13px;color:#4a5568;font-family:'DM Sans',Arial,sans-serif;">
    <strong style="color:#1a1a2e;">${g.awayTeam || 'Away'}</strong> vs <strong style="color:#1a1a2e;">${g.homeTeam || 'Home'}</strong> &mdash; <span style="color:#2d6ca8;font-weight:600;">${score}</span>
  </td></tr>`;
    }).join('');
    scoreSection = `
<tr>
  <td style="padding:0 24px 14px;" class="section-td">
    <div style="margin-bottom:8px;">${sectionLabel('FINAL SCORES')}</div>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
      ${scoreRows}
    </table>
    <div style="margin-top:8px;">
      <a href="https://maximussports.ai" style="font-size:12px;color:#2d6ca8;text-decoration:none;font-weight:600;font-family:'DM Sans',Arial,sans-serif;">Full scoreboard &rarr;</a>
    </div>
  </td>
</tr>`;
  }

  // Pinned teams news
  const teamKeywords = pinnedTeams.flatMap(t => {
    const words = (t.name || '').split(' ');
    return [t.name?.toLowerCase(), words[0]?.toLowerCase(), words[words.length - 1]?.toLowerCase()].filter(Boolean);
  });
  const teamNews = headlines.filter(h =>
    teamKeywords.some(kw => (h.title || '').toLowerCase().includes(kw))
  );

  let pinnedNewsSection = '';
  if (teamNews.length > 0 && pinnedTeams.length > 0) {
    const firstTeam = pinnedTeams.find(t => {
      const words = (t.name || '').split(' ');
      const kws = [t.name?.toLowerCase(), words[0]?.toLowerCase(), words[words.length - 1]?.toLowerCase()].filter(Boolean);
      return kws.some(kw => (teamNews[0]?.title || '').toLowerCase().includes(kw));
    }) || pinnedTeams[0];

    const newsLinks = teamNews.slice(0, 2).map(h =>
      `<tr><td style="padding:6px 0;border-bottom:1px solid #e8ecf0;">
        <a href="${h.link || '#'}" style="font-size:13px;color:#1a1a2e;text-decoration:none;line-height:1.4;font-family:'DM Sans',Arial,sans-serif;" target="_blank">${h.title}</a>
      </td></tr>`
    ).join('');

    const logoHtml = teamLogoImg(firstTeam, 20);
    pinnedNewsSection = `
<tr>
  <td style="padding:0 24px 14px;" class="section-td">
    <div style="margin-bottom:8px;">${sectionLabel('YOUR TEAMS')}</div>
    <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:8px;">
      <tr>
        <td style="padding-right:8px;vertical-align:middle;">${logoHtml}</td>
        <td valign="middle" style="font-size:14px;font-weight:700;color:#1a1a2e;font-family:'DM Sans',Arial,sans-serif;">${firstTeam.name || 'Your teams'} in the news</td>
      </tr>
    </table>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
      ${newsLinks}
    </table>
  </td>
</tr>`;
  }

  const content = `
${heroBlock({
    line: `What you need to know before tonight.`,
    sublabel: today,
  })}

<tr>
  <td style="padding:10px 24px 16px;" class="intro-td">
    <p style="margin:0;font-size:15px;color:#4a5568;line-height:1.65;font-family:'DM Sans',Arial,Helvetica,sans-serif;">
      Good ${partOfDay}, ${greetingName}. Here\u2019s the news that moved the needle today.
    </p>
  </td>
</tr>

<tr>
  <td style="padding:0 24px;" class="divider-td">
    <div style="height:1px;background-color:#e8ecf0;font-size:0;line-height:0;">&nbsp;</div>
  </td>
</tr>
<tr><td style="height:14px;font-size:0;line-height:0;">&nbsp;</td></tr>

<tr>
  <td style="padding:0 24px 14px;" class="section-td">
    <div style="margin-bottom:8px;">${sectionLabel('TOP STORIES')}</div>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
      ${headlineRows}
    </table>
    <div style="margin-top:10px;">
      <a href="https://maximussports.ai/news" style="font-size:12px;color:#2d6ca8;text-decoration:none;font-weight:600;font-family:'DM Sans',Arial,sans-serif;">All news &rarr;</a>
    </div>
  </td>
</tr>

${scoreSection}

${pinnedNewsSection}`;

  return EmailShell({
    content,
    previewText: headlines.length > 0
      ? `${headlines[0].title || 'Top stories from today in college basketball.'}`
      : `Today\u2019s news digest from Maximus Sports.`,
  });
}

export function renderText(data = {}) {
  const { displayName, headlines = [], scoresToday = [] } = data;
  const name = displayName ? displayName.split(' ')[0] : 'there';
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const lines = [
    'MAXIMUS SPORTS \u2014 News Digest',
    today,
    '',
    `Hey ${name}, here\u2019s what you need to know.`,
    '',
    'TOP HEADLINES',
    ...headlines.slice(0, 5).map((h, i) => `${i + 1}. ${h.title || 'No title'}${h.source ? ` (${h.source})` : ''}`),
    '',
    'SCORES',
    scoresToday
      .filter(g => /final/i.test(g.status || g.gameStatus || ''))
      .slice(0, 4)
      .map(g => `${g.awayTeam} ${g.awayScore ?? ''} @ ${g.homeTeam} ${g.homeScore ?? ''}`.trim())
      .join('\n') || 'No final scores yet.',
    '',
    'Open Maximus Sports -> https://maximussports.ai',
    '',
    'Not betting advice. Manage preferences: https://maximussports.ai/settings',
  ];
  return lines.join('\n');
}
