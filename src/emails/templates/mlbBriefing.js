/**
 * MLB Daily Briefing — premium editorial newsletter.
 *
 * Design: dark navy + deep red, glassmorphism cards, editorial sections.
 * Sections: AROUND THE LEAGUE, WORLD SERIES ODDS PULSE, PENNANT RACE WATCH,
 *           SLEEPERS INJURIES & VALUE, DIAMOND DISPATCH
 *
 * @param {object} data
 * @param {string} [data.displayName]
 * @param {Array}  [data.headlines]
 * @param {Array}  [data.scoresToday]
 * @param {Array}  [data.pinnedTeams]
 * @param {Array}  [data.botIntelBullets]
 * @param {string} [data.narrativeParagraph]
 */

import { MlbEmailShell, mlbHeroBlock, mlbSectionHeader, mlbGlassCard, mlbParagraph, mlbDividerRow } from '../MlbEmailShell.js';
import { mlbBriefingSubject } from '../helpers/subjectGenerator.js';

export function getSubject(data = {}) {
  return mlbBriefingSubject(data);
}

export function renderHTML(data = {}) {
  const {
    displayName,
    headlines = [],
    scoresToday = [],
    pinnedTeams = [],
    botIntelBullets = [],
    narrativeParagraph = '',
  } = data;

  const firstName = displayName ? displayName.split(' ')[0] : null;
  const greetingName = firstName || 'there';
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const hour = new Date().getHours();
  const partOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';

  const topHeadlines = headlines.slice(0, 6);

  // ── AROUND THE LEAGUE ─────────────────────────────────────────
  let aroundTheLeague = '';
  if (topHeadlines.length > 0) {
    const headlineRows = topHeadlines.map((h, i) => {
      const link = h.link || 'https://maximussports.ai/mlb';
      const source = h.source || '';
      const isTop = i === 0;
      return `<tr>
  <td style="padding:${isTop ? '10px 0 10px' : '8px 0 8px'};border-bottom:1px solid #1e293b;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
      <tr>
        <td>
          <a href="${link}" style="font-size:${isTop ? '15px' : '14px'};font-weight:${isTop ? '700' : '600'};color:#f0f4f8;text-decoration:none;line-height:1.4;font-family:'DM Sans',Arial,sans-serif;display:block;" target="_blank">${h.title || 'No title'}</a>
          ${source ? `<div style="margin-top:3px;"><span style="font-size:11px;color:#64748b;font-family:'DM Sans',Arial,sans-serif;">${source}</span></div>` : ''}
        </td>
        <td align="right" valign="top" style="padding-left:12px;white-space:nowrap;">
          <a href="${link}" style="font-size:12px;color:#e8364f;text-decoration:none;font-weight:600;display:inline-block;padding:2px 0;" target="_blank">Read &rarr;</a>
        </td>
      </tr>
    </table>
  </td>
</tr>`;
    }).join('');

    aroundTheLeague = `
${mlbSectionHeader('\u{1F525}', 'AROUND THE LEAGUE')}
<tr>
  <td style="padding:0 24px 14px;" class="section-td">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
      ${headlineRows}
    </table>
    <div style="margin-top:10px;">
      <a href="https://maximussports.ai/mlb/news" style="font-size:12px;color:#e8364f;text-decoration:none;font-weight:600;font-family:'DM Sans',Arial,sans-serif;">All MLB news &rarr;</a>
    </div>
  </td>
</tr>`;
  }

  // ── SCORES ────────────────────────────────────────────────────
  const finishedGames = scoresToday.filter(g =>
    /final|postponed/i.test(g.status || g.gameStatus || '') ||
    (g.statusType || '') === 'STATUS_FINAL'
  );
  let scoreSection = '';
  if (finishedGames.length > 0) {
    const scoreRows = finishedGames.slice(0, 5).map(g => {
      const score = g.homeScore != null && g.awayScore != null
        ? `${g.awayScore} \u2013 ${g.homeScore}`
        : 'Final';
      return `<tr><td style="padding:6px 0;border-bottom:1px solid #1e293b;font-size:13px;color:#94a3b8;font-family:'DM Sans',Arial,sans-serif;">
    <strong style="color:#f0f4f8;">${g.awayTeam || 'Away'}</strong> vs <strong style="color:#f0f4f8;">${g.homeTeam || 'Home'}</strong> &mdash; <span style="color:#e8364f;font-weight:600;">${score}</span>
  </td></tr>`;
    }).join('');
    scoreSection = `
<tr>
  <td style="padding:0 24px 14px;" class="section-td">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
      ${scoreRows}
    </table>
    <div style="margin-top:8px;">
      <a href="https://maximussports.ai/mlb" style="font-size:12px;color:#e8364f;text-decoration:none;font-weight:600;font-family:'DM Sans',Arial,sans-serif;">Full scoreboard &rarr;</a>
    </div>
  </td>
</tr>`;
  }

  // ── WORLD SERIES ODDS PULSE ───────────────────────────────────
  // Bot intel bullets serve as the odds/intel content
  let oddsPulse = '';
  if (botIntelBullets.length > 0) {
    const bulletHtml = botIntelBullets.slice(0, 2).map(b =>
      `<p style="margin:0 0 8px;font-size:14px;color:#94a3b8;line-height:1.6;font-family:'DM Sans',Arial,sans-serif;">${b}</p>`
    ).join('');

    oddsPulse = `
${mlbSectionHeader('\u{1F4B0}', 'WORLD SERIES ODDS PULSE')}
<tr>
  <td style="padding:0 24px 14px;" class="section-td">
    ${bulletHtml}
  </td>
</tr>`;
  }

  // ── PENNANT RACE WATCH ────────────────────────────────────────
  // Use narrative paragraph if available
  let pennantRace = '';
  if (narrativeParagraph) {
    pennantRace = `
${mlbSectionHeader('\u{1F3C1}', 'PENNANT RACE WATCH')}
${mlbParagraph(narrativeParagraph)}`;
  }

  // ── SLEEPERS, INJURIES & VALUE ────────────────────────────────
  // Pinned teams intel
  let sleepersSection = '';
  const teamKeywords = pinnedTeams.flatMap(t => {
    const words = (t.name || '').split(' ');
    return [t.name?.toLowerCase(), words[0]?.toLowerCase(), words[words.length - 1]?.toLowerCase()].filter(Boolean);
  });
  const teamNews = headlines.filter(h =>
    teamKeywords.some(kw => (h.title || '').toLowerCase().includes(kw))
  );

  if (teamNews.length > 0 || pinnedTeams.length > 0) {
    let teamBody = '';
    if (teamNews.length > 0) {
      teamBody = teamNews.slice(0, 2).map(h =>
        `<p style="margin:0 0 6px;font-size:14px;color:#94a3b8;line-height:1.5;font-family:'DM Sans',Arial,sans-serif;">&bull; <a href="${h.link || '#'}" style="color:#f0f4f8;text-decoration:none;font-weight:600;" target="_blank">${h.title}</a></p>`
      ).join('');
    } else if (pinnedTeams.length > 0) {
      const names = pinnedTeams.slice(0, 3).map(t => t.name).join(', ');
      teamBody = `<p style="margin:0;font-size:14px;color:#94a3b8;line-height:1.5;font-family:'DM Sans',Arial,sans-serif;">No major injury or roster news for ${names} today. Check the app for real-time alerts.</p>`;
    }

    sleepersSection = `
${mlbSectionHeader('\u{1F9E0}', 'SLEEPERS, INJURIES & VALUE')}
<tr>
  <td style="padding:0 24px 14px;" class="section-td">
    ${teamBody}
  </td>
</tr>`;
  }

  // ── DIAMOND DISPATCH ──────────────────────────────────────────
  // Extra intel bullets
  let diamondDispatch = '';
  if (botIntelBullets.length > 2) {
    const extraBullets = botIntelBullets.slice(2).map(b =>
      `<p style="margin:0 0 6px;font-size:13px;color:#94a3b8;line-height:1.55;font-family:'DM Sans',Arial,sans-serif;">&bull; ${b}</p>`
    ).join('');
    diamondDispatch = `
${mlbSectionHeader('\u{26A1}', 'DIAMOND DISPATCH')}
<tr>
  <td style="padding:0 24px 14px;" class="section-td">
    ${extraBullets}
  </td>
</tr>`;
  }

  const content = `
${mlbHeroBlock({
    line: `Your MLB intelligence briefing is ready.`,
    sublabel: today,
  })}

<tr>
  <td style="padding:10px 24px 16px;" class="intro-td">
    <p style="margin:0;font-size:15px;color:#94a3b8;line-height:1.65;font-family:'DM Sans',Arial,Helvetica,sans-serif;">
      Good ${partOfDay}, ${greetingName}. Here\u2019s what\u2019s moving the needle across the diamond.
    </p>
  </td>
</tr>

<tr>
  <td style="padding:0 24px;" class="divider-td">
    <div style="height:1px;background-color:#1e293b;font-size:0;line-height:0;">&nbsp;</div>
  </td>
</tr>

${aroundTheLeague}
${scoreSection ? `${mlbDividerRow()}\n${scoreSection}` : ''}
${oddsPulse}
${pennantRace}
${sleepersSection}
${diamondDispatch}`;

  return MlbEmailShell({
    content,
    previewText: headlines.length > 0
      ? `\u26BE ${headlines[0].title || 'Today in MLB \u2014 your daily briefing.'}`
      : `\u26BE Today\u2019s MLB Daily Briefing from Maximus Sports.`,
  });
}

