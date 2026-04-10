/**
 * MLB Daily Briefing — premium editorial newsletter (polished light mode).
 *
 * Content: MLB-only from /api/mlb/* endpoints.
 * Narrative is cleaned to strip raw formatting, dedupe section labels,
 * and convert markdown bold to HTML.
 */

import { MlbEmailShell, mlbHeroBlock, mlbSectionHeader, mlbGlassCard, mlbParagraph, mlbDividerRow, cleanNarrativeText } from '../MlbEmailShell.js';
import { mlbBriefingSubject } from '../helpers/subjectGenerator.js';

export function getSubject(data = {}) {
  return mlbBriefingSubject(data);
}

/**
 * Parse the 5-paragraph AI narrative into clean editorial sections.
 * Strips inline headers, markdown, and normalizes spacing.
 */
function parseNarrativeSections(raw) {
  if (!raw) return [];
  return raw
    .split(/\n{2,}/)
    .map(p => cleanNarrativeText(p))
    .filter(p => p.length > 30);
}

export function renderHTML(data = {}) {
  const {
    displayName,
    headlines = [],
    scoresToday = [],
    narrativeParagraph = '',
  } = data;

  const firstName = displayName ? displayName.split(' ')[0] : null;
  const greetingName = firstName || 'there';
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const hour = new Date().getHours();
  const partOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';

  const sections = parseNarrativeSections(narrativeParagraph);
  const topHeadlines = headlines.slice(0, 5);
  const hasNarrative = sections.length > 0;

  // ── AROUND THE LEAGUE ─────────────────────────────────────────
  let aroundTheLeague = '';
  if (hasNarrative && sections[0]) {
    aroundTheLeague = `
${mlbSectionHeader('\u{1F525}', 'AROUND THE LEAGUE')}
${mlbParagraph(sections[0])}
${sections[1] ? mlbParagraph(sections[1]) : ''}`;
  } else if (topHeadlines.length > 0) {
    const rows = topHeadlines.map((h, i) => {
      const link = h.link || 'https://maximussports.ai/mlb';
      const source = h.source || '';
      const isTop = i === 0;
      return `<tr>
  <td style="padding:${isTop ? '8px 0 10px' : '8px 0'};border-bottom:1px solid #f3f4f6;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
      <tr>
        <td style="padding-right:12px;">
          <a href="${link}" style="font-size:${isTop ? '15px' : '14px'};font-weight:${isTop ? '700' : '600'};color:#111827;text-decoration:none;line-height:1.45;font-family:'DM Sans',Arial,sans-serif;display:block;" target="_blank">${h.title || 'No title'}</a>
          ${source ? `<span style="font-size:11px;color:#9ca3af;font-family:'DM Sans',Arial,sans-serif;">${source}</span>` : ''}
        </td>
        <td align="right" valign="top" style="white-space:nowrap;padding-top:2px;">
          <a href="${link}" style="font-size:11px;color:#c41e3a;text-decoration:none;font-weight:700;font-family:'DM Sans',Arial,sans-serif;" target="_blank">Read &rarr;</a>
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
      ${rows}
    </table>
  </td>
</tr>`;
  }

  // ── SCORES ────────────────────────────────────────────────────
  const finals = scoresToday.filter(g =>
    /final|postponed/i.test(g.status || g.gameStatus || '') ||
    (g.statusType || '') === 'STATUS_FINAL'
  );
  let scoreSection = '';
  if (finals.length > 0) {
    const scoreCards = finals.slice(0, 5).map(g => {
      const score = g.homeScore != null && g.awayScore != null
        ? `${g.awayScore} \u2013 ${g.homeScore}`
        : 'Final';
      return `<tr>
  <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
      <tr>
        <td style="font-size:13.5px;font-weight:600;color:#111827;font-family:'DM Sans',Arial,sans-serif;">
          ${g.awayTeam || 'Away'} <span style="color:#9ca3af;font-weight:400;">@</span> ${g.homeTeam || 'Home'}
        </td>
        <td align="right" style="font-size:14px;font-weight:700;color:#c41e3a;font-family:'DM Sans',Arial,sans-serif;white-space:nowrap;">
          ${score}
        </td>
      </tr>
    </table>
  </td>
</tr>`;
    }).join('');

    scoreSection = `
<tr>
  <td style="padding:0 24px 14px;" class="section-td">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
           style="border:1px solid #e5e7eb;border-radius:8px;border-collapse:collapse;overflow:hidden;background-color:#fafbfc;">
      <tr>
        <td style="padding:8px 12px;background-color:#f9fafb;border-bottom:1px solid #e5e7eb;">
          <span style="font-size:10px;font-weight:700;color:#c41e3a;letter-spacing:0.08em;text-transform:uppercase;font-family:'DM Sans',Arial,sans-serif;">FINAL SCORES</span>
        </td>
      </tr>
      ${scoreCards}
    </table>
    <div style="margin-top:8px;">
      <a href="https://maximussports.ai/mlb" style="font-size:12px;color:#c41e3a;text-decoration:none;font-weight:600;font-family:'DM Sans',Arial,sans-serif;">Full scoreboard &rarr;</a>
    </div>
  </td>
</tr>`;
  }

  // ── WORLD SERIES ODDS PULSE ───────────────────────────────────
  let oddsPulse = '';
  if (sections.length > 2) {
    oddsPulse = `
${mlbSectionHeader('\u{1F4B0}', 'WORLD SERIES ODDS PULSE')}
${mlbParagraph(sections[2])}`;
  }

  // ── PENNANT RACE WATCH ────────────────────────────────────────
  let pennantRace = '';
  if (sections.length > 3) {
    pennantRace = `
${mlbSectionHeader('\u{1F3C1}', 'PENNANT RACE WATCH')}
${mlbParagraph(sections[3])}`;
  }

  // ── SLEEPERS, INJURIES & VALUE ────────────────────────────────
  let sleepersSection = '';
  if (sections.length > 4) {
    sleepersSection = `
${mlbSectionHeader('\u{1F9E0}', 'SLEEPERS, INJURIES & VALUE')}
${mlbParagraph(sections[4])}`;
  }

  // ── DIAMOND DISPATCH (curated headline links) ─────────────────
  let diamondDispatch = '';
  if (topHeadlines.length > 0 && hasNarrative) {
    const links = topHeadlines.slice(0, 4).map(h => {
      const link = h.link || '#';
      const source = h.source || '';
      return `<tr>
  <td style="padding:9px 0;border-bottom:1px solid #f3f4f6;">
    <a href="${link}" style="font-size:13.5px;font-weight:600;color:#111827;text-decoration:none;line-height:1.45;font-family:'DM Sans',Arial,sans-serif;display:block;" target="_blank">${h.title}</a>
    ${source ? `<span style="font-size:10.5px;color:#9ca3af;font-family:'DM Sans',Arial,sans-serif;display:block;margin-top:2px;">${source}</span>` : ''}
  </td>
</tr>`;
    }).join('');

    diamondDispatch = `
${mlbSectionHeader('\u{26A1}', 'DIAMOND DISPATCH')}
<tr>
  <td style="padding:0 24px 14px;" class="section-td">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
      ${links}
    </table>
    <div style="margin-top:10px;">
      <a href="https://maximussports.ai/mlb/news" style="font-size:12px;color:#c41e3a;text-decoration:none;font-weight:600;font-family:'DM Sans',Arial,sans-serif;">All MLB news &rarr;</a>
    </div>
  </td>
</tr>`;
  }

  // ── HERO LINE ─────────────────────────────────────────────────
  const gameCount = scoresToday.length;
  let heroLine = 'Your daily MLB intelligence briefing.';
  if (gameCount > 0) {
    heroLine = `${gameCount} game${gameCount !== 1 ? 's' : ''} on the board \u2014 here\u2019s your daily edge.`;
  } else if (topHeadlines.length > 0) {
    heroLine = 'Today\u2019s biggest storylines and intel.';
  }

  const content = `
${mlbHeroBlock({ line: heroLine, sublabel: today })}

<tr>
  <td style="padding:8px 24px 16px;" class="intro-td">
    <p style="margin:0;font-size:15px;color:#4b5563;line-height:1.65;font-family:'DM Sans',Arial,Helvetica,sans-serif;">
      Good ${partOfDay}, ${greetingName}. Here\u2019s what\u2019s moving across the diamond.
    </p>
  </td>
</tr>

${mlbDividerRow()}

${aroundTheLeague}
${scoreSection}
${oddsPulse}
${pennantRace}
${sleepersSection}
${diamondDispatch}`;

  return MlbEmailShell({
    content,
    previewText: headlines.length > 0
      ? `\u26BE ${headlines[0].title || 'Today\u2019s MLB Daily Briefing.'}`
      : `\u26BE Today\u2019s MLB Daily Briefing from Maximus Sports.`,
  });
}

export function renderText(data = {}) {
  const { displayName, headlines = [], scoresToday = [], narrativeParagraph = '' } = data;
  const name = displayName ? displayName.split(' ')[0] : 'there';
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const lines = [
    '\u26BE MAXIMUS SPORTS \u2014 MLB Daily Briefing',
    today, '',
    `Good ${new Date().getHours() < 12 ? 'morning' : 'afternoon'}, ${name}. Here\u2019s what\u2019s moving across the diamond.`,
    '',
  ];
  if (narrativeParagraph) {
    lines.push(narrativeParagraph.replace(/\*\*/g, ''));
    lines.push('');
  }
  if (headlines.length > 0) {
    lines.push('\u{26A1} DIAMOND DISPATCH');
    lines.push(...headlines.slice(0, 5).map((h, i) => `${i + 1}. ${h.title || 'No title'}${h.source ? ` (${h.source})` : ''}`));
    lines.push('');
  }
  const finals = scoresToday.filter(g => /final/i.test(g.status || g.gameStatus || '')).slice(0, 5);
  if (finals.length > 0) {
    lines.push('SCORES');
    lines.push(...finals.map(g => `${g.awayTeam} ${g.awayScore ?? ''} @ ${g.homeTeam} ${g.homeScore ?? ''}`.trim()));
    lines.push('');
  }
  lines.push('Open MLB Intelligence -> https://maximussports.ai/mlb', '', 'Not betting advice. Manage preferences: https://maximussports.ai/settings');
  return lines.join('\n');
}
