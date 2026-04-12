/**
 * Global Daily Briefing — flagship multi-sport editorial digest.
 *
 * Content architecture mirrors the 3 MLB IG Daily Briefing slides:
 *   Slide 1: Hero narrative, Hot Off The Press, Pennant Race, Picks highlights
 *   Slide 2: Season Leaders (5 categories), Maximus's Picks (3-4 cards)
 *   Slide 3: World Series Outlook (AL top 5 + NL top 5)
 *
 * Plus: optional NCAAM championship recap (time-limited)
 */

import { EmailShell, heroBlock } from '../EmailShell.js';
import { LEADER_CATEGORIES } from '../../data/mlb/seasonLeaders.js';
import { stripInlineEmoji, normalizeSpacing, cleanNarrativeText } from '../MlbEmailShell.js';

const F = "'DM Sans',Arial,Helvetica,sans-serif";
const RED = '#c41e3a';
const BLUE = '#2d6ca8';
const NAVY = '#0f2440';
const BODY = '#1f2937';
const MUTED = '#9ca3af';
const BORDER = '#e5e7eb';
const CARD_BG = '#fafbfc';

// Championship display: 5 days from April 7, 2026
const CHAMP_DATE = new Date('2026-04-07T00:00:00');
const CHAMP_DAYS = 5;
function showChamp() {
  const d = (new Date() - CHAMP_DATE) / 86400000;
  return d >= 0 && d <= CHAMP_DAYS;
}

// ── Helpers ──────────────────────────────────────────────────────

function fmtOdds(val) {
  if (val == null || val === '—') return '—';
  const n = typeof val === 'number' ? val : parseInt(String(val), 10);
  if (!Number.isFinite(n)) return '—';
  return n > 0 ? `+${n}` : String(n);
}