export function renderText(data = {}) {
  const { displayName, headlines = [], scoresToday = [], botIntelBullets = [] } = data;
  const name = displayName ? displayName.split(' ')[0] : 'there';
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const lines = [
    '\u26BE MAXIMUS SPORTS \u2014 MLB Daily Briefing',
    today,
    '',
    `Good ${new Date().getHours() < 12 ? 'morning' : 'afternoon'}, ${name}. Here\u2019s what\u2019s moving the needle.`,
    '',
    '\u{1F525} AROUND THE LEAGUE',
    ...headlines.slice(0, 5).map((h, i) => `${i + 1}. ${h.title || 'No title'}${h.source ? ` (${h.source})` : ''}`),
    '',
    '\u{1F4B0} WORLD SERIES ODDS PULSE',
    ...botIntelBullets.slice(0, 2),
    '',
    'SCORES',
    scoresToday
      .filter(g => /final/i.test(g.status || g.gameStatus || ''))
      .slice(0, 5)
      .map(g => `${g.awayTeam} ${g.awayScore ?? ''} @ ${g.homeTeam} ${g.homeScore ?? ''}`.trim())
      .join('\n') || 'No final scores yet.',
    '',
    'Open MLB Intelligence -> https://maximussports.ai/mlb',
    '',
    'Not betting advice. Manage preferences: https://maximussports.ai/settings',
  ];
  return lines.join('\n');
}
