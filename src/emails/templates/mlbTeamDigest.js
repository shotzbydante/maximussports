/**
 * MLB Team Digest — personalized team intel (light mode).
 *
 * @param {object} data
 * @param {string} [data.displayName]
 * @param {Array}  data.teamDigests
 * @param {number} [data.totalTeamCount]
 */

import { MlbEmailShell, mlbHeroBlock, mlbSectionLabel, mlbGlassCard, mlbDividerRow, mlbSpacerRow, mlbTeamLogoImg } from '../MlbEmailShell.js';
import { TEAM_DIGEST_MAX_TEAMS } from '../../../api/_lib/teamDigest.js';
import { mlbTeamDigestSubject } from '../helpers/subjectGenerator.js';

export function getSubject(data = {}) {
  return mlbTeamDigestSubject(data);
}

export function getPreviewText(data = {}) {
  const { teamDigests = [] } = data;
  if (teamDigests.length === 0) return '\u26BE Your Maximus Sports MLB team digest is ready.';
  const names = teamDigests.slice(0, 2).map(d => d.team.name).join(' & ');
  return `\u26BE Full intel for ${names} \u2014 schedule, trends, and more.`;
}

function renderTeamSection(digest, isFirst = false) {
  const { team, game, ats, teamNews, teamUrl, aiSummary, maximusInsight } = digest;
  const teamName = team.name || 'Your Team';
  const logoHtml = mlbTeamLogoImg(team, 36);

  const teamHero = `
<tr>
  <td style="padding:${isFirst ? '0' : '14px'} 24px 12px;" class="section-td">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
      <tr>
        <td valign="middle" style="width:44px;padding-right:12px;">${logoHtml}</td>
        <td valign="middle">
          <a href="${teamUrl}" style="font-size:18px;font-weight:800;color:#1a1a2e;text-decoration:none;letter-spacing:-0.02em;font-family:'DM Sans',Arial,Helvetica,sans-serif;">${teamName}</a>
          ${team.conference ? `<div style="margin-top:3px;font-size:12px;color:#8a94a6;font-family:'DM Sans',Arial,sans-serif;">${team.conference}</div>` : ''}
        </td>
        <td align="right" valign="middle">
          <a href="${teamUrl}" style="font-size:12px;color:#c41e3a;text-decoration:none;font-weight:600;font-family:'DM Sans',Arial,sans-serif;">Full page &rarr;</a>
        </td>
      </tr>
    </table>
  </td>
</tr>`;

  const insightText = maximusInsight || aiSummary || null;
  const summarySection = insightText ? `
<tr>
  <td style="padding:0 24px 10px;" class="section-td">
    <div style="margin-bottom:6px;">${mlbSectionLabel('MAXIMUS INSIGHT')}</div>
    <p style="margin:0;font-size:14px;color:#4a5568;line-height:1.6;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-style:italic;">${insightText}</p>
  </td>
</tr>` : '';

  let gameSection = '';
  if (game) {
    const status = game.gameStatus || game.status || 'Scheduled';
    const isFinal = /final|postponed/i.test(status);
    const isLive = /\d|halftime|progress/i.test(status);
    let scoreDisplay = '';
    if (isFinal && game.homeScore != null) {
      scoreDisplay = `<span style="color:#c41e3a;font-weight:700;">${game.awayScore} \u2013 ${game.homeScore}</span> <span style="color:#8a94a6;">Final</span>`;
    } else if (isLive) {
      scoreDisplay = `<span style="color:#c41e3a;font-weight:700;">LIVE</span> <span style="color:#4a5568;">${status}</span>`;
    } else {
      scoreDisplay = `<span style="color:#8a94a6;">${status}</span>`;
    }
    gameSection = `
<tr>
  <td style="padding:0 24px 10px;" class="section-td">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
           style="background-color:#f9fafb;border:1px solid #e8ecf0;border-left:3px solid #c41e3a;border-radius:6px;border-collapse:collapse;">
      <tr>
        <td style="padding:12px 16px;">
          <p style="margin:0 0 4px;font-size:14px;font-weight:600;color:#1a1a2e;font-family:'DM Sans',Arial,sans-serif;">${game.awayTeam || 'Away'} @ ${game.homeTeam || 'Home'}</p>
          <p style="margin:0;font-size:13px;font-family:'DM Sans',Arial,sans-serif;">${scoreDisplay}${game.spread ? `<span style="color:#8a94a6;margin-left:8px;">Spread: ${game.spread}</span>` : ''}</p>
        </td>
      </tr>
    </table>
  </td>
</tr>`;
  } else {
    gameSection = `
<tr>
  <td style="padding:0 24px 10px;" class="section-td">
    <p style="margin:0;font-size:13px;color:#8a94a6;font-family:'DM Sans',Arial,sans-serif;">No game today \u2014 <a href="${teamUrl}" style="color:#c41e3a;text-decoration:none;font-weight:600;">view full schedule &rarr;</a></p>
  </td>
</tr>`;
  }

  let atsSection = '';
  if (ats) {
    const trendLabel = ats.trend === 'hot' ? 'Hot ATS streak' : ats.trend === 'cold' ? 'ATS fade watch' : 'ATS Trend';
    const trendColor = ats.trend === 'hot' ? '#16a34a' : ats.trend === 'cold' ? '#dc6b20' : '#c41e3a';
    const coverStr = ats.pct != null ? `${ats.pct}% cover rate` : '';
    const recordStr = ats.record ? ` (${ats.record} ATS)` : '';
    atsSection = `
<tr>
  <td style="padding:0 24px 10px;" class="section-td">
    <div style="margin-bottom:6px;">${mlbSectionLabel('ATS EDGE')}</div>
    <p style="margin:0;font-size:14px;font-family:'DM Sans',Arial,sans-serif;">
      <span style="font-weight:600;color:${trendColor};">${trendLabel}</span>
      ${coverStr ? `<span style="color:#4a5568;"> &middot; ${coverStr}${recordStr}</span>` : ''}
    </p>
  </td>
</tr>`;
  }

  let newsSection = '';
  if (teamNews.length > 0) {
    const newsItems = teamNews.slice(0, 4).map(item => {
      const title = item.title || 'Read more';
      const source = item.source || '';
      const link = item.link || teamUrl;
      return `<tr><td style="padding:6px 0;border-bottom:1px solid #e8ecf0;">
        <a href="${link}" target="_blank" style="font-size:13px;color:#1a1a2e;text-decoration:none;line-height:1.45;font-family:'DM Sans',Arial,sans-serif;" class="news-item">${title}</a>
        ${source ? `<span style="font-size:11px;color:#8a94a6;"> \u2014 ${source}</span>` : ''}
      </td></tr>`;
    }).join('');
    newsSection = `
<tr>
  <td style="padding:0 24px 10px;" class="section-td">
    <div style="margin-bottom:8px;">${mlbSectionLabel('TEAM NEWS')}</div>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
      ${newsItems}
    </table>
  </td>
</tr>`;
  }

  return [teamHero, summarySection, gameSection, atsSection, newsSection].filter(Boolean).join('\n');
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
    <p style="margin:0;font-size:15px;color:#4a5568;line-height:1.65;font-family:'DM Sans',Arial,Helvetica,sans-serif;">
      Hey ${greetingName}, pin your favorite MLB teams in Settings. Your Team Digest will cover every pinned team with full intel, trends, and news.
    </p>
  </td>
</tr>`;
    return MlbEmailShell({ content, previewText: '\u26BE Pin MLB teams to get your personalized digest.', ctaUrl: 'https://maximussports.ai/settings', ctaLabel: 'Pin teams in Settings &rarr;' });
  }

  const heroLine = teamDigests.length === 1 ? `${teamDigests[0].team.name} \u2014 your full digest.` : `${teamDigests.length} teams, one read.`;
  const divider = `\n${mlbDividerRow()}\n${mlbSpacerRow(6)}\n`;
  const teamSections = teamDigests.slice(0, TEAM_DIGEST_MAX_TEAMS).map((d, i) => renderTeamSection(d, i === 0)).join(divider);

  const remaining = totalTeamCount - Math.min(teamDigests.length, TEAM_DIGEST_MAX_TEAMS);
  const truncNote = remaining > 0 ? `
<tr>
  <td style="padding:0 24px 10px;text-align:center;" class="section-td">
    <p style="margin:0;font-size:12px;color:#8a94a6;font-family:'DM Sans',Arial,sans-serif;">
      ${remaining} more team${remaining !== 1 ? 's' : ''} in your digest \u2014
      <a href="https://maximussports.ai/mlb" style="color:#c41e3a;text-decoration:none;font-weight:600;">view all &rarr;</a>
    </p>
  </td>
</tr>` : '';

  const content = `
${mlbHeroBlock({ line: heroLine, sublabel: today })}
<tr>
  <td style="padding:10px 24px 16px;" class="intro-td">
    <p style="margin:0;font-size:15px;color:#4a5568;line-height:1.65;font-family:'DM Sans',Arial,Helvetica,sans-serif;">
      Good evening, ${greetingName}. Your personalized MLB team intel for today.
    </p>
  </td>
</tr>
<tr>
  <td style="padding:0 24px;" class="divider-td">
    <div style="height:1px;background-color:#e8ecf0;font-size:0;line-height:0;">&nbsp;</div>
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
    const { team, game, ats, teamNews, teamUrl, maximusInsight } = digest;
    lines.push(`\u2501\u2501\u2501 ${team.name} \u2501\u2501\u2501`);
    if (game) {
      const s = game.gameStatus || game.status || 'Scheduled';
      if (/final/i.test(s) && game.homeScore != null) lines.push(`Result: ${game.awayTeam} ${game.awayScore} @ ${game.homeTeam} ${game.homeScore} \u2014 Final`);
      else lines.push(`Upcoming: ${game.awayTeam} @ ${game.homeTeam}`);
    }
    if (ats) lines.push(`ATS: ${ats.trend === 'hot' ? 'hot streak' : ats.trend === 'cold' ? 'fade watch' : 'neutral'}${ats.pct != null ? ` (${ats.pct}% cover)` : ''}`);
    if (maximusInsight) lines.push(`Insight: ${maximusInsight}`);
    if (teamNews.length > 0) { lines.push('News:'); teamNews.slice(0, 3).forEach(n => lines.push(`- ${n.title}`)); }
    lines.push(`Team page: ${teamUrl}`, '');
  }
  lines.push('Open MLB Intelligence -> https://maximussports.ai/mlb', '', 'Not betting advice. Manage preferences: https://maximussports.ai/settings');
  return lines.join('\n');
}
