/**
 * Global Daily Briefing — flagship multi-sport editorial digest.
 *
 * Structure:
 *   1. NCAAM championship recap (time-limited: ~5 days)
 *   2. Rich MLB section: narrative + pennant race + picks
 */

import { EmailShell, heroBlock } from '../EmailShell.js';
import { stripInlineEmoji, normalizeSpacing, cleanNarrativeText } from '../MlbEmailShell.js';

const F = "'DM Sans',Arial,Helvetica,sans-serif";
const RED = '#c41e3a';
const BLUE = '#2d6ca8';
const NAVY = '#0f2440';
const BODY = '#1f2937';
const MUTED = '#9ca3af';
const BORDER = '#e5e7eb';

// Championship display: 5 days from April 7, 2026
const CHAMP_DATE = new Date('2026-04-07T00:00:00');
const CHAMP_DAYS = 5;
function showChamp() {
  const d = (new Date() - CHAMP_DATE) / 86400000;
  return d >= 0 && d <= CHAMP_DAYS;
}

export function getSubject() {
  const sc = showChamp();
  if (sc) return `\u{1F4E1} Michigan wins the title \u2014 plus today\u2019s MLB intel`;
  return `\u{1F4E1} Your Daily Global Intel Briefing`;
}

export function renderHTML(data = {}) {
  const { displayName, mlbData } = data;
  const greetingName = (displayName ? displayName.split(' ')[0] : null) || 'there';
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const partOfDay = new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening';
  const sc = showChamp();

  // Diagnostic: log what data arrived
  console.log('[globalBriefing template]', {
    hasMlbData: !!mlbData,
    mlbNarrativeLen: mlbData?.narrativeParagraph?.length || 0,
    mlbHeadlineCount: mlbData?.headlines?.length || 0,
    hasPicks: !!mlbData?.picksBoard,
    hasPennant: !!mlbData?.pennantRace,
  });

  if (!mlbData) {
    console.error('[globalBriefing] CRITICAL: mlbData is missing — MLB section will not render');
  }

  const mlbNarrative = mlbData?.narrativeParagraph || '';
  const mlbHeadlines = mlbData?.headlines || [];
  const picks = mlbData?.picksBoard?.categories;

  // ── NCAAM CHAMPIONSHIP ─────────────────────────────────────
  let ncaamHtml = '';
  if (sc) {
    ncaamHtml = `
<tr><td style="padding:20px 24px 8px;">
  <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
    <tr><td style="background:rgba(56,133,224,0.08);border:1px solid rgba(56,133,224,0.15);border-radius:4px;padding:5px 12px;">
      <span style="font-size:12px;font-weight:700;color:${BLUE};letter-spacing:0.06em;text-transform:uppercase;font-family:${F};">\u{1F3C6} NCAA MEN'S CHAMPIONSHIP</span>
    </td></tr>
  </table>
</td></tr>
<tr><td style="padding:8px 24px 6px;">
  <p style="margin:0 0 4px;font-size:17px;font-weight:800;line-height:24px;color:#111827;font-family:${F};">Michigan beats UConn for the national title</p>
  <p style="margin:0;font-size:13px;color:${MUTED};font-family:${F};">Final: Michigan 69, UConn 63</p>
</td></tr>
<tr><td style="padding:6px 24px 14px;">
  <p style="margin:0 0 8px;font-size:14px;line-height:22px;color:#4b5563;font-family:${F};">The Wolverines captured their first title since 1989 with relentless defensive pressure, holding UConn to its lowest scoring output of the tournament. Michigan finishes No. 1 in the final AP poll for the first time since 1977.</p>
</td></tr>
<tr><td style="padding:0 24px;"><div style="height:1px;background:${BORDER};font-size:0;">&nbsp;</div></td></tr>`;
  }

  // ── MLB NARRATIVE BULLETS ──────────────────────────────────
  let narrativeHtml = '';
  if (mlbNarrative) {
    const bullets = mlbNarrative.split(/\n{2,}/)
      .map(p => cleanNarrativeText(p)).filter(p => p.length > 30)
      .flatMap(p => p.replace(/<[^>]+>/g, '').split(/(?<=[.!?])\s+(?=[A-Z])/).filter(s => s.length > 15))
      .slice(0, 6);

    if (bullets.length > 0) {
      narrativeHtml = bullets.map(b =>
        `<p style="margin:0 0 8px;font-size:14px;line-height:22px;color:#4b5563;font-family:${F};">&bull; ${normalizeSpacing(stripInlineEmoji(b))}</p>`
      ).join('');
    }
  }

  // ── PENNANT RACE (top contenders from projections) ─────────
  // Uses pennantRace data passed from the email assembly layer
  let pennantHtml = '';
  const pennant = data.pennantRace;
  if (pennant?.al?.length > 0 && pennant?.nl?.length > 0) {
    const renderTeam = (t) => `<span style="font-size:13px;color:${BODY};font-family:${F};"><strong>${t.abbrev}</strong> ${t.projectedWins}W${t.champOdds ? ` (${t.champOdds})` : ''}</span>`;

    pennantHtml = `
<tr><td style="padding:0 24px 12px;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#fafbfc;border:1px solid ${BORDER};border-radius:6px;border-collapse:collapse;">
    <tr><td style="padding:10px 14px 4px;">
      <span style="font-size:11px;font-weight:700;color:${RED};letter-spacing:0.06em;text-transform:uppercase;font-family:${F};">PENNANT RACE SNAPSHOT</span>
    </td></tr>
    <tr><td style="padding:4px 14px 10px;">
      <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:${BLUE};font-family:${F};">AL: ${pennant.al.map(renderTeam).join(' &middot; ')}</p>
      <p style="margin:0;font-size:12px;font-weight:600;color:${RED};font-family:${F};">NL: ${pennant.nl.map(renderTeam).join(' &middot; ')}</p>
    </td></tr>
  </table>
</td></tr>`;
  }

  // ── PICKS SUMMARY ──────────────────────────────────────────
  let picksHtml = '';
  if (picks) {
    const total = (picks.pickEms?.length || 0) + (picks.ats?.length || 0) + (picks.leans?.length || 0) + (picks.totals?.length || 0);
    const highCount = [...(picks.pickEms || []), ...(picks.ats || []), ...(picks.leans || []), ...(picks.totals || [])].filter(p => p.confidence === 'high').length;
    if (total > 0) {
      picksHtml = `
<tr><td style="padding:0 24px 12px;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#fafbfc;border:1px solid ${BORDER};border-left:3px solid ${RED};border-radius:6px;border-collapse:collapse;">
    <tr><td style="padding:12px 14px;">
      <p style="margin:0 0 3px;font-size:11px;font-weight:700;color:${RED};letter-spacing:0.06em;text-transform:uppercase;font-family:${F};">MAXIMUS'S PICKS</p>
      <p style="margin:0;font-size:13px;line-height:20px;color:#4b5563;font-family:${F};">${total} model-backed edges${highCount > 0 ? ` \u2014 ${highCount} high conviction` : ''}</p>
      <p style="margin:6px 0 0;"><a href="https://maximussports.ai/mlb/insights" style="font-size:12px;color:${RED};text-decoration:none;font-weight:600;font-family:${F};">Open Full Picks Board &rarr;</a></p>
    </td></tr>
  </table>
</td></tr>`;
    }
  }

  // ── MLB HEADLINES ──────────────────────────────────────────
  const headlineHtml = mlbHeadlines.slice(0, 4).map(h => {
    const t = normalizeSpacing(stripInlineEmoji(h.title || ''));
    const l = h.link || '#';
    const s = h.source || '';
    return `<p style="margin:0 0 8px;font-size:14px;line-height:22px;font-family:${F};">&bull; <a href="${l}" style="color:#1a1a2e;text-decoration:none;font-weight:600;" target="_blank">${t}</a>${s ? `<br/><span style="font-size:11px;color:${MUTED};">${s}</span>` : ''}</p>`;
  }).join('');

  // ── ASSEMBLE MLB SECTION ───────────────────────────────────
  let mlbSection = '';
  if (narrativeHtml || headlineHtml) {
    mlbSection = `
<tr><td style="padding:20px 24px 8px;">
  <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
    <tr><td style="background:rgba(196,30,58,0.06);border:1px solid rgba(196,30,58,0.15);border-radius:4px;padding:5px 12px;">
      <span style="font-size:12px;font-weight:700;color:${RED};letter-spacing:0.06em;text-transform:uppercase;font-family:${F};">\u26BE MLB DAILY INTELLIGENCE</span>
    </td></tr>
  </table>
</td></tr>
<tr><td style="padding:8px 24px 14px;">
  ${narrativeHtml}
</td></tr>
${pennantHtml}
${picksHtml}
${headlineHtml ? `
<tr><td style="padding:0 24px 4px;">
  <p style="margin:0 0 8px;font-size:11px;font-weight:700;color:${RED};letter-spacing:0.06em;text-transform:uppercase;font-family:${F};">HEADLINES</p>
  ${headlineHtml}
</td></tr>` : ''}
<tr><td style="padding:4px 24px 4px;">
  <a href="https://maximussports.ai/mlb" style="font-size:12px;color:${RED};text-decoration:none;font-weight:600;font-family:${F};">Full MLB intelligence &rarr;</a>
</td></tr>`;
  }

  const heroLine = sc
    ? 'Michigan captures the title \u2014 plus your daily MLB intel.'
    : 'Your daily cross-sport intelligence briefing.';

  const content = `
${heroBlock({ line: heroLine, sublabel: today })}
<tr><td style="padding:8px 24px 16px;">
  <p style="margin:0;font-size:15px;color:#4b5563;line-height:1.6;font-family:${F};">Good ${partOfDay}, ${greetingName}. Here\u2019s what matters across Maximus Sports today.</p>
</td></tr>
<tr><td style="padding:0 24px;"><div style="height:1px;background:${BORDER};font-size:0;">&nbsp;</div></td></tr>
${ncaamHtml}
${mlbSection}`;

  return EmailShell({
    content,
    previewText: sc ? `\u{1F4E1} Michigan wins it all \u2014 plus today\u2019s MLB intel.` : `\u{1F4E1} Your daily intel across NCAAM and MLB.`,
    ctaUrl: 'https://maximussports.ai/mlb',
    ctaLabel: 'Open Maximus Sports &rarr;',
  });
}

export function renderText(data = {}) {
  const { displayName, mlbData } = data;
  const name = (displayName ? displayName.split(' ')[0] : null) || 'there';
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const sc = showChamp();
  const lines = ['\u{1F4E1} MAXIMUS SPORTS \u2014 Daily Global Intel Briefing', today, '', `Good ${new Date().getHours() < 12 ? 'morning' : 'afternoon'}, ${name}.`, ''];
  if (sc) { lines.push('\u{1F3C6} Michigan 69, UConn 63 \u2014 Michigan wins the national title.', ''); }
  const n = mlbData?.narrativeParagraph || '';
  if (n) { n.replace(/\*\*/g, '').split(/(?<=[.!?])\s+(?=[A-Z])/).filter(s => s.length > 15).slice(0, 6).forEach(s => lines.push(`\u2022 ${s}`)); lines.push(''); }
  (mlbData?.headlines || []).slice(0, 4).forEach(h => lines.push(`\u2022 ${h.title || ''}`));
  lines.push('', 'Open Maximus Sports -> https://maximussports.ai/mlb', '', 'Not betting advice. Manage preferences: https://maximussports.ai/settings');
  return lines.join('\n');
}
