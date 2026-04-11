/**
 * Global Daily Briefing — multi-sport editorial digest.
 *
 * Structure:
 *   1. NCAAM championship/headline recap (short lead item)
 *   2. MLB daily briefing section (rich, mirrors IG slides 1-3)
 *
 * Uses the standard EmailShell (not MlbEmailShell) for global branding.
 *
 * @param {object} data
 * @param {string} [data.displayName]
 * @param {Array}  [data.headlines]          — NCAAM headlines
 * @param {Array}  [data.scoresToday]        — NCAAM scores
 * @param {object} [data.mlbData]            — from assembleMlbEmailData
 */

import { EmailShell, heroBlock, sectionLabel, sectionCard } from '../EmailShell.js';
import { stripInlineEmoji, normalizeSpacing, cleanNarrativeText } from '../MlbEmailShell.js';

const F = "'DM Sans',Arial,Helvetica,sans-serif";

export function getSubject(data = {}) {
  const mlbHeadline = data.mlbData?.headlines?.[0]?.title;
  const ncaamHeadline = data.headlines?.[0]?.title;
  const hook = mlbHeadline ? stripInlineEmoji(mlbHeadline).slice(0, 40) : (ncaamHeadline ? stripInlineEmoji(ncaamHeadline).slice(0, 40) : '');
  if (hook) return `\u{1F4E1} Daily Global Intel Briefing \u2014 ${hook}`;
  return `\u{1F4E1} Daily Global Intel Briefing`;
}

export function renderHTML(data = {}) {
  const {
    displayName,
    headlines = [],
    scoresToday = [],
    mlbData,
  } = data;

  const firstName = displayName ? displayName.split(' ')[0] : null;
  const greetingName = firstName || 'there';
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const hour = new Date().getHours();
  const partOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';

  const mlbHeadlines = mlbData?.headlines || [];
  const mlbNarrative = mlbData?.narrativeParagraph || '';

  // ── NCAAM SECTION ──────────────────────────────────────────
  let ncaamSection = '';
  const ncaamHeadlines = headlines.slice(0, 3);
  const ncaamFinals = scoresToday.filter(g =>
    /final/i.test(g.status || g.gameStatus || '')
  ).slice(0, 3);

  if (ncaamHeadlines.length > 0 || ncaamFinals.length > 0) {
    let ncaamBody = '';

    if (ncaamFinals.length > 0) {
      const scoreLines = ncaamFinals.map(g => {
        const score = g.homeScore != null && g.awayScore != null
          ? `${g.awayScore} \u2013 ${g.homeScore}` : 'Final';
        return `<p style="margin:0 0 6px;font-size:14px;line-height:22px;color:#4b5563;font-family:${F};"><strong style="color:#1a1a2e;">${g.awayTeam}</strong> vs <strong style="color:#1a1a2e;">${g.homeTeam}</strong> \u2014 <span style="color:#2d6ca8;font-weight:600;">${score}</span></p>`;
      }).join('');
      ncaamBody += scoreLines;
    }

    if (ncaamHeadlines.length > 0) {
      const headlineLines = ncaamHeadlines.map(h => {
        const title = normalizeSpacing(stripInlineEmoji(h.title || ''));
        const link = h.link || 'https://maximussports.ai/ncaam';
        return `<p style="margin:0 0 6px;font-size:14px;line-height:22px;color:#4b5563;font-family:${F};">&bull; <a href="${link}" style="color:#1a1a2e;text-decoration:none;font-weight:600;" target="_blank">${title}</a></p>`;
      }).join('');
      ncaamBody += headlineLines;
    }

    ncaamSection = `
<tr>
  <td style="padding:18px 24px 8px;">
    <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      <tr>
        <td style="background:rgba(56,133,224,0.08);border:1px solid rgba(56,133,224,0.15);border-radius:4px;padding:4px 10px;">
          <span style="font-size:12px;font-weight:700;color:#2d6ca8;letter-spacing:0.06em;text-transform:uppercase;font-family:${F};">\u{1F3C0} NCAAM</span>
        </td>
      </tr>
    </table>
  </td>
</tr>
<tr>
  <td style="padding:6px 24px 16px;">
    ${ncaamBody}
    <p style="margin:6px 0 0;"><a href="https://maximussports.ai/ncaam" style="font-size:12px;color:#2d6ca8;text-decoration:none;font-weight:600;font-family:${F};">Full NCAAM intel &rarr;</a></p>
  </td>
</tr>

<tr>
  <td style="padding:0 24px;">
    <div style="height:1px;background-color:#e5e7eb;font-size:0;line-height:0;">&nbsp;</div>
  </td>
</tr>`;
  }

  // ── MLB SECTION ────────────────────────────────────────────
  let mlbSection = '';

  // Parse MLB narrative into editorial bullets
  let mlbBullets = [];
  if (mlbNarrative) {
    const paragraphs = mlbNarrative.split(/\n{2,}/).map(p => cleanNarrativeText(p)).filter(p => p.length > 30);
    // Split paragraphs into sentences for bullet format
    for (const p of paragraphs.slice(0, 3)) {
      const sentences = p.replace(/<[^>]+>/g, '').split(/(?<=[.!?])\s+(?=[A-Z])/).filter(s => s.length > 15);
      mlbBullets.push(...sentences);
    }
    mlbBullets = mlbBullets.slice(0, 6);
  }

  // MLB headlines as fallback/supplement
  const mlbHeadlineLinks = mlbHeadlines.slice(0, 4).map(h => {
    const title = normalizeSpacing(stripInlineEmoji(h.title || ''));
    const link = h.link || 'https://maximussports.ai/mlb';
    const source = h.source || '';
    return `<p style="margin:0 0 8px;font-size:14px;line-height:22px;color:#1f2937;font-family:${F};">&bull; <a href="${link}" style="color:#1a1a2e;text-decoration:none;font-weight:600;" target="_blank">${title}</a>${source ? `<br/><span style="font-size:11px;color:#9ca3af;">${source}</span>` : ''}</p>`;
  }).join('');

  if (mlbBullets.length > 0 || mlbHeadlineLinks) {
    const bulletHtml = mlbBullets.map(b =>
      `<p style="margin:0 0 8px;font-size:14px;line-height:22px;color:#4b5563;font-family:${F};">&bull; ${normalizeSpacing(stripInlineEmoji(b))}</p>`
    ).join('');

    mlbSection = `
<tr>
  <td style="padding:18px 24px 8px;">
    <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      <tr>
        <td style="background:rgba(196,30,58,0.06);border:1px solid rgba(196,30,58,0.15);border-radius:4px;padding:4px 10px;">
          <span style="font-size:12px;font-weight:700;color:#c41e3a;letter-spacing:0.06em;text-transform:uppercase;font-family:${F};">\u26BE MLB DAILY BRIEFING</span>
        </td>
      </tr>
    </table>
  </td>
</tr>
<tr>
  <td style="padding:6px 24px 14px;">
    ${bulletHtml || ''}
    ${mlbBullets.length > 0 && mlbHeadlineLinks ? `
    <p style="margin:12px 0 8px;font-size:11px;font-weight:700;color:#c41e3a;letter-spacing:0.06em;text-transform:uppercase;font-family:${F};">HEADLINES</p>` : ''}
    ${mlbHeadlineLinks}
    <p style="margin:6px 0 0;"><a href="https://maximussports.ai/mlb" style="font-size:12px;color:#c41e3a;text-decoration:none;font-weight:600;font-family:${F};">Full MLB intelligence &rarr;</a></p>
  </td>
</tr>`;
  }

  const content = `
${heroBlock({
    line: 'Your daily cross-sport read on the biggest signals across Maximus Sports.',
    sublabel: today,
  })}

<tr>
  <td style="padding:8px 24px 16px;">
    <p style="margin:0;font-size:15px;color:#4b5563;line-height:1.6;font-family:${F};">
      Good ${partOfDay}, ${greetingName}. Here\u2019s your intel briefing.
    </p>
  </td>
</tr>

<tr>
  <td style="padding:0 24px;">
    <div style="height:1px;background-color:#e5e7eb;font-size:0;line-height:0;">&nbsp;</div>
  </td>
</tr>

${ncaamSection}
${mlbSection}`;

  return EmailShell({
    content,
    previewText: `\u{1F4E1} Your daily intel briefing across NCAAM and MLB.`,
    ctaUrl: 'https://maximussports.ai/mlb',
    ctaLabel: 'Open Maximus Sports &rarr;',
  });
}

