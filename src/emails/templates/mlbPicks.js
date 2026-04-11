/**
 * MLB Maximus's Picks — premium daily picks digest email.
 *
 * Mirrors the MLB Home > Betting Intelligence > Maximus's Picks board.
 * 4 categories: Pick 'Ems, Against the Spread, Value Leans, Game Totals.
 * Each pick rendered as a mini-card with logos, metrics, and rationale.
 */

import {
  MlbEmailShell, mlbHeroBlock, mlbDividerRow,
  normalizeSpacing, stripInlineEmoji,
} from '../MlbEmailShell.js';
import { mlbPicksSubject } from '../helpers/subjectGenerator.js';

const F = "'DM Sans',Arial,Helvetica,sans-serif";
const RED = '#c41e3a';
const NAVY = '#0f2440';
const BODY = '#1f2937';
const MUTED = '#9ca3af';
const BORDER = '#e5e7eb';
const GREEN = '#059669';
const CARD_BG = '#fafbfc';

export function getSubject(data = {}) {
  return mlbPicksSubject(data);
}

const CATEGORY_META = [
  { key: 'pickEms', icon: '\u{1F3AF}', title: "PICK 'EMS",           sub: 'Model-backed moneyline winners based on projections, odds, and team quality.', count: 0 },
  { key: 'ats',     icon: '\u{1F4CA}', title: 'AGAINST THE SPREAD',  sub: 'Run line recommendations evaluating spread efficiency and matchup edges.', count: 0 },
  { key: 'leans',   icon: '\u{1F4C8}', title: 'VALUE LEANS',          sub: 'Directional value where market pricing may underestimate a side.', count: 0 },
  { key: 'totals',  icon: '\u{26BE}',  title: 'GAME TOTALS',          sub: 'Over/under leans based on team offense and pitching matchups.', count: 0 },
];

function fmtTime(startTime) {
  if (!startTime) return '';
  try {
    return new Date(startTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Los_Angeles' });
  } catch { return ''; }
}

function fmtDay(startTime) {
  if (!startTime) return '';
  try {
    const d = new Date(startTime);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const gameDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diff = Math.round((gameDay - today) / 86400000);
    if (diff === 0) return 'TODAY';
    if (diff === 1) return 'TOMORROW';
    return d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'America/Los_Angeles' }).toUpperCase();
  } catch { return ''; }
}

