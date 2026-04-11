/**
 * Global Daily Briefing — flagship multi-sport editorial digest.
 *
 * Structure:
 *   1. NCAAM championship recap (time-limited: ~5 days post-championship)
 *   2. Rich MLB section mirroring IG daily briefing slides:
 *      - Daily topical narrative (from AI summary)
 *      - Headlines
 *      - Maximus's Picks snapshot (from picks board)
 *
 * @param {object} data
 * @param {string} [data.displayName]
 * @param {Array}  [data.headlines]     — NCAAM headlines
 * @param {Array}  [data.scoresToday]   — NCAAM scores
 * @param {object} [data.mlbData]       — from assembleMlbEmailData
 */

import { EmailShell, heroBlock, sectionLabel } from '../EmailShell.js';
import { stripInlineEmoji, normalizeSpacing, cleanNarrativeText } from '../MlbEmailShell.js';

const F = "'DM Sans',Arial,Helvetica,sans-serif";

/**
 * Time-aware NCAAM championship display.
 * Shows the championship recap for ~5 days after the game, then fades out.
 * Championship date: April 7, 2026.
 */
const NCAAM_CHAMP_DATE = new Date('2026-04-07T00:00:00');
const NCAAM_CHAMP_DISPLAY_DAYS = 5;

function shouldShowNcaamChampionship() {
  const now = new Date();
  const daysSince = (now - NCAAM_CHAMP_DATE) / (1000 * 60 * 60 * 24);
  return daysSince >= 0 && daysSince <= NCAAM_CHAMP_DISPLAY_DAYS;
}