export function renderText(data = {}) {
  const { displayName, headlines = [], mlbData } = data;
  const name = displayName ? displayName.split(' ')[0] : 'there';
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const lines = [
    '\u{1F4E1} MAXIMUS SPORTS \u2014 Daily Global Intel Briefing',
    today, '',
    `Good ${new Date().getHours() < 12 ? 'morning' : 'afternoon'}, ${name}. Here\u2019s your intel briefing.`,
    '',
  ];
  if (headlines.length > 0) {
    lines.push('\u{1F3C0} NCAAM');
    headlines.slice(0, 3).forEach(h => lines.push(`\u2022 ${h.title || ''}`));
    lines.push('');
  }
  const mlbHeadlines = mlbData?.headlines || [];
  const mlbNarrative = mlbData?.narrativeParagraph || '';
  if (mlbNarrative || mlbHeadlines.length > 0) {
    lines.push('\u26BE MLB DAILY BRIEFING');
    if (mlbNarrative) {
      mlbNarrative.replace(/\*\*/g, '').split(/(?<=[.!?])\s+(?=[A-Z])/).filter(s => s.length > 15).slice(0, 6).forEach(s => lines.push(`\u2022 ${s}`));
    }
    if (mlbHeadlines.length > 0) {
      lines.push('');
      mlbHeadlines.slice(0, 4).forEach(h => lines.push(`\u2022 ${h.title || ''}`));
    }
    lines.push('');
  }
  lines.push('Open Maximus Sports -> https://maximussports.ai/mlb', '', 'Not betting advice. Manage preferences: https://maximussports.ai/settings');
  return lines.join('\n');
}