function fmtDate(startTime) {
  if (!startTime) return '';
  try {
    return new Date(startTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Los_Angeles' }).toUpperCase();
  } catch { return ''; }
}

function confBadge(confidence) {
  const map = {
    high:   { bg: '#dcfce7', color: '#166534', label: 'HIGH' },
    medium: { bg: '#fef3c7', color: '#92400e', label: 'MED' },
    low:    { bg: '#f3f4f6', color: '#6b7280', label: 'LOW' },
  };
  const c = map[confidence] || map.low;
  return `<span style="display:inline-block;font-size:10px;font-weight:700;letter-spacing:0.05em;color:${c.color};background:${c.bg};padding:2px 8px;border-radius:4px;font-family:${F};vertical-align:middle;">${c.label}</span>`;
}

function logoImg(slug, name, size = 24) {
  if (!slug) return '';
  return `<img src="https://maximussports.ai/logos/${slug}.png" alt="${name || slug}" width="${size}" height="${size}" style="width:${size}px;height:${size}px;border-radius:4px;vertical-align:middle;display:inline-block;border:0;" />`;
}

function renderPickCard(pick) {
  const { matchup, pick: p, model, confidence, category } = pick;
  const away = matchup?.awayTeam || {};
  const home = matchup?.homeTeam || {};
  const startTime = matchup?.startTime;
  const isTotal = category === 'totals';

  const dayLabel = fmtDay(startTime);
  const dateLabel = fmtDate(startTime);
  const timeLabel = fmtTime(startTime);
  const edgePct = model?.edge != null ? `${Math.round(model.edge * 100)}%` : '\u2014';
  const dqPct = model?.dataQuality != null ? `${Math.round(model.dataQuality * 100)}%` : '\u2014';
  const signals = (p?.topSignals || []).slice(0, 2);
  const pickLabel = p?.label || '';

  const awayLogo = logoImg(away.slug, away.shortName, 22);
  const homeLogo = logoImg(home.slug, home.shortName, 22);
  const awayName = away.shortName || away.name || 'Away';
  const homeName = home.shortName || home.name || 'Home';

  // Pick pill
  const pickPill = `<span style="display:inline-block;font-size:14px;font-weight:700;color:${NAVY};background:#f0f9ff;border:1px solid #bae6fd;border-radius:5px;padding:4px 12px;font-family:${F};vertical-align:middle;">${pickLabel}</span>`;

  // Matchup line
  let matchupHtml;
  if (isTotal) {
    matchupHtml = `
      <p style="margin:0 0 8px;font-size:14px;font-weight:600;line-height:22px;color:${NAVY};font-family:${F};">
        ${awayLogo}&nbsp;${awayName} <span style="color:${MUTED};font-weight:400;">@</span> ${homeLogo}&nbsp;${homeName}
      </p>
      <p style="margin:0 0 8px;">${pickPill} ${confBadge(confidence)}</p>`;
  } else {
    matchupHtml = `
      <p style="margin:0 0 6px;">${pickPill} ${confBadge(confidence)}</p>
      <p style="margin:0 0 8px;font-size:13px;line-height:18px;color:${MUTED};font-family:${F};">
        ${awayLogo}&nbsp;${awayName} <span style="color:#d1d5db;margin:0 2px;">vs</span> ${homeLogo}&nbsp;${homeName}
      </p>`;
  }

  // Signals
  const signalHtml = signals.map(s =>
    `<p style="margin:0 0 2px;font-size:12px;line-height:18px;color:${GREEN};font-family:${F};">\u2713 ${normalizeSpacing(stripInlineEmoji(s))}</p>`
  ).join('');

  return `
<table role="presentation" cellpadding="0" cellspacing="0" width="100%"
       style="border:1px solid ${BORDER};border-radius:8px;border-collapse:collapse;margin-bottom:10px;background:${CARD_BG};">
  <tr>
    <td style="padding:10px 14px 4px;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
        <tr>
          <td style="font-size:10px;font-weight:700;letter-spacing:0.06em;color:${MUTED};font-family:${F};">${dayLabel} &middot; ${dateLabel}</td>
          <td align="right" style="font-size:11px;color:${MUTED};font-family:${F};">${timeLabel}</td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td style="padding:6px 14px 8px;">
      ${matchupHtml}
    </td>
  </tr>
  <tr>
    <td style="padding:0 14px 6px;">
      <span style="font-size:11px;font-family:${F};"><span style="font-weight:700;color:${RED};letter-spacing:0.02em;">EDGE</span> <span style="font-weight:700;color:${NAVY};">${edgePct}</span></span>
      <span style="font-size:11px;font-family:${F};margin-left:14px;"><span style="font-weight:700;color:${MUTED};letter-spacing:0.02em;">DQ</span> <span style="font-weight:700;color:${NAVY};">${dqPct}</span></span>
    </td>
  </tr>
  ${signalHtml ? `<tr><td style="padding:0 14px 10px;">${signalHtml}</td></tr>` : ''}
</table>`;
}

function renderCategorySection(catMeta, picks) {
  if (!picks || picks.length === 0) return '';
  const count = picks.length;
  const cards = picks.slice(0, 5).map(renderPickCard).join('\n');

  return `
<tr>
  <td style="padding:22px 28px 10px;" class="section-td">
    <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      <tr>
        <td style="background:#fef2f2;border:1px solid #fecaca;border-radius:4px;padding:5px 12px 5px 10px;">
          <span style="font-size:12px;font-weight:700;line-height:16px;color:${RED};letter-spacing:0.06em;text-transform:uppercase;font-family:${F};">${catMeta.icon} ${catMeta.title}</span>
        </td>
        <td style="padding-left:10px;">
          <span style="display:inline-block;font-size:10px;font-weight:700;color:#166534;background:#dcfce7;padding:2px 7px;border-radius:999px;font-family:${F};">${count}</span>
        </td>
      </tr>
    </table>
  </td>
</tr>
<tr>
  <td style="padding:0 28px 4px;" class="section-td">
    <p style="margin:0 0 12px;font-size:13px;line-height:18px;color:${MUTED};font-family:${F};">${catMeta.sub}</p>
    ${cards}
  </td>
</tr>`;
}

export function renderHTML(data = {}) {
  const { displayName, picksBoard } = data;

  const firstName = displayName ? displayName.split(' ')[0] : null;
  const greetingName = firstName || 'there';
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const categories = picksBoard?.categories || {};
  const pickEms = categories.pickEms || [];
  const ats = categories.ats || [];
  const leans = categories.leans || [];
  const totals = categories.totals || [];
  const totalPicks = pickEms.length + ats.length + leans.length + totals.length;

  // Board summary
  const parts = [];
  if (pickEms.length > 0) parts.push(`${pickEms.length} moneyline pick${pickEms.length !== 1 ? 's' : ''}`);
  if (ats.length > 0) parts.push(`${ats.length} run line${ats.length !== 1 ? 's' : ''}`);
  if (leans.length > 0) parts.push(`${leans.length} value lean${leans.length !== 1 ? 's' : ''}`);
  if (totals.length > 0) parts.push(`${totals.length} total${totals.length !== 1 ? 's' : ''}`);
  const boardSummary = parts.length > 0
    ? `Today\u2019s board: ${parts.join(', ')} across the MLB slate.`
    : '';

  const highCount = [...pickEms, ...ats, ...leans, ...totals].filter(p => p.confidence === 'high').length;
  const slateQuality = highCount >= 8 ? 'STRONG' : highCount >= 4 ? 'SOLID' : 'MIXED';

  // Category sections
  const categorySections = CATEGORY_META.map(cm => {
    const picks = categories[cm.key] || [];
    return renderCategorySection(cm, picks);
  }).filter(Boolean).join(`\n${mlbDividerRow()}\n`);

  const content = `
${mlbHeroBlock({ line: 'Your Daily Maximus\u2019s Picks Digest', sublabel: today })}

<tr>
  <td style="padding:6px 28px 16px;" class="intro-td">
    <p style="margin:0;font-size:16px;line-height:26px;color:#4b5563;font-family:${F};">
      Hey ${greetingName}, Maximus has processed today\u2019s slate across moneyline, run line, value, and totals to surface the strongest signals on the board.
    </p>
  </td>
</tr>

${totalPicks > 0 ? `
<tr>
  <td style="padding:0 28px 16px;" class="section-td">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
           style="background:${CARD_BG};border:1px solid ${BORDER};border-radius:8px;border-collapse:collapse;">
      <tr>
        <td style="padding:12px 16px;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
            <tr>
              <td style="font-size:11px;font-weight:700;color:${RED};letter-spacing:0.06em;text-transform:uppercase;font-family:${F};padding-right:10px;white-space:nowrap;">MLB SLATE</td>
              <td style="font-size:13px;line-height:18px;color:${BODY};font-family:${F};">${boardSummary}</td>
              <td align="right" style="padding-left:10px;">
                <span style="display:inline-block;font-size:10px;font-weight:700;color:#166534;background:#dcfce7;padding:3px 8px;border-radius:4px;letter-spacing:0.05em;font-family:${F};">${slateQuality}</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </td>
</tr>` : ''}

${mlbDividerRow()}

${categorySections || `
<tr>
  <td style="padding:28px;text-align:center;" class="section-td">
    <p style="margin:0 0 8px;font-size:15px;font-weight:600;line-height:22px;color:${NAVY};font-family:${F};">No high-confidence picks have cleared the model thresholds yet.</p>
    <p style="margin:0;font-size:14px;line-height:22px;color:${MUTED};font-family:${F};">Maximus is monitoring the board \u2014 check back as the slate firms up.</p>
  </td>
</tr>`}`;

  return MlbEmailShell({
    content,
    previewText: totalPicks > 0
      ? `\u{1F9E0}\u26BE ${totalPicks} model-backed MLB picks across ${parts.length} categories`
      : `\u{1F9E0}\u26BE Your Daily Maximus\u2019s Picks Digest`,
    ctaUrl: 'https://maximussports.ai/mlb/insights',
    ctaLabel: 'Open Full Picks Board &rarr;',
  });
}

export function renderText(data = {}) {
  const { displayName, picksBoard } = data;
  const name = displayName ? displayName.split(' ')[0] : 'there';
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const categories = picksBoard?.categories || {};
  const lines = [
    '\u{1F9E0}\u26BE YOUR DAILY MAXIMUS\u2019S PICKS DIGEST',
    today, '',
    `Hey ${name}, today\u2019s model-driven MLB edges are in.`, '',
  ];

  for (const cm of CATEGORY_META) {
    const picks = categories[cm.key] || [];
    if (picks.length === 0) continue;
    lines.push(`${cm.icon} ${cm.title} (${picks.length})`);
    for (const p of picks.slice(0, 5)) {
      const away = p.matchup?.awayTeam?.shortName || 'Away';
      const home = p.matchup?.homeTeam?.shortName || 'Home';
      const edge = p.model?.edge != null ? `Edge ${Math.round(p.model.edge * 100)}%` : '';
      lines.push(`  ${p.pick?.label || ''} | ${away} @ ${home} | ${edge} | ${p.confidence?.toUpperCase() || ''}`);
    }
    lines.push('');
  }

  lines.push('Open Full Picks Board -> https://maximussports.ai/mlb/insights', '', 'Not betting advice. Manage preferences: https://maximussports.ai/settings');
  return lines.join('\n');
}
