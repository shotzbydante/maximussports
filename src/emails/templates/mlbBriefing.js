/**
 * MLB Daily Briefing — premium editorial newsletter (light mode).
 *
 * Content: MLB-only headlines, scores, narrative from /api/mlb/* endpoints.
 * Sections: AROUND THE LEAGUE, WORLD SERIES ODDS PULSE, PENNANT RACE WATCH,
 *           SLEEPERS INJURIES & VALUE, DIAMOND DISPATCH
 *
 * @param {object} data
 * @param {string} [data.displayName]
 * @param {Array}  [data.headlines]       — MLB-only headlines from /api/mlb/news/headlines
 * @param {Array}  [data.scoresToday]     — MLB scores from /api/mlb/live/homeFeed
 * @param {Array}  [data.pinnedTeams]
 * @param {Array}  [data.botIntelBullets] — extracted from /api/mlb/chat/homeSummary
 * @param {string} [data.narrativeParagraph] — full AI summary from /api/mlb/chat/homeSummary
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

  // ── AI NARRATIVE (from /api/mlb/chat/homeSummary) ─────────────
  // Split the narrative into editorial sections
  let narrativeSections = [];
  if (narrativeParagraph) {
    narrativeSections = narrativeParagraph
      .split(/\n{2,}|\u00b6\d+\s*/g)
      .map(p => p.replace(/^\u00b6\d+\s*/, '').trim())
      .filter(p => p.length > 30);
  }

  // ── AROUND THE LEAGUE ─────────────────────────────────────────
  let aroundTheLeague = '';
  if (narrativeSections.length > 0) {
    // Use the AI narrative for editorial content
    const editorialHtml = narrativeSections.slice(0, 2).map(p =>
      `<p style="margin:0 0 10px;font-size:14px;color:#4a5568;line-height:1.65;font-family:'DM Sans',Arial,sans-serif;">${p}</p>`
    ).join('');

    aroundTheLeague = `
${mlbSectionHeader('\u{1F525}', 'AROUND THE LEAGUE')}
<tr>
  <td style="padding:0 24px 14px;" class="section-td">
    ${editorialHtml}
  </td>
</tr>`;
  } else if (topHeadlines.length > 0) {
    // Fallback to headline links
    const headlineRows = topHeadlines.map((h, i) => {
      const link = h.link || 'https://maximussports.ai/mlb';
      const source = h.source || '';
      const isTop = i === 0;
      return `<tr>
  <td style="padding:${isTop ? '10px 0 10px' : '8px 0 8px'};border-bottom:1px solid #e8ecf0;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
      <tr>
        <td>
          <a href="${link}" style="font-size:${isTop ? '15px' : '14px'};font-weight:${isTop ? '700' : '600'};color:#1a1a2e;text-decoration:none;line-height:1.4;font-family:'DM Sans',Arial,sans-serif;display:block;" target="_blank">${h.title || 'No title'}</a>
          ${source ? `<div style="margin-top:3px;"><span style="font-size:11px;color:#8a94a6;font-family:'DM Sans',Arial,sans-serif;">${source}</span></div>` : ''}
        </td>
        <td align="right" valign="top" style="padding-left:12px;white-space:nowrap;">
          <a href="${link}" style="font-size:12px;color:#c41e3a;text-decoration:none;font-weight:600;display:inline-block;padding:2px 0;" target="_blank">Read &rarr;</a>
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
      <a href="https://maximussports.ai/mlb/news" style="font-size:12px;color:#c41e3a;text-decoration:none;font-weight:600;font-family:'DM Sans',Arial,sans-serif;">All MLB news &rarr;</a>
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
      return `<tr><td style="padding:6px 0;border-bottom:1px solid #e8ecf0;font-size:13px;color:#4a5568;font-family:'DM Sans',Arial,sans-serif;">
    <strong style="color:#1a1a2e;">${g.awayTeam || 'Away'}</strong> vs <strong style="color:#1a1a2e;">${g.homeTeam || 'Home'}</strong> &mdash; <span style="color:#c41e3a;font-weight:600;">${score}</span>
  </td></tr>`;
    }).join('');
    scoreSection = `
<tr>
  <td style="padding:0 24px 14px;" class="section-td">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
      ${scoreRows}
    </table>
    <div style="margin-top:8px;">
      <a href="https://maximussports.ai/mlb" style="font-size:12px;color:#c41e3a;text-decoration:none;font-weight:600;font-family:'DM Sans',Arial,sans-serif;">Full scoreboard &rarr;</a>
    </div>
  </td>
</tr>`;
  }

  // ── WORLD SERIES ODDS PULSE ───────────────────────────────────
  let oddsPulse = '';
  if (narrativeSections.length > 2) {
    oddsPulse = `
${mlbSectionHeader('\u{1F4B0}', 'WORLD SERIES ODDS PULSE')}
${mlbParagraph(narrativeSections[2])}`;
  }

  // ── PENNANT RACE WATCH ────────────────────────────────────────
  let pennantRace = '';
  if (narrativeSections.length > 3) {
    pennantRace = `
${mlbSectionHeader('\u{1F3C1}', 'PENNANT RACE WATCH')}
${mlbParagraph(narrativeSections[3])}`;
  }

  // ── SLEEPERS, INJURIES & VALUE ────────────────────────────────
  let sleepersSection = '';
  if (narrativeSections.length > 4) {
    sleepersSection = `
${mlbSectionHeader('\u{1F9E0}', 'SLEEPERS, INJURIES & VALUE')}
${mlbParagraph(narrativeSections[4])}`;
  }

  // ── DIAMOND DISPATCH ──────────────────────────────────────────
  // Headlines list for extra context
  let diamondDispatch = '';
  if (topHeadlines.length > 0 && narrativeSections.length > 0) {
    const headlineLinks = topHeadlines.slice(0, 4).map(h =>
      `<tr><td style="padding:6px 0;border-bottom:1px solid #e8ecf0;">
        <a href="${h.link || '#'}" style="font-size:13px;color:#1a1a2e;text-decoration:none;line-height:1.4;font-family:'DM Sans',Arial,sans-serif;" target="_blank">${h.title}</a>
        ${h.source ? `<span style="font-size:11px;color:#8a94a6;"> \u2014 ${h.source}</span>` : ''}
      </td></tr>`
    ).join('');

    diamondDispatch = `
${mlbSectionHeader('\u{26A1}', 'DIAMOND DISPATCH')}
<tr>
  <td style="padding:0 24px 14px;" class="section-td">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
      ${headlineLinks}
    </table>
    <div style="margin-top:8px;">
      <a href="https://maximussports.ai/mlb/news" style="font-size:12px;color:#c41e3a;text-decoration:none;font-weight:600;font-family:'DM Sans',Arial,sans-serif;">All MLB news &rarr;</a>
    </div>
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
    <p style="margin:0;font-size:15px;color:#4a5568;line-height:1.65;font-family:'DM Sans',Arial,Helvetica,sans-serif;">
      Good ${partOfDay}, ${greetingName}. Here\u2019s what\u2019s moving the needle across the diamond.
    </p>
  </td>
</tr>

<tr>
  <td style="padding:0 24px;" class="divider-td">
    <div style="height:1px;background-color:#e8ecf0;font-size:0;line-height:0;">&nbsp;</div>
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
  const { displayName, headlines = [], scoresToday = [], narrativeParagraph = '' } = data;
  const name = displayName ? displayName.split(' ')[0] : 'there';
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const lines = [
    '\u26BE MAXIMUS SPORTS \u2014 MLB Daily Briefing',
    today,
    '',
    `Good ${new Date().getHours() < 12 ? 'morning' : 'afternoon'}, ${name}. Here\u2019s what\u2019s moving the needle.`,
    '',
  ];

  if (narrativeParagraph) {
    lines.push(narrativeParagraph);
    lines.push('');
  }

  if (headlines.length > 0) {
    lines.push('\u{26A1} DIAMOND DISPATCH');
    lines.push(...headlines.slice(0, 5).map((h, i) => `${i + 1}. ${h.title || 'No title'}${h.source ? ` (${h.source})` : ''}`));
    lines.push('');
  }

  lines.push('SCORES');
  const finals = scoresToday
    .filter(g => /final/i.test(g.status || g.gameStatus || ''))
    .slice(0, 5);
  lines.push(finals.length > 0
    ? finals.map(g => `${g.awayTeam} ${g.awayScore ?? ''} @ ${g.homeTeam} ${g.homeScore ?? ''}`.trim()).join('\n')
    : 'No final scores yet.');
  lines.push('');
  lines.push('Open MLB Intelligence -> https://maximussports.ai/mlb');
  lines.push('');
  lines.push('Not betting advice. Manage preferences: https://maximussports.ai/settings');

  return lines.join('\n');
}
