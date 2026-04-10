/**
 * MLB Daily Briefing — premium editorial newsletter.
 *
 * Mobile-first bullet format with consistent typography scale.
 * All text passes through: cleanNarrativeText → stripInlineEmoji → normalizeSpacing.
 * Content: MLB-only from /api/mlb/* endpoints.
 */

import {
  MlbEmailShell, mlbHeroBlock, mlbSectionHeader, mlbBulletSection,
  mlbDividerRow, cleanNarrativeText, narrativeToBullets,
  stripInlineEmoji, normalizeSpacing,
} from '../MlbEmailShell.js';
import { mlbBriefingSubject } from '../helpers/subjectGenerator.js';

const FONT = "'DM Sans',Arial,Helvetica,sans-serif";
const TEXT_BODY = '#1f2937';

export function getSubject(data = {}) {
  return mlbBriefingSubject(data);
}

function parseNarrativeToSections(raw) {
  if (!raw) return [];
  return raw
    .split(/\n{2,}/)
    .map(p => cleanNarrativeText(p))
    .filter(p => p.length > 30)
    .map(p => {
      const bullets = narrativeToBullets(p);
      const takeaway = bullets.length > 2 ? bullets.pop() : '';
      return { bullets, takeaway };
    });
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

  const sections = parseNarrativeToSections(narrativeParagraph);
  const topHeadlines = headlines.slice(0, 5);
  const hasNarrative = sections.length > 0;

  // ── AROUND THE LEAGUE ─────────────────────────────────────────
  let aroundTheLeague = '';
  if (hasNarrative && sections[0]) {
    const allBullets = [
      ...(sections[0]?.bullets || []),
      ...(sections[1]?.bullets || []),
    ];
    const takeaway = sections[1]?.takeaway || sections[0]?.takeaway || '';
    aroundTheLeague = `
${mlbSectionHeader('\u{1F525}', 'AROUND THE LEAGUE')}
${mlbBulletSection(allBullets.slice(0, 5), takeaway)}`;
  } else if (topHeadlines.length > 0) {
    const headlineHtml = topHeadlines.map(h => {
      const link = h.link || 'https://maximussports.ai/mlb';
      const source = h.source || '';
      const title = normalizeSpacing(stripInlineEmoji(h.title || 'No title'));
      return `<p style="margin:0 0 12px 0;font-size:16px;line-height:26px;color:${TEXT_BODY};font-family:${FONT};">&bull; <a href="${link}" style="color:#111827;text-decoration:none;font-weight:600;" target="_blank">${title}</a>${source ? `<br/><span style="font-size:12px;line-height:18px;color:#9ca3af;font-family:${FONT};">${source}</span>` : ''}</p>`;
    }).join('\n');

    aroundTheLeague = `
${mlbSectionHeader('\u{1F525}', 'AROUND THE LEAGUE')}
<tr>
  <td style="padding:0 28px 16px;" class="section-td">
    ${headlineHtml}
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
        ? `${g.awayScore} \u2013 ${g.homeScore}` : 'Final';
      return `<tr>
  <td style="padding:10px 14px;border-bottom:1px solid #f3f4f6;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
      <tr>
        <td style="font-size:14px;font-weight:600;line-height:20px;color:#111827;font-family:${FONT};">
          ${g.awayTeam || 'Away'} <span style="color:#9ca3af;font-weight:400;">@</span> ${g.homeTeam || 'Home'}
        </td>
        <td align="right" style="font-size:14px;font-weight:700;line-height:20px;color:#c41e3a;font-family:${FONT};white-space:nowrap;">
          ${score}
        </td>
      </tr>
    </table>
  </td>
</tr>`;
    }).join('');

    scoreSection = `
<tr>
  <td style="padding:0 28px 16px;" class="section-td">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
           style="border:1px solid #e5e7eb;border-radius:8px;border-collapse:collapse;overflow:hidden;">
      <tr>
        <td style="padding:10px 14px;background-color:#f9fafb;border-bottom:1px solid #e5e7eb;">
          <span style="font-size:11px;font-weight:700;line-height:14px;color:#c41e3a;letter-spacing:0.06em;text-transform:uppercase;font-family:${FONT};">FINAL SCORES</span>
        </td>
      </tr>
      ${scoreCards}
    </table>
    <div style="margin-top:10px;">
      <a href="https://maximussports.ai/mlb" style="font-size:13px;line-height:18px;color:#c41e3a;text-decoration:none;font-weight:600;font-family:${FONT};">Full scoreboard &rarr;</a>
    </div>
  </td>
</tr>`;
  }

  // ── WORLD SERIES ODDS PULSE ───────────────────────────────────
  let oddsPulse = '';
  if (sections.length > 2 && sections[2]?.bullets?.length > 0) {
    oddsPulse = `
${mlbSectionHeader('\u{1F4B0}', 'WORLD SERIES ODDS PULSE')}
${mlbBulletSection(sections[2].bullets, sections[2].takeaway)}`;
  }

  // ── PENNANT RACE WATCH ────────────────────────────────────────
  let pennantRace = '';
  if (sections.length > 3 && sections[3]?.bullets?.length > 0) {
    pennantRace = `
${mlbSectionHeader('\u{1F3C1}', 'PENNANT RACE WATCH')}
${mlbBulletSection(sections[3].bullets, sections[3].takeaway)}`;
  }

  // ── SLEEPERS, INJURIES & VALUE ────────────────────────────────
  let sleepersSection = '';
  if (sections.length > 4 && sections[4]?.bullets?.length > 0) {
    sleepersSection = `
${mlbSectionHeader('\u{1F9E0}', 'SLEEPERS, INJURIES & VALUE')}
${mlbBulletSection(sections[4].bullets, sections[4].takeaway)}`;
  }

  // ── DIAMOND DISPATCH ──────────────────────────────────────────
  let diamondDispatch = '';
  if (topHeadlines.length > 0 && hasNarrative) {
    const linksHtml = topHeadlines.slice(0, 4).map(h => {
      const link = h.link || '#';
      const source = h.source || '';
      const title = normalizeSpacing(stripInlineEmoji(h.title || ''));
      return `<p style="margin:0 0 12px 0;font-size:16px;line-height:26px;color:${TEXT_BODY};font-family:${FONT};">&bull; <a href="${link}" style="color:#111827;text-decoration:none;font-weight:600;" target="_blank">${title}</a>${source ? `<br/><span style="font-size:12px;line-height:18px;color:#9ca3af;font-family:${FONT};">${source}</span>` : ''}</p>`;
    }).join('\n');

    diamondDispatch = `
${mlbSectionHeader('\u{26A1}', 'DIAMOND DISPATCH')}
<tr>
  <td style="padding:0 28px 16px;" class="section-td">
    ${linksHtml}
    <p style="margin:4px 0 0;"><a href="https://maximussports.ai/mlb/news" style="font-size:13px;line-height:18px;color:#c41e3a;text-decoration:none;font-weight:600;font-family:${FONT};">All MLB news &rarr;</a></p>
  </td>
</tr>`;
  }

  // ── HERO ───────────────────────────────────────────────────────
  const heroLine = 'Your Daily MLB Intelligence \u2014 Key Storylines, Odds & Edges';

  const content = `
${mlbHeroBlock({ line: heroLine, sublabel: today })}

<tr>
  <td style="padding:6px 28px 20px;" class="intro-td">
    <p style="margin:0;font-size:16px;line-height:26px;color:#4b5563;font-family:${FONT};">
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
      ? `\u26BE ${stripInlineEmoji(headlines[0].title || 'Today\u2019s MLB Daily Briefing.')}`
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
    const plain = narrativeParagraph.replace(/\*\*/g, '');
    plain.split(/(?<=[.!?])\s+(?=[A-Z])/).filter(s => s.length > 15).forEach(s => lines.push(`\u2022 ${s}`));
    lines.push('');
  }
  if (headlines.length > 0) {
    lines.push('\u{26A1} DIAMOND DISPATCH');
    headlines.slice(0, 5).forEach(h => {
      lines.push(`\u2022 ${h.title || 'No title'}`);
      if (h.source) lines.push(`  (${h.source})`);
    });
    lines.push('');
  }
  const finals = scoresToday.filter(g => /final/i.test(g.status || g.gameStatus || '')).slice(0, 5);
  if (finals.length > 0) {
    lines.push('SCORES');
    finals.forEach(g => lines.push(`${g.awayTeam} ${g.awayScore ?? ''} @ ${g.homeTeam} ${g.homeScore ?? ''}`.trim()));
    lines.push('');
  }
  lines.push('Open MLB Intelligence -> https://maximussports.ai/mlb', '', 'Not betting advice. Manage preferences: https://maximussports.ai/settings');
  return lines.join('\n');
}
