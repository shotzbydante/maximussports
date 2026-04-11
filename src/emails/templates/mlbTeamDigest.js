/**
 * MLB Team Digest — premium personalized team intel (light mode).
 *
 * Mirrors MLB Home pinned team cards: logo, stat strip (2025 record,
 * finish, projected wins, current record), next game, narrative
 * insight, team leaders, news.
 *
 * @param {object} data
 * @param {string} [data.displayName]
 * @param {Array}  data.teamDigests
 * @param {number} [data.totalTeamCount]
 */

import { MlbEmailShell, mlbHeroBlock, mlbSectionLabel, mlbDividerRow, mlbSpacerRow, mlbTeamLogoImg } from '../MlbEmailShell.js';
import { normalizeSpacing, stripInlineEmoji } from '../MlbEmailShell.js';
import { TEAM_DIGEST_MAX_TEAMS } from '../../../api/_lib/teamDigest.js';
import { mlbTeamDigestSubject } from '../helpers/subjectGenerator.js';

const F = "'DM Sans',Arial,Helvetica,sans-serif";
const RED = '#c41e3a';
const MUTED = '#9ca3af';
const BODY = '#1f2937';
const BORDER = '#e5e7eb';

export function getSubject(data = {}) {
  return mlbTeamDigestSubject(data);
}

export function getPreviewText(data = {}) {
  const { teamDigests = [] } = data;
  if (teamDigests.length === 0) return '\u26BE Your Maximus Sports MLB team digest is ready.';
  const names = teamDigests.slice(0, 2).map(d => d.team.name).join(' & ');
  return `\u26BE Full intel for ${names} \u2014 schedule, trends, and more.`;
}

/**
 * Render a compact stat strip mirroring the IG team intel slide.
 * Shows: 2025 Record | 2025 Finish | Projected Wins | Current Record
 */
function renderStatStrip(digest) {
  const meta = digest._meta || {};
  const proj = digest._projection || {};
  const cells = [];

  if (meta.record2025) {
    cells.push({ label: '2025 RECORD', value: meta.record2025 });
  }
  if (meta.finish) {
    cells.push({ label: '2025 FINISH', value: meta.finish });
  }
  if (proj.projectedWins != null) {
    cells.push({ label: 'PROJECTED WINS', value: String(proj.projectedWins), accent: true });
  }
  if (digest._currentRecord) {
    cells.push({ label: 'CURRENT', value: digest._currentRecord });
  }

  if (cells.length === 0) return '';

  const cellHtml = cells.map(c =>
    `<td style="padding:8px 8px;text-align:center;border-right:1px solid ${BORDER};">
      <span style="display:block;font-size:8px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${MUTED};font-family:${F};margin-bottom:2px;">${c.label}</span>
      <span style="font-size:14px;font-weight:700;color:${c.accent ? RED : BODY};font-family:${F};white-space:nowrap;">${c.value}</span>
    </td>`
  ).join('');

  return `
<tr>
  <td style="padding:0 24px 10px;" class="section-td">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
           style="border:1px solid ${BORDER};border-radius:6px;border-collapse:collapse;overflow:hidden;">
      <tr>${cellHtml}</tr>
    </table>
  </td>
</tr>`;
}

/**
 * Render team aggregate stats (HR, RBI, Hits, Wins, Saves) from ESPN.
 * These are team totals, not individual player leaders.
 */