export function getSubject(data = {}) {
  const mlbHook = data.mlbData?.headlines?.[0]?.title;
  const showChamp = shouldShowNcaamChampionship();

  if (showChamp && mlbHook) {
    const short = stripInlineEmoji(mlbHook).slice(0, 35);
    return `\u{1F4E1} Michigan wins the title, MLB heats up \u2014 ${short}`;
  }
  if (showChamp) {
    return `\u{1F4E1} Michigan wins the National Championship \u2014 MLB Daily Intel`;
  }
  if (mlbHook) {
    const short = stripInlineEmoji(mlbHook).slice(0, 45);
    return `\u{1F4E1} Daily Global Intel \u2014 ${short}`;
  }
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
  const showChamp = shouldShowNcaamChampionship();

  // ── NCAAM CHAMPIONSHIP SECTION ─────────────────────────────
  let ncaamSection = '';
  if (showChamp) {
    ncaamSection = `
<tr>
  <td style="padding:20px 24px 8px;">
    <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      <tr>
        <td style="background:rgba(56,133,224,0.08);border:1px solid rgba(56,133,224,0.15);border-radius:4px;padding:5px 12px;">
          <span style="font-size:12px;font-weight:700;color:#2d6ca8;letter-spacing:0.06em;text-transform:uppercase;font-family:${F};">\u{1F3C6} NCAA MEN'S CHAMPIONSHIP</span>
        </td>
      </tr>
    </table>
  </td>
</tr>
<tr>
  <td style="padding:8px 24px 6px;">
    <p style="margin:0 0 4px;font-size:17px;font-weight:800;line-height:24px;color:#111827;font-family:${F};">Michigan beats UConn for the national title</p>
    <p style="margin:0;font-size:13px;color:#9ca3af;font-family:${F};">National Championship \u2014 Final: Michigan 69, UConn 63</p>
  </td>
</tr>
<tr>
  <td style="padding:6px 24px 16px;">
    <p style="margin:0 0 10px;font-size:14px;line-height:22px;color:#4b5563;font-family:${F};">The Michigan Wolverines captured their first national championship since 1989, defeating the defending champion UConn Huskies 69\u201363. Michigan\u2019s balanced attack and relentless defensive pressure held UConn to its lowest scoring output of the tournament.</p>
    <p style="margin:0;font-size:14px;line-height:22px;color:#4b5563;font-family:${F};">&bull; Michigan finishes No. 1 in the final AP poll for the first time since 1977<br/>&bull; UConn\u2019s bid for a third consecutive title falls short</p>
  </td>
</tr>
<tr>
  <td style="padding:0 24px 4px;">
    <a href="https://maximussports.ai/ncaam" style="font-size:12px;color:#2d6ca8;text-decoration:none;font-weight:600;font-family:${F};">Full NCAAM coverage &rarr;</a>
  </td>
</tr>
<tr>
  <td style="padding:8px 24px;">
    <div style="height:1px;background-color:#e5e7eb;font-size:0;line-height:0;">&nbsp;</div>
  </td>
</tr>`;
  }

  // ── MLB SECTION ────────────────────────────────────────────
  let mlbSection = '';

  // Parse narrative into bullets
  let mlbBullets = [];
  if (mlbNarrative) {
    const paragraphs = mlbNarrative.split(/\n{2,}/).map(p => cleanNarrativeText(p)).filter(p => p.length > 30);
    for (const p of paragraphs.slice(0, 4)) {
      const sentences = p.replace(/<[^>]+>/g, '').split(/(?<=[.!?])\s+(?=[A-Z])/).filter(s => s.length > 15);
      mlbBullets.push(...sentences);
    }
    mlbBullets = mlbBullets.slice(0, 8);
  }

  // MLB headline links
  const mlbHeadlineHtml = mlbHeadlines.slice(0, 4).map(h => {
    const title = normalizeSpacing(stripInlineEmoji(h.title || ''));
    const link = h.link || 'https://maximussports.ai/mlb';
    const source = h.source || '';
    return `<p style="margin:0 0 8px;font-size:14px;line-height:22px;color:#1f2937;font-family:${F};">&bull; <a href="${link}" style="color:#1a1a2e;text-decoration:none;font-weight:600;" target="_blank">${title}</a>${source ? `<br/><span style="font-size:11px;color:#9ca3af;">${source}</span>` : ''}</p>`;
  }).join('');

  if (mlbBullets.length > 0 || mlbHeadlineHtml) {
    // Narrative section
    const narrativeHtml = mlbBullets.length > 0 ? mlbBullets.map(b =>
      `<p style="margin:0 0 8px;font-size:14px;line-height:22px;color:#4b5563;font-family:${F};">&bull; ${normalizeSpacing(stripInlineEmoji(b))}</p>`
    ).join('') : '';

    // Picks summary (if available from mlbData)
    let picksSummary = '';
    const picks = mlbData?.picksBoard?.categories;
    if (picks) {
      const total = (picks.pickEms?.length || 0) + (picks.ats?.length || 0) + (picks.leans?.length || 0) + (picks.totals?.length || 0);
      if (total > 0) {
        const highCount = [...(picks.pickEms || []), ...(picks.ats || []), ...(picks.leans || []), ...(picks.totals || [])].filter(p => p.confidence === 'high').length;
        picksSummary = `
<tr>
  <td style="padding:0 24px 12px;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#fafbfc;border:1px solid #e5e7eb;border-left:3px solid #c41e3a;border-radius:6px;border-collapse:collapse;">
      <tr>
        <td style="padding:12px 14px;">
          <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#c41e3a;letter-spacing:0.06em;text-transform:uppercase;font-family:${F};">MAXIMUS'S PICKS</p>
          <p style="margin:0;font-size:13px;line-height:20px;color:#4b5563;font-family:${F};">${total} model-backed edges on the board today${highCount > 0 ? ` \u2014 ${highCount} high conviction` : ''}.</p>
          <p style="margin:6px 0 0;"><a href="https://maximussports.ai/mlb/insights" style="font-size:12px;color:#c41e3a;text-decoration:none;font-weight:600;font-family:${F};">Open Full Picks Board &rarr;</a></p>
        </td>
      </tr>
    </table>
  </td>
</tr>`;
      }
    }

    mlbSection = `
<tr>
  <td style="padding:20px 24px 8px;">
    <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      <tr>
        <td style="background:rgba(196,30,58,0.06);border:1px solid rgba(196,30,58,0.15);border-radius:4px;padding:5px 12px;">
          <span style="font-size:12px;font-weight:700;color:#c41e3a;letter-spacing:0.06em;text-transform:uppercase;font-family:${F};">\u26BE MLB DAILY INTELLIGENCE</span>
        </td>
      </tr>
    </table>
  </td>
</tr>
<tr>
  <td style="padding:8px 24px 14px;">
    ${narrativeHtml}
    ${mlbBullets.length > 0 && mlbHeadlineHtml ? `<p style="margin:12px 0 8px;font-size:11px;font-weight:700;color:#c41e3a;letter-spacing:0.06em;text-transform:uppercase;font-family:${F};">HEADLINES</p>` : ''}
    ${mlbHeadlineHtml}
  </td>
</tr>
${picksSummary}
<tr>
  <td style="padding:0 24px 4px;">
    <a href="https://maximussports.ai/mlb" style="font-size:12px;color:#c41e3a;text-decoration:none;font-weight:600;font-family:${F};">Full MLB intelligence &rarr;</a>
  </td>
</tr>`;
  }

  // Hero line
  const heroLine = showChamp
    ? 'Michigan captures the title \u2014 plus your daily MLB intel.'
    : 'Your daily cross-sport intelligence briefing.';

  const content = `
${heroBlock({ line: heroLine, sublabel: today })}

<tr>
  <td style="padding:8px 24px 16px;">
    <p style="margin:0;font-size:15px;color:#4b5563;line-height:1.6;font-family:${F};">
      Good ${partOfDay}, ${greetingName}. Here\u2019s what matters across Maximus Sports today.
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
    previewText: showChamp
      ? `\u{1F4E1} Michigan wins it all \u2014 plus today\u2019s MLB intel.`
      : `\u{1F4E1} Your daily intel across NCAAM and MLB.`,
    ctaUrl: 'https://maximussports.ai/mlb',
    ctaLabel: 'Open Maximus Sports &rarr;',
  });
}

export function renderText(data = {}) {
  const { displayName, mlbData } = data;
  const name = displayName ? displayName.split(' ')[0] : 'there';
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const showChamp = shouldShowNcaamChampionship();
  const lines = [
    '\u{1F4E1} MAXIMUS SPORTS \u2014 Daily Global Intel Briefing',
    today, '',
    `Good ${new Date().getHours() < 12 ? 'morning' : 'afternoon'}, ${name}. Here\u2019s what matters today.`,
    '',
  ];
  if (showChamp) {
    lines.push('\u{1F3C6} NCAA MEN\'S CHAMPIONSHIP');
    lines.push('Michigan 69, UConn 63 \u2014 Michigan wins the national title.');
    lines.push('');
  }
  const mlbNarrative = mlbData?.narrativeParagraph || '';
  const mlbHeadlines = mlbData?.headlines || [];
  if (mlbNarrative || mlbHeadlines.length > 0) {
    lines.push('\u26BE MLB DAILY INTELLIGENCE');
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
