/**
 * MLB Maximus's Picks — premium picks digest email.
 *
 * Mirrors the MLB Home > Betting Intelligence > Maximus's Picks board.
 * Shows pick cards grouped by category: Pick 'Ems, ATS, Value Leans, Totals.
 *
 * @param {object} data
 * @param {string} [data.displayName]
 * @param {object} [data.picksBoard] — output of buildMlbPicks({ games })
 * @param {Array}  [data.scoresToday]
 * @param {Array}  [data.pinnedTeams]
 */

import {
  MlbEmailShell, mlbHeroBlock, mlbSectionHeader, mlbDividerRow,
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

export function getSubject(data = {}) {
  return mlbPicksSubject(data);
}

const CATEGORY_META = [
  { key: 'pickEms', emoji: '\u{1F3AF}', title: "PICK 'EMS", sub: 'Model-backed moneyline winners based on projections, odds, and team quality.' },
  { key: 'ats',     emoji: '\u{1F4CA}', title: 'AGAINST THE SPREAD', sub: 'Run line recommendations evaluating spread efficiency and matchup edges.' },
  { key: 'leans',   emoji: '\u{1F4C8}', title: 'VALUE LEANS', sub: 'Directional value where market pricing may underestimate a side.' },
  { key: 'totals',  emoji: '\u{26BE}',  title: 'GAME TOTALS', sub: 'Over/under leans based on team offense and pitching matchups.' },
];

function formatGameTime(startTime) {
  if (!startTime) return '';
  try {
    const d = new Date(startTime);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Los_Angeles' });
  } catch { return ''; }
}

function formatGameDay(startTime) {
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

function formatDate(startTime) {
  if (!startTime) return '';
  try {
    return new Date(startTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Los_Angeles' }).toUpperCase();
  } catch { return ''; }
}

function confidenceBadge(confidence) {
  const colors = {
    high: { bg: '#dcfce7', text: '#166534', label: 'HIGH' },
    medium: { bg: '#fef3c7', text: '#92400e', label: 'MED' },
    low: { bg: '#f3f4f6', text: '#6b7280', label: 'LOW' },
  };
  const c = colors[confidence] || colors.low;
  return `<span style="display:inline-block;font-size:10px;font-weight:700;letter-spacing:0.05em;color:${c.text};background-color:${c.bg};padding:2px 7px;border-radius:3px;font-family:${F};vertical-align:middle;">${c.label}</span>`;
}

function teamLogoUrl(team) {
  const slug = team?.slug;
  if (!slug) return '';
  return `https://maximussports.ai/logos/${slug}.png`;
}

function renderPickCard(pick) {
  const { matchup, pick: pickData, model, confidence } = pick;
  const away = matchup?.awayTeam || {};
  const home = matchup?.homeTeam || {};
  const startTime = matchup?.startTime;
  const isTotal = pick.category === 'totals';

  const dayLabel = formatGameDay(startTime);
  const dateLabel = formatDate(startTime);
  const timeLabel = formatGameTime(startTime);
  const edgePct = model?.edge != null ? `${Math.round(model.edge * 100)}%` : '\u2014';
  const dqPct = model?.dataQuality != null ? `${Math.round(model.dataQuality * 100)}%` : '\u2014';
  const signals = pickData?.topSignals || [];
  const pickLabel = pickData?.label || '';

  // Away/home logo images
  const awayLogo = teamLogoUrl(away);
  const homeLogo = teamLogoUrl(home);
  const awayName = away.shortName || away.name || 'Away';
  const homeName = home.shortName || home.name || 'Home';

  const logoImg = (url, alt, size = 24) => url
    ? `<img src="${url}" alt="${alt}" width="${size}" height="${size}" style="width:${size}px;height:${size}px;border-radius:4px;display:inline-block;border:0;vertical-align:middle;" />`
    : `<span style="display:inline-block;width:${size}px;height:${size}px;background:#e5e7eb;border-radius:4px;vertical-align:middle;"></span>`;

  // Matchup row — different for totals vs non-totals
  let matchupRow;
  if (isTotal) {
    matchupRow = `
      <td style="padding:10px 14px 8px;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
          <tr>
            <td style="font-size:14px;font-weight:600;line-height:20px;color:${NAVY};font-family:${F};">
              ${logoImg(awayLogo, awayName, 20)}&nbsp;${awayName}
              <span style="color:${MUTED};font-weight:400;margin:0 4px;">@</span>
              ${logoImg(homeLogo, homeName, 20)}&nbsp;${homeName}
            </td>
          </tr>
        </table>
        <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:8px;">
          <tr>
            <td style="padding:4px 12px;background-color:#f0f9ff;border:1px solid #bae6fd;border-radius:4px;">
              <span style="font-size:14px;font-weight:700;color:${NAVY};font-family:${F};">${pickLabel}</span>
            </td>
            <td style="padding-left:8px;">${confidenceBadge(confidence)}</td>
          </tr>
        </table>
      </td>`;
  } else {
    matchupRow = `
      <td style="padding:10px 14px 8px;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
          <tr>
            <td valign="middle">
              <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                <tr>
                  <td style="padding:4px 12px;background-color:#f0f9ff;border:1px solid #bae6fd;border-radius:4px;">
                    <span style="font-size:14px;font-weight:700;color:${NAVY};font-family:${F};">${pickLabel}</span>
                  </td>
                  <td style="padding-left:8px;">${confidenceBadge(confidence)}</td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
        <p style="margin:6px 0 0;font-size:13px;line-height:18px;color:${MUTED};font-family:${F};">
          ${logoImg(awayLogo, awayName, 16)}&nbsp;${awayName}
          <span style="color:#d1d5db;margin:0 3px;">vs</span>
          ${logoImg(homeLogo, homeName, 16)}&nbsp;${homeName}
        </p>
      </td>`;
  }

  // Signal bullets
  const signalRows = signals.slice(0, 2).map(s =>
    `<p style="margin:0 0 3px;font-size:12px;line-height:18px;color:${GREEN};font-family:${F};"><span style="color:${GREEN};">\u2713</span> ${normalizeSpacing(stripInlineEmoji(s))}</p>`
  ).join('');

  return `
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
           style="border:1px solid ${BORDER};border-radius:8px;border-collapse:collapse;margin-bottom:12px;background-color:#ffffff;">
      <!-- Date/time header -->
      <tr>
        <td style="padding:8px 14px 0;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
            <tr>
              <td style="font-size:10px;font-weight:700;letter-spacing:0.06em;color:${MUTED};font-family:${F};">${dayLabel} &middot; ${dateLabel}</td>
              <td align="right" style="font-size:11px;color:${MUTED};font-family:${F};">${timeLabel}</td>
            </tr>
          </table>
        </td>
      </tr>
      <!-- Matchup + pick -->
      <tr>${matchupRow}</tr>
      <!-- Metrics -->
      <tr>
        <td style="padding:4px 14px 6px;">
          <span style="font-size:11px;font-family:${F};"><span style="font-weight:700;color:${RED};letter-spacing:0.02em;">EDGE</span> <span style="font-weight:700;color:${NAVY};">${edgePct}</span></span>
          <span style="font-size:11px;font-family:${F};margin-left:14px;"><span style="font-weight:700;color:${MUTED};letter-spacing:0.02em;">DQ</span> <span style="font-weight:700;color:${NAVY};">${dqPct}</span></span>
        </td>
      </tr>
      <!-- Signals -->
      ${signalRows ? `<tr><td style="padding:2px 14px 10px;">${signalRows}</td></tr>` : ''}
    </table>`;
}

function renderCategorySection(catMeta, picks) {
  if (!picks || picks.length === 0) return '';

  const cards = picks.slice(0, 5).map(renderPickCard).join('\n');

  return `
${mlbSectionHeader(catMeta.emoji, catMeta.title)}
<tr>
  <td style="padding:0 28px 4px;" class="section-td">
    <p style="margin:0 0 12px;font-size:13px;line-height:18px;color:${MUTED};font-family:${F};">${catMeta.sub}</p>
    ${cards}
  </td>
</tr>`;
}

export function renderHTML(data = {}) {
  const {
    displayName,
    picksBoard,
    scoresToday = [],
  } = data;

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
    : 'Today\u2019s slate is being processed.';

  // Slate quality
  const highCount = [...pickEms, ...ats, ...leans, ...totals].filter(p => p.confidence === 'high').length;
  const slateQuality = highCount >= 8 ? 'STRONG' : highCount >= 4 ? 'SOLID' : 'MIXED';

  const heroLine = totalPicks > 0
    ? `Today\u2019s model-driven MLB edges are in.`
    : `Today\u2019s picks and edges are ready.`;

  // Category sections
  const categorySections = CATEGORY_META.map(cm => {
    const picks = categories[cm.key] || [];
    return renderCategorySection(cm, picks);
  }).filter(Boolean).join(`\n${mlbDividerRow()}\n`);

  const content = `
${mlbHeroBlock({ line: heroLine, sublabel: today })}

<tr>
  <td style="padding:6px 28px 12px;" class="intro-td">
    <p style="margin:0 0 10px;font-size:16px;line-height:26px;color:#4b5563;font-family:${F};">
      Hey ${greetingName}, Maximus has processed today\u2019s slate across moneyline, run line, value, and totals to surface the strongest signals on the board.
    </p>
  </td>
</tr>

${totalPicks > 0 ? `
<tr>
  <td style="padding:0 28px 16px;" class="section-td">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
           style="background-color:#f9fafb;border:1px solid ${BORDER};border-radius:6px;border-collapse:collapse;">
      <tr>
        <td style="padding:12px 16px;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
            <tr>
              <td style="font-size:12px;line-height:18px;color:${BODY};font-family:${F};">
                <span style="background-color:#dcfce7;color:#166534;font-size:10px;font-weight:700;padding:3px 8px;border-radius:3px;letter-spacing:0.05em;font-family:${F};vertical-align:middle;">${slateQuality}</span>
                <span style="margin-left:10px;">${boardSummary}</span>
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
  <td style="padding:20px 28px;text-align:center;" class="section-td">
    <p style="margin:0;font-size:14px;line-height:22px;color:${MUTED};font-family:${F};">No qualified picks right now. Check back as games approach.</p>
  </td>
</tr>`}`;

  return MlbEmailShell({
    content,
    previewText: totalPicks > 0
      ? `\u26BE ${totalPicks} MLB picks across ${parts.length} categories \u2014 Maximus Sports`
      : `\u26BE Today\u2019s MLB picks from Maximus Sports`,
    ctaUrl: 'https://maximussports.ai/mlb/picks',
    ctaLabel: 'Open Full Picks Board &rarr;',
  });
}

export function renderText(data = {}) {
  const { displayName, picksBoard } = data;
  const name = displayName ? displayName.split(' ')[0] : 'there';
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const categories = picksBoard?.categories || {};
  const lines = [
    '\u26BE MAXIMUS SPORTS \u2014 MLB Maximus\'s Picks',
    today, '',
    `Hey ${name}, today\u2019s model-driven MLB edges are in.`, '',
  ];

  for (const cm of CATEGORY_META) {
    const picks = categories[cm.key] || [];
    if (picks.length === 0) continue;
    lines.push(`${cm.emoji} ${cm.title}`);
    for (const p of picks.slice(0, 5)) {
      const away = p.matchup?.awayTeam?.shortName || 'Away';
      const home = p.matchup?.homeTeam?.shortName || 'Home';
      const edge = p.model?.edge != null ? `Edge ${Math.round(p.model.edge * 100)}%` : '';
      lines.push(`  ${p.pick?.label || ''} | ${away} @ ${home} | ${edge} | ${p.confidence?.toUpperCase() || ''}`);
    }
    lines.push('');
  }

  lines.push('Open Full Picks Board -> https://maximussports.ai/mlb/picks', '', 'Not betting advice. Manage preferences: https://maximussports.ai/settings');
  return lines.join('\n');
}