function renderTeamStats(teamStats) {
  if (!teamStats) return '';
  const cats = [
    { key: 'hr', label: 'HR' },
    { key: 'rbi', label: 'RBI' },
    { key: 'hits', label: 'HITS' },
    { key: 'wins', label: 'W' },
    { key: 'saves', label: 'SV' },
  ];

  const hasAny = cats.some(c => teamStats[c.key]?.value != null);
  if (!hasAny) return '';

  const cellHtml = cats.map(c => {
    const entry = teamStats[c.key];
    const val = entry?.display || (entry?.value != null ? String(Math.round(entry.value)) : '\u2014');
    return `<td style="padding:8px 4px;text-align:center;">
      <span style="display:block;font-size:9px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${RED};font-family:${F};margin-bottom:2px;">${c.label}</span>
      <span style="display:block;font-size:15px;font-weight:700;color:${BODY};font-family:${F};">${val}</span>
    </td>`;
  }).join('');

  return `
<tr>
  <td style="padding:0 24px 10px;" class="section-td">
    <div style="margin-bottom:6px;">${mlbSectionLabel('TEAM STATS')}</div>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
           style="border:1px solid ${BORDER};border-radius:6px;border-collapse:collapse;overflow:hidden;background:#fafbfc;">
      <tr>${cellHtml}</tr>
    </table>
  </td>
</tr>`;
}

function renderTeamSection(digest, isFirst = false) {
  const { team, game, ats, teamNews, teamUrl, aiSummary, maximusInsight } = digest;
  const teamName = team.name || 'Your Team';
  const logoHtml = mlbTeamLogoImg(team, 36);
  const teamStats = digest._teamStats || null;
  const nextGameInfo = digest._nextGameInfo || null;

  // Team hero: logo + name + division + CTA
  const teamHero = `
<tr>
  <td style="padding:${isFirst ? '0' : '16px'} 24px 10px;" class="section-td">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
      <tr>
        <td valign="middle" style="width:44px;padding-right:12px;">${logoHtml}</td>
        <td valign="middle">
          <a href="${teamUrl}" style="font-size:18px;font-weight:800;color:#111827;text-decoration:none;letter-spacing:-0.02em;font-family:${F};">${teamName}</a>
          ${team.conference ? `<div style="margin-top:3px;font-size:12px;color:${MUTED};font-family:${F};">${team.conference}</div>` : ''}
        </td>
        <td align="right" valign="middle">
          <a href="${teamUrl}" style="font-size:12px;color:${RED};text-decoration:none;font-weight:600;font-family:${F};">View Team Intel &rarr;</a>
        </td>
      </tr>
    </table>
  </td>
</tr>`;

  // Stat strip
  const statStrip = renderStatStrip(digest);

  // Next game — prefer ESPN nextGameInfo, fall back to digest game data
  let gameSection = '';
  const gameData = game || null;
  const ngInfo = nextGameInfo;

  if (gameData || ngInfo) {
    let matchupLine = '';
    let detailLine = '';

    if (gameData) {
      const status = gameData.gameStatus || gameData.status || 'Scheduled';
      const isFinal = /final|postponed/i.test(status);
      const isLive = /\d|halftime|progress/i.test(status);
      matchupLine = `${gameData.awayTeam || 'Away'} @ ${gameData.homeTeam || 'Home'}`;
      if (isFinal && gameData.homeScore != null) {
        detailLine = `<span style="color:${RED};font-weight:700;">${gameData.awayScore} \u2013 ${gameData.homeScore}</span> <span style="color:${MUTED};">Final</span>`;
      } else if (isLive) {
        detailLine = `<span style="color:${RED};font-weight:700;">LIVE</span> <span style="color:#4b5563;">${status}</span>`;
      } else {
        detailLine = `<span style="color:${MUTED};">${status}</span>`;
      }
      if (gameData.spread) detailLine += `<span style="color:${MUTED};margin-left:8px;">Spread: ${gameData.spread}</span>`;
    } else if (ngInfo) {
      matchupLine = ngInfo.name || `${ngInfo.awayTeam || '?'} @ ${ngInfo.homeTeam || '?'}`;
      try {
        const d = new Date(ngInfo.date);
        const timeStr = d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Los_Angeles' });
        detailLine = `<span style="color:${MUTED};">${timeStr} PT</span>`;
      } catch { detailLine = ''; }
      if (ngInfo.broadcast) detailLine += `<span style="color:${MUTED};margin-left:8px;">${ngInfo.broadcast}</span>`;
    }

    gameSection = `
<tr>
  <td style="padding:0 24px 10px;" class="section-td">
    <div style="margin-bottom:6px;">${mlbSectionLabel('NEXT GAME')}</div>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
           style="background:#f9fafb;border:1px solid ${BORDER};border-left:3px solid ${RED};border-radius:6px;border-collapse:collapse;">
      <tr>
        <td style="padding:10px 14px;">
          <p style="margin:0 0 4px;font-size:14px;font-weight:600;color:#111827;font-family:${F};">${matchupLine}</p>
          ${detailLine ? `<p style="margin:0;font-size:13px;font-family:${F};">${detailLine}</p>` : ''}
        </td>
      </tr>
    </table>
  </td>
</tr>`;
  } else {
    gameSection = `
<tr>
  <td style="padding:0 24px 10px;" class="section-td">
    <p style="margin:0;font-size:13px;color:${MUTED};font-family:${F};">No game today \u2014 <a href="${teamUrl}" style="color:${RED};text-decoration:none;font-weight:600;">view full schedule &rarr;</a></p>
  </td>
</tr>`;
  }

  // Narrative summary
  const insightText = maximusInsight || aiSummary || null;
  const summarySection = insightText ? `
<tr>
  <td style="padding:0 24px 10px;" class="section-td">
    <div style="margin-bottom:6px;">${mlbSectionLabel('MAXIMUS INSIGHT')}</div>
    <p style="margin:0;font-size:14px;color:#4b5563;line-height:1.6;font-family:${F};font-style:italic;">${normalizeSpacing(stripInlineEmoji(insightText))}</p>
  </td>
</tr>` : '';

  // Team stats
  const statsSection = renderTeamStats(teamStats);

  // Team news (compact)
  let newsSection = '';
  if (teamNews?.length > 0) {
    const items = teamNews.slice(0, 3).map(n => {
      const title = normalizeSpacing(stripInlineEmoji(n.title || ''));
      const source = n.source || '';
      const link = n.link || teamUrl;
      return `<p style="margin:0 0 6px;font-size:13px;line-height:20px;font-family:${F};">&bull; <a href="${link}" style="color:#111827;text-decoration:none;font-weight:500;" target="_blank">${title}</a>${source ? ` <span style="color:${MUTED};font-size:11px;">\u2014 ${source}</span>` : ''}</p>`;
    }).join('');
    newsSection = `
<tr>
  <td style="padding:0 24px 10px;" class="section-td">
    <div style="margin-bottom:6px;">${mlbSectionLabel('TEAM NEWS')}</div>
    ${items}
  </td>
</tr>`;
  }

  return [teamHero, statStrip, gameSection, summarySection, statsSection, newsSection].filter(Boolean).join('\n');
}