function fmtConviction(tier) {
  if (!tier) return 'Edge';
  if (tier === 'high') return 'High';
  if (tier === 'medium-high') return 'Med-High';
  if (tier === 'medium') return 'Medium';
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

function capitalize(s) {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Section pill — compact red label badge */
function sectionPill(label) {
  return `
<tr><td style="padding:20px 24px 8px;">
  <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
    <tr><td style="background:rgba(196,30,58,0.06);border:1px solid rgba(196,30,58,0.15);border-radius:4px;padding:5px 12px;">
      <span style="font-size:12px;font-weight:700;color:${RED};letter-spacing:0.06em;text-transform:uppercase;font-family:${F};">${label}</span>
    </td></tr>
  </table>
</td></tr>`;
}

/** Compact divider */
function divider() {
  return `<tr><td style="padding:4px 24px;"><div style="height:1px;background:${BORDER};font-size:0;">&nbsp;</div></td></tr>`;
}

// ── Exports ──────────────────────────────────────────────────────

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

  // Diagnostic
  console.log('[globalBriefing template]', {
    hasMlbData: !!mlbData,
    mlbNarrativeLen: mlbData?.narrativeParagraph?.length || 0,
    mlbHeadlineCount: mlbData?.headlines?.length || 0,
    hasPicks: !!mlbData?.picksBoard,
    hasPennant: !!data.pennantRace,
    hasLeaders: !!data.leadersCategories,
    hasOutlook: !!data.worldSeriesOutlook,
  });

  if (!mlbData) {
    console.error('[globalBriefing] CRITICAL: mlbData is missing — MLB section will not render');
  }

  const mlbNarrative = mlbData?.narrativeParagraph || '';
  const mlbHeadlines = mlbData?.headlines || [];
  const picks = mlbData?.picksBoard?.categories;

  // ══════════════════════════════════════════════════════════════
  // 0. NCAAM CHAMPIONSHIP (time-limited)
  // ══════════════════════════════════════════════════════════════
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
  <p style="margin:0 0 8px;font-size:14px;line-height:22px;color:#4b5563;font-family:${F};">The Wolverines captured their first title since 1989 with relentless defensive pressure. Michigan finishes No. 1 in the final AP poll for the first time since 1977.</p>
</td></tr>
${divider()}`;
  }

  // ══════════════════════════════════════════════════════════════
  // 1. MLB HERO NARRATIVE (Slide 1 hero)
  // ══════════════════════════════════════════════════════════════
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

  // ══════════════════════════════════════════════════════════════
  // 2. HOT OFF THE PRESS (Slide 1)
  // ══════════════════════════════════════════════════════════════
  // Uses narrative bullets as the "hot off the press" — these are the key daily developments
  let hotPressHtml = '';
  if (narrativeHtml) {
    hotPressHtml = `
${sectionPill('\u26BE MLB DAILY INTELLIGENCE')}
<tr><td style="padding:8px 24px 14px;">
  ${narrativeHtml}
</td></tr>`;
  }

  // ══════════════════════════════════════════════════════════════
  // 3. PENNANT RACE SNAPSHOT (Slide 1 bottom-left)
  // ══════════════════════════════════════════════════════════════
  let pennantHtml = '';
  const pennant = data.pennantRace;
  const champOdds = data.champOdds || {};

  if (pennant?.al?.length > 0 && pennant?.nl?.length > 0) {
    const renderTeamRow = (t, i) => {
      const oddsData = champOdds[t.slug];
      const odds = oddsData?.bestChanceAmerican ?? oddsData?.american ?? t.champOdds ?? null;
      const signal = (t.signals || [])[0] || '';
      return `
      <tr>
        <td style="padding:6px 0;border-bottom:1px solid #f3f4f6;font-family:${F};">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
            <tr>
              <td style="width:20px;font-size:12px;font-weight:700;color:${MUTED};font-family:${F};">${i + 1}</td>
              <td style="font-size:13px;font-weight:700;color:${NAVY};font-family:${F};">${t.abbrev}</td>
              <td style="font-size:13px;color:${BODY};font-family:${F};">${t.projectedWins}W</td>
              <td style="font-size:11px;color:${MUTED};font-family:${F};">${capitalize(t.confidenceTier || '')}</td>
              <td align="right" style="font-size:12px;font-weight:600;color:${RED};font-family:${F};">${fmtOdds(odds)}</td>
            </tr>
          </table>
        </td>
      </tr>`;
    };

    pennantHtml = `
<tr><td style="padding:0 24px 14px;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${CARD_BG};border:1px solid ${BORDER};border-radius:6px;border-collapse:collapse;">
    <tr><td style="padding:12px 14px 4px;">
      <span style="font-size:11px;font-weight:700;color:${RED};letter-spacing:0.06em;text-transform:uppercase;font-family:${F};">PENNANT RACE SNAPSHOT</span>
    </td></tr>
    <tr><td style="padding:4px 14px 4px;">
      <span style="font-size:10px;font-weight:600;color:${BLUE};letter-spacing:0.04em;text-transform:uppercase;font-family:${F};">AMERICAN LEAGUE</span>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
        ${pennant.al.map((t, i) => renderTeamRow(t, i)).join('')}
      </table>
    </td></tr>
    <tr><td style="padding:8px 14px 4px;">
      <span style="font-size:10px;font-weight:600;color:${RED};letter-spacing:0.04em;text-transform:uppercase;font-family:${F};">NATIONAL LEAGUE</span>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
        ${pennant.nl.map((t, i) => renderTeamRow(t, i)).join('')}
      </table>
    </td></tr>
    <tr><td style="padding:4px 14px 10px;">
      <a href="https://maximussports.ai/mlb/season-intelligence" style="font-size:11px;color:${RED};text-decoration:none;font-weight:600;font-family:${F};">Full Season Intelligence &rarr;</a>
    </td></tr>
  </table>
</td></tr>`;
  }

  // ══════════════════════════════════════════════════════════════
  // 4. MAXIMUS'S PICKS HIGHLIGHTS (Slide 1 & 2)
  // ══════════════════════════════════════════════════════════════
  let picksHtml = '';
  if (picks) {
    const allPicks = [
      ...(picks.pickEms || []).map(p => ({ ...p, type: "Pick 'Em" })),
      ...(picks.ats || []).map(p => ({ ...p, type: 'ATS' })),
      ...(picks.totals || []).map(p => ({ ...p, type: 'O/U' })),
    ];

    // Ensure at least one ATS if available
    const atsPicks = allPicks.filter(p => p.type === 'ATS');
    const allByConf = [...allPicks].sort((a, b) => (b.confidenceScore || 0) - (a.confidenceScore || 0));
    const selected = [];
    const usedIds = new Set();

    if (atsPicks.length > 0) {
      const bestAts = [...atsPicks].sort((a, b) => (b.confidenceScore || 0) - (a.confidenceScore || 0))[0];
      selected.push(bestAts);
      usedIds.add(bestAts.id);
    }
    for (const p of allByConf) {
      if (selected.length >= 4) break;
      if (!usedIds.has(p.id)) { selected.push(p); usedIds.add(p.id); }
    }

    if (selected.length > 0) {
      const pickCards = selected.map(p => {
        const away = p.matchup?.awayTeam?.shortName || p.matchup?.awayTeam?.name || '?';
        const home = p.matchup?.homeTeam?.shortName || p.matchup?.homeTeam?.name || '?';
        const matchup = `${away} vs ${home}`;
        const selection = p.pick?.label || '—';
        const conviction = fmtConviction(p.confidence);
        const rationale = p.pick?.explanation
          ? (p.pick.explanation.length > 60 ? p.pick.explanation.slice(0, 60).replace(/\s+\S*$/, '') + '.' : p.pick.explanation)
          : `Model edge: ${conviction.toLowerCase()}`;

        return `
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-family:${F};">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
              <tr>
                <td style="width:55%;vertical-align:top;">
                  <p style="margin:0 0 2px;font-size:12px;color:${MUTED};font-family:${F};">${matchup}</p>
                  <p style="margin:0;font-size:14px;font-weight:700;color:${NAVY};font-family:${F};">${selection}</p>
                </td>
                <td style="width:20%;text-align:center;vertical-align:top;">
                  <span style="display:inline-block;font-size:10px;font-weight:600;color:${BLUE};background:rgba(45,108,168,0.08);border:1px solid rgba(45,108,168,0.15);border-radius:3px;padding:2px 6px;font-family:${F};">${p.type}</span>
                </td>
                <td style="width:25%;text-align:right;vertical-align:top;">
                  <span style="font-size:12px;font-weight:600;color:${p.confidence === 'high' ? RED : BODY};font-family:${F};">${conviction}</span>
                </td>
              </tr>
            </table>
            <p style="margin:4px 0 0;font-size:12px;color:${MUTED};line-height:16px;font-family:${F};">${normalizeSpacing(stripInlineEmoji(rationale))}</p>
          </td>
        </tr>`;
      }).join('');

      picksHtml = `
<tr><td style="padding:0 24px 14px;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${CARD_BG};border:1px solid ${BORDER};border-left:3px solid ${RED};border-radius:6px;border-collapse:collapse;">
    <tr><td style="padding:12px 14px 4px;">
      <span style="font-size:11px;font-weight:700;color:${RED};letter-spacing:0.06em;text-transform:uppercase;font-family:${F};">MAXIMUS'S PICKS</span>
    </td></tr>
    <tr><td style="padding:0 14px 8px;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
        ${pickCards}
      </table>
    </td></tr>
    <tr><td style="padding:4px 14px 10px;">
      <a href="https://maximussports.ai/mlb/insights" style="font-size:11px;color:${RED};text-decoration:none;font-weight:600;font-family:${F};">Open Full Picks Board &rarr;</a>
    </td></tr>
  </table>
</td></tr>`;
    }
  }

  // ══════════════════════════════════════════════════════════════
  // 5. SEASON LEADERS (Slide 2 — 5 categories, top 3 each)
  // ══════════════════════════════════════════════════════════════
  let leadersHtml = '';
  const leadersCategories = data.leadersCategories || {};
  const activeCats = LEADER_CATEGORIES.filter(cat => leadersCategories[cat.key]?.leaders?.length > 0);

  if (activeCats.length > 0) {
    const catBlocks = activeCats.map(cat => {
      const leaders = leadersCategories[cat.key].leaders.slice(0, 3);
      const rows = leaders.map((l, i) => `
        <tr>
          <td style="width:16px;font-size:11px;font-weight:600;color:${MUTED};font-family:${F};padding:3px 0;">${i + 1}</td>
          <td style="font-size:13px;font-weight:500;color:${BODY};font-family:${F};padding:3px 4px;">${l.name}</td>
          <td style="font-size:11px;color:${MUTED};font-family:${F};padding:3px 4px;">${l.teamAbbrev || ''}</td>
          <td align="right" style="font-size:13px;font-weight:700;color:${NAVY};font-family:${F};padding:3px 0;">${l.display || l.value || ''}</td>
        </tr>`).join('');

      return `
      <tr><td style="padding:0 0 8px;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
          <tr>
            <td colspan="4" style="padding:4px 0 2px;">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
                <tr>
                  <td style="font-size:12px;font-weight:700;color:${NAVY};text-transform:uppercase;font-family:${F};">${cat.label}</td>
                  <td align="right" style="font-size:11px;font-weight:600;color:${MUTED};font-family:${F};">${cat.abbrev}</td>
                </tr>
              </table>
            </td>
          </tr>
          ${rows}
        </table>
      </td></tr>`;
    }).join('');

    leadersHtml = `
${sectionPill('\u{1F4CA} SEASON LEADERS')}
<tr><td style="padding:8px 24px 14px;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${CARD_BG};border:1px solid ${BORDER};border-radius:6px;border-collapse:collapse;">
    <tr><td style="padding:12px 14px 6px;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
        ${catBlocks}
      </table>
    </td></tr>
  </table>
</td></tr>`;
  }

  // ══════════════════════════════════════════════════════════════
  // 6. WORLD SERIES OUTLOOK (Slide 3 — AL top 5 + NL top 5)
  // ══════════════════════════════════════════════════════════════
  let outlookHtml = '';
  const outlook = data.worldSeriesOutlook;

  if (outlook?.al?.length > 0 && outlook?.nl?.length > 0) {
    const renderOutlookTeam = (t, rank) => {
      const signal = (t.signals || [])[0] || '';
      const rationale = t.distilledRationale || '';
      // Truncate rationale for email
      const shortRat = rationale.length > 100 ? rationale.slice(0, 100).replace(/\s+\S*$/, '') + '.' : rationale;

      return `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-family:${F};">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
            <tr>
              <td style="width:20px;font-size:12px;font-weight:700;color:${MUTED};vertical-align:top;font-family:${F};">${rank}</td>
              <td style="vertical-align:top;">
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
                  <tr>
                    <td style="font-size:14px;font-weight:700;color:${NAVY};font-family:${F};">${t.abbrev}</td>
                    <td align="right">
                      <span style="font-size:12px;font-weight:600;color:${RED};font-family:${F};">${fmtOdds(t.champOdds)}</span>
                    </td>
                  </tr>
                </table>
                <p style="margin:2px 0 0;font-size:22px;font-weight:800;color:${NAVY};line-height:26px;font-family:${F};">${t.projectedWins} <span style="font-size:11px;font-weight:600;color:${MUTED};text-transform:uppercase;letter-spacing:0.04em;">PROJECTED WINS</span></p>
                ${signal ? `<span style="display:inline-block;font-size:10px;font-weight:600;color:${BODY};background:rgba(0,0,0,0.04);border:1px solid rgba(0,0,0,0.08);border-radius:3px;padding:1px 6px;margin:2px 0;font-family:${F};">${signal}</span>` : ''}
                ${shortRat ? `<p style="margin:3px 0 0;font-size:12px;line-height:16px;color:${MUTED};font-family:${F};">${normalizeSpacing(stripInlineEmoji(shortRat))}</p>` : ''}
                ${t.rangeLabel ? `<p style="margin:2px 0 0;font-size:11px;color:#d1d5db;font-family:${F};">Range: ${t.rangeLabel} &middot; ${capitalize(t.confidenceTier || '')}</p>` : ''}
              </td>
            </tr>
          </table>
        </td>
      </tr>`;
    };

    outlookHtml = `
${sectionPill('\u{1F3C6} WORLD SERIES OUTLOOK')}
<tr><td style="padding:4px 24px 4px;">
  <p style="margin:0;font-size:11px;font-weight:600;color:${MUTED};text-transform:uppercase;letter-spacing:0.04em;font-family:${F};">WHAT THE MAXIMUS PREDICTION MODEL SAYS</p>
</td></tr>

<!-- AL Top 5 -->
<tr><td style="padding:8px 24px 4px;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${CARD_BG};border:1px solid ${BORDER};border-radius:6px;border-collapse:collapse;">
    <tr><td style="padding:10px 14px 4px;">
      <span style="font-size:11px;font-weight:700;color:${BLUE};letter-spacing:0.06em;text-transform:uppercase;font-family:${F};">AMERICAN LEAGUE &mdash; TOP 5 BY PROJECTED WINS</span>
    </td></tr>
    <tr><td style="padding:0 14px 10px;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
        ${outlook.al.map((t, i) => renderOutlookTeam(t, i + 1)).join('')}
      </table>
    </td></tr>
  </table>
</td></tr>

<!-- NL Top 5 -->
<tr><td style="padding:8px 24px 14px;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${CARD_BG};border:1px solid ${BORDER};border-radius:6px;border-collapse:collapse;">
    <tr><td style="padding:10px 14px 4px;">
      <span style="font-size:11px;font-weight:700;color:${RED};letter-spacing:0.06em;text-transform:uppercase;font-family:${F};">NATIONAL LEAGUE &mdash; TOP 5 BY PROJECTED WINS</span>
    </td></tr>
    <tr><td style="padding:0 14px 10px;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
        ${outlook.nl.map((t, i) => renderOutlookTeam(t, i + 1)).join('')}
      </table>
    </td></tr>
  </table>
</td></tr>`;
  }

  // ══════════════════════════════════════════════════════════════
  // 7. SUPPORTING HEADLINES (de-emphasized)
  // ══════════════════════════════════════════════════════════════
  let headlineHtml = '';
  if (mlbHeadlines.length > 0) {
    const items = mlbHeadlines.slice(0, 4).map(h => {
      const t = normalizeSpacing(stripInlineEmoji(h.title || ''));
      const l = h.link || '#';
      const s = h.source || '';
      return `<p style="margin:0 0 6px;font-size:13px;line-height:18px;font-family:${F};">&bull; <a href="${l}" style="color:${BODY};text-decoration:none;font-weight:500;" target="_blank">${t}</a>${s ? ` <span style="font-size:11px;color:${MUTED};">(${s})</span>` : ''}</p>`;
    }).join('');

    headlineHtml = `
<tr><td style="padding:0 24px 4px;">
  <p style="margin:0 0 6px;font-size:10px;font-weight:700;color:${MUTED};letter-spacing:0.06em;text-transform:uppercase;font-family:${F};">HEADLINES</p>
  ${items}
</td></tr>`;
  }

  // ══════════════════════════════════════════════════════════════
  // ASSEMBLE
  // ══════════════════════════════════════════════════════════════
  const heroLine = sc
    ? 'Michigan captures the title \u2014 plus your daily MLB intel.'
    : 'Your daily cross-sport intelligence briefing.';

  const content = `
${heroBlock({ line: heroLine, sublabel: today })}
<tr><td style="padding:8px 24px 16px;">
  <p style="margin:0;font-size:15px;color:#4b5563;line-height:1.6;font-family:${F};">Good ${partOfDay}, ${greetingName}. Here\u2019s what matters across Maximus Sports today.</p>
</td></tr>
${divider()}
${ncaamHtml}
${hotPressHtml}
${pennantHtml}
${picksHtml}
${leadersHtml}
${outlookHtml}
${headlineHtml ? divider() + headlineHtml : ''}
<tr><td style="padding:8px 24px 4px;">
  <a href="https://maximussports.ai/mlb" style="font-size:12px;color:${RED};text-decoration:none;font-weight:600;font-family:${F};">Full MLB intelligence &rarr;</a>
</td></tr>`;

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

  // Narrative bullets
  const n = mlbData?.narrativeParagraph || '';
  if (n) { n.replace(/\*\*/g, '').split(/(?<=[.!?])\s+(?=[A-Z])/).filter(s => s.length > 15).slice(0, 6).forEach(s => lines.push(`\u2022 ${s}`)); lines.push(''); }

  // Pennant race
  const pennant = data.pennantRace;
  if (pennant?.al?.length > 0) {
    lines.push('PENNANT RACE:');
    lines.push(`AL: ${pennant.al.map(t => `${t.abbrev} ${t.projectedWins}W`).join(' | ')}`);
    lines.push(`NL: ${pennant.nl.map(t => `${t.abbrev} ${t.projectedWins}W`).join(' | ')}`);
    lines.push('');
  }

  // Picks
  const picks2 = mlbData?.picksBoard?.categories;
  if (picks2) {
    const all = [...(picks2.pickEms || []), ...(picks2.ats || []), ...(picks2.totals || [])];
    const top = all.sort((a, b) => (b.confidenceScore || 0) - (a.confidenceScore || 0)).slice(0, 4);
    if (top.length > 0) {
      lines.push("MAXIMUS'S PICKS:");
      for (const p of top) {
        const away = p.matchup?.awayTeam?.shortName || '?';
        const home = p.matchup?.homeTeam?.shortName || '?';
        lines.push(`\u2022 ${away} vs ${home}: ${p.pick?.label || '—'} (${p.confidence || 'edge'})`);
      }
      lines.push('');
    }
  }

  // Season leaders
  const leaders = data.leadersCategories || {};
  const CATS = [
    { key: 'homeRuns', label: 'HR' }, { key: 'RBIs', label: 'RBI' },
    { key: 'hits', label: 'H' }, { key: 'wins', label: 'W' }, { key: 'saves', label: 'SV' },
  ];
  const hasCats = CATS.some(c => leaders[c.key]?.leaders?.length > 0);
  if (hasCats) {
    lines.push('SEASON LEADERS:');
    for (const cat of CATS) {
      const l = leaders[cat.key]?.leaders?.[0];
      if (l) lines.push(`${cat.label}: ${l.name} (${l.display || l.value})`);
    }
    lines.push('');
  }

  // World Series Outlook
  const outlook = data.worldSeriesOutlook;
  if (outlook?.al?.length > 0) {
    lines.push('WORLD SERIES OUTLOOK:');
    lines.push(`AL: ${outlook.al.map(t => `${t.abbrev} ${t.projectedWins}W`).join(' | ')}`);
    lines.push(`NL: ${outlook.nl.map(t => `${t.abbrev} ${t.projectedWins}W`).join(' | ')}`);
    lines.push('');
  }

  // Headlines
  (mlbData?.headlines || []).slice(0, 4).forEach(h => lines.push(`\u2022 ${h.title || ''}`));
  lines.push('', 'Open Maximus Sports -> https://maximussports.ai/mlb', '', 'Not betting advice. Manage preferences: https://maximussports.ai/settings');
  return lines.join('\n');
}