export function renderHTML(data = {}) {
  const { displayName, teamDigests = [], totalTeamCount = teamDigests.length } = data;
  const firstName = displayName ? displayName.split(' ')[0] : null;
  const greetingName = firstName || 'there';
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  if (teamDigests.length === 0) {
    const content = `
${mlbHeroBlock({ line: 'Pin MLB teams to get your digest', sublabel: today })}
<tr>
  <td style="padding:10px 24px 16px;" class="intro-td">
    <p style="margin:0;font-size:15px;color:#4b5563;line-height:1.65;font-family:${F};">
      Hey ${greetingName}, pin your favorite MLB teams in Settings. Your Team Digest will cover every pinned team with full intel, trends, and news.
    </p>
  </td>
</tr>`;
    return MlbEmailShell({ content, previewText: '\u26BE Pin MLB teams to get your personalized digest.', ctaUrl: 'https://maximussports.ai/settings', ctaLabel: 'Pin teams in Settings &rarr;' });
  }

  // Dynamic hero title using team names
  const names = teamDigests.map(d => d.team?.name?.split(' ').pop()).filter(Boolean);
  let heroLine;
  if (names.length === 1) {
    heroLine = `${teamDigests[0].team.name} \u2014 Your Daily Team Intel`;
  } else if (names.length === 2) {
    heroLine = `${names[0]} + ${names[1]} \u2014 Your Daily Team Intel`;
  } else {
    heroLine = `${names[0]}, ${names[1]} + ${names.length - 2} more \u2014 Your Daily Team Intel`;
  }

  const divider = `\n${mlbDividerRow()}\n${mlbSpacerRow(6)}\n`;
  const teamSections = teamDigests.slice(0, TEAM_DIGEST_MAX_TEAMS).map((d, i) => renderTeamSection(d, i === 0)).join(divider);

  const remaining = totalTeamCount - Math.min(teamDigests.length, TEAM_DIGEST_MAX_TEAMS);
  const truncNote = remaining > 0 ? `
<tr>
  <td style="padding:0 24px 10px;text-align:center;" class="section-td">
    <p style="margin:0;font-size:12px;color:${MUTED};font-family:${F};">
      ${remaining} more team${remaining !== 1 ? 's' : ''} in your digest \u2014
      <a href="https://maximussports.ai/mlb" style="color:${RED};text-decoration:none;font-weight:600;">view all &rarr;</a>
    </p>
  </td>
</tr>` : '';

  const content = `
${mlbHeroBlock({ line: heroLine, sublabel: today })}
<tr>
  <td style="padding:8px 24px 16px;" class="intro-td">
    <p style="margin:0;font-size:16px;line-height:26px;color:#4b5563;font-family:${F};">
      Good evening, ${greetingName}. Your personalized MLB team intel for today.
    </p>
  </td>
</tr>
<tr>
  <td style="padding:0 24px;">
    <div style="height:1px;background:${BORDER};font-size:0;">&nbsp;</div>
  </td>
</tr>
${teamSections}
${truncNote}`;

  const ctaUrl = teamDigests.length === 1 ? teamDigests[0].teamUrl : 'https://maximussports.ai/mlb';
  const ctaLabel = teamDigests.length === 1 ? `Open ${teamDigests[0].team.name} page &rarr;` : 'View all MLB teams &rarr;';

  return MlbEmailShell({ content, previewText: getPreviewText(data), ctaUrl, ctaLabel });
}

export function renderText(data = {}) {
  const { displayName, teamDigests = [] } = data;
  const name = displayName ? displayName.split(' ')[0] : 'there';
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const lines = ['\u26BE MAXIMUS SPORTS \u2014 MLB Team Digest', today, '', `Hey ${name}, here\u2019s your MLB team digest.`, ''];
  for (const digest of teamDigests.slice(0, TEAM_DIGEST_MAX_TEAMS)) {
    const { team, game, teamNews, teamUrl, maximusInsight } = digest;
    lines.push(`\u2501\u2501\u2501 ${team.name} \u2501\u2501\u2501`);
    if (digest._meta?.record2025) lines.push(`2025: ${digest._meta.record2025}`);
    if (digest._projection?.projectedWins) lines.push(`Projected: ${digest._projection.projectedWins} wins`);
    if (game) {
      const s = game.gameStatus || game.status || 'Scheduled';
      if (/final/i.test(s) && game.homeScore != null) lines.push(`Result: ${game.awayTeam} ${game.awayScore} @ ${game.homeTeam} ${game.homeScore} \u2014 Final`);
      else lines.push(`Next: ${game.awayTeam} @ ${game.homeTeam}`);
    }
    if (maximusInsight) lines.push(`Insight: ${maximusInsight}`);
    if (teamNews?.length > 0) { lines.push('News:'); teamNews.slice(0, 3).forEach(n => lines.push(`- ${n.title}`)); }
    lines.push(`Team page: ${teamUrl}`, '');
  }
  lines.push('Open MLB Intelligence -> https://maximussports.ai/mlb', '', 'Not betting advice. Manage preferences: https://maximussports.ai/settings');
  return lines.join('\n');
}
