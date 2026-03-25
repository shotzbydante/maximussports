/**
 * Team Digest — editorial newsletter template.
 * Sent at 7:30 PM PT. Full team coverage for selected teams.
 *
 * @param {object} data
 * @param {string} [data.displayName]
 * @param {Array}  data.teamDigests       — array of per-team digest objects
 * @param {number} [data.totalTeamCount]
 */

import { EmailShell, heroBlock, sectionLabel, teamLogoImg, spacerRow, dividerRow } from '../EmailShell.js';
import { renderEmailGameCard } from '../../../api/_lib/emailGameCards.js';
import { renderEmailVideoList } from '../../../api/_lib/videoCards.js';
import { TEAM_DIGEST_MAX_TEAMS } from '../../../api/_lib/teamDigest.js';
import { getTeamTodaySummary } from '../../../api/_lib/teamSchedule.js';
import { teamDigestSubject } from '../helpers/subjectGenerator.js';

export function getSubject(data = {}) {
  return teamDigestSubject(data);
}

export function getPreviewText(data = {}) {
  const { teamDigests = [] } = data;
  if (teamDigests.length === 0) return 'Your Maximus Sports team digest is ready.';
  const names = teamDigests.slice(0, 2).map(d => d.team.name).join(' & ');
  return `Full intel for ${names} \u2014 schedule, ATS, news, and more.`;
}

function renderTeamSection(digest, isFirst = false) {
  const { team, game, rank, ats, teamNews, teamVideos, teamUrl, aiSummary, maximusInsight } = digest;
  const teamName = team.name || 'Your Team';
  const logoHtml = teamLogoImg(team, 36, 'https://maximussports.ai');

  const rankBadge = rank
    ? ` <span style="font-size:11px;font-weight:700;color:#2d6ca8;font-family:'DM Sans',Arial,sans-serif;">#${rank} AP</span>`
    : '';

  // Team hero
  const teamHero = `
<tr>
  <td style="padding:${isFirst ? '0' : '14px'} 24px 12px;" class="section-td">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
      <tr>
        <td valign="middle" style="width:44px;padding-right:12px;">${logoHtml}</td>
        <td valign="middle">
          <a href="${teamUrl}" style="font-size:18px;font-weight:800;color:#1a1a2e;text-decoration:none;letter-spacing:-0.02em;font-family:'DM Sans',Arial,Helvetica,sans-serif;">${teamName}</a>${rankBadge}
          ${team.conference ? `<div style="margin-top:3px;font-size:12px;color:#8a94a6;font-family:'DM Sans',Arial,sans-serif;">${team.conference}</div>` : ''}
        </td>
        <td align="right" valign="middle">
          <a href="${teamUrl}" style="font-size:12px;color:#2d6ca8;text-decoration:none;font-weight:600;font-family:'DM Sans',Arial,sans-serif;">Full page &rarr;</a>
        </td>
      </tr>
    </table>
  </td>
</tr>`;

  // Maximus Insight (AI summary or generated blurb)
  const insightText = maximusInsight || aiSummary || null;
  const summarySection = insightText ? `
<tr>
  <td style="padding:0 24px 10px;" class="section-td">
    <div style="margin-bottom:6px;">${sectionLabel('MAXIMUS INSIGHT')}</div>
    <p style="margin:0;font-size:14px;color:#4a5568;line-height:1.6;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-style:italic;">${insightText}</p>
  </td>
</tr>` : '';

  // Game card
  let gameSection = '';
  if (game) {
    const cardHtml = renderEmailGameCard(game, { compact: false });
    gameSection = `
<tr>
  <td style="padding:0 24px 10px;" class="section-td">
    ${cardHtml}
  </td>
</tr>`;
  } else {
    gameSection = `
<tr>
  <td style="padding:0 24px 10px;" class="section-td">
    <p style="margin:0;font-size:13px;color:#8a94a6;font-family:'DM Sans',Arial,sans-serif;">No game today \u2014 <a href="${teamUrl}" style="color:#2d6ca8;text-decoration:none;font-weight:600;">view full schedule &rarr;</a></p>
  </td>
</tr>`;
  }

  // ATS intel
  let atsSection = '';
  if (ats) {
    const trendLabel = ats.trend === 'hot' ? 'Hot ATS streak' : ats.trend === 'cold' ? 'ATS fade watch' : 'ATS Trend';
    const trendColor = ats.trend === 'hot' ? '#16a34a' : ats.trend === 'cold' ? '#dc6b20' : '#2d6ca8';
    const coverStr = ats.pct != null ? `${ats.pct}% cover rate` : '';
    const recordStr = ats.record ? ` (${ats.record} ATS)` : '';
    atsSection = `
<tr>
  <td style="padding:0 24px 10px;" class="section-td">
    <div style="margin-bottom:6px;">${sectionLabel('ATS EDGE')}</div>
    <p style="margin:0;font-size:14px;font-family:'DM Sans',Arial,sans-serif;">
      <span style="font-weight:600;color:${trendColor};">${trendLabel}</span>
      ${coverStr ? `<span style="color:#4a5568;"> &middot; ${coverStr}${recordStr}</span>` : ''}
    </p>
  </td>
</tr>`;
  }

  // Team News
  let newsSection = '';
  if (teamNews.length > 0) {
    const newsItems = teamNews.slice(0, 5).map(item => {
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
    <div style="margin-bottom:8px;">${sectionLabel('TEAM NEWS')}</div>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
      ${newsItems}
    </table>
  </td>
</tr>`;
  }

  // Videos
  let videosSection = '';
  if (teamVideos.length > 0) {
    const videoRows = renderEmailVideoList(teamVideos, { max: 3, showThumb: true });
    if (videoRows) {
      videosSection = `
<tr>
  <td style="padding:0 24px 4px;" class="section-td">
    <div style="margin-bottom:8px;">${sectionLabel('VIDEOS')}</div>
  </td>
</tr>
${videoRows}`;
    }
  }

  return [
    teamHero,
    summarySection,
    gameSection,
    atsSection,
    newsSection,
    videosSection,
  ].filter(Boolean).join('\n');
}

export function renderHTML(data = {}) {
  const {
    displayName,
    teamDigests    = [],
    totalTeamCount = teamDigests.length,
  } = data;

  const firstName   = displayName ? displayName.split(' ')[0] : null;
  const greetingName = firstName || 'there';
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  if (teamDigests.length === 0) {
    const content = `
${heroBlock({ line: `Pin teams to get your digest`, sublabel: today })}
<tr>
  <td style="padding:10px 24px 16px;" class="intro-td">
    <p style="margin:0;font-size:15px;color:#4a5568;line-height:1.65;font-family:'DM Sans',Arial,Helvetica,sans-serif;">
      Hey ${greetingName}, pin your favorite teams in Settings on Maximus Sports. Your Team Digest will automatically cover every team you pin with full intel, ATS trends, and news.
    </p>
  </td>
</tr>`;
    return EmailShell({
      content,
      previewText: 'Pin teams on Maximus Sports to get your personalized digest.',
      ctaUrl: 'https://maximussports.ai/settings',
      ctaLabel: 'Pin teams in Settings &rarr;',
    });
  }

  let heroLine;
  if (teamDigests.length === 1) {
    heroLine = `${teamDigests[0].team.name} \u2014 your full digest.`;
  } else {
    heroLine = `${teamDigests.length} teams, one read.`;
  }

  const teamSections = teamDigests
    .slice(0, TEAM_DIGEST_MAX_TEAMS)
    .map((digest, i) => renderTeamSection(digest, i === 0))
    .join(`\n${dividerRow()}\n${spacerRow(6)}\n`);

  const remainingCount = totalTeamCount - Math.min(teamDigests.length, TEAM_DIGEST_MAX_TEAMS);
  const truncationNote = remainingCount > 0 ? `
<tr>
  <td style="padding:0 24px 10px;text-align:center;" class="section-td">
    <p style="margin:0;font-size:12px;color:#8a94a6;font-family:'DM Sans',Arial,sans-serif;">
      ${remainingCount} more team${remainingCount !== 1 ? 's' : ''} in your digest \u2014
      <a href="https://maximussports.ai/teams" style="color:#2d6ca8;text-decoration:none;font-weight:600;">view all &rarr;</a>
    </p>
  </td>
</tr>` : '';

  const content = `
${heroBlock({ line: heroLine, sublabel: today })}
<tr>
  <td style="padding:10px 24px 16px;" class="intro-td">
    <p style="margin:0;font-size:15px;color:#4a5568;line-height:1.65;font-family:'DM Sans',Arial,Helvetica,sans-serif;">
      Good evening, ${greetingName}. Your personalized team intel for today.
    </p>
  </td>
</tr>

<tr>
  <td style="padding:0 24px;" class="divider-td">
    <div style="height:1px;background-color:#e8ecf0;font-size:0;line-height:0;">&nbsp;</div>
  </td>
</tr>
<tr><td style="height:14px;font-size:0;line-height:0;">&nbsp;</td></tr>

${teamSections}
${truncationNote}`;

  const ctaUrl   = teamDigests.length === 1 ? teamDigests[0].teamUrl : 'https://maximussports.ai/teams';
  const ctaLabel = teamDigests.length === 1
    ? `Open ${teamDigests[0].team.name} page &rarr;`
    : 'View all team pages &rarr;';

  return EmailShell({
    content,
    previewText: getPreviewText(data),
    ctaUrl,
    ctaLabel,
  });
}

export function renderText(data = {}) {
  const { displayName, teamDigests = [] } = data;
  const name  = displayName ? displayName.split(' ')[0] : 'there';
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const lines = [
    'MAXIMUS SPORTS \u2014 Team Digest',
    today,
    '',
    `Hey ${name}, here\u2019s your team digest for today.`,
    '',
  ];

  for (const digest of teamDigests.slice(0, TEAM_DIGEST_MAX_TEAMS)) {
    const { team, game, ats, teamNews, teamUrl, maximusInsight } = digest;
    lines.push(`\u2501\u2501\u2501 ${team.name} \u2501\u2501\u2501`);

    if (game) {
      const statusStr = game.gameStatus || game.status || 'Scheduled';
      const isFinal = /final|postponed/i.test(statusStr);
      const isLive  = /\d|halftime|progress/i.test(statusStr);
      if (isFinal && game.homeScore != null) {
        lines.push(`Result: ${game.awayTeam} ${game.awayScore} @ ${game.homeTeam} ${game.homeScore} \u2014 Final`);
      } else if (isLive) {
        lines.push(`LIVE: ${game.awayTeam} @ ${game.homeTeam} \u2014 ${statusStr}`);
      } else {
        lines.push(`Upcoming: ${game.awayTeam} @ ${game.homeTeam}`);
      }
    }

    if (ats) {
      const trendStr = ats.trend === 'hot' ? 'hot streak' : ats.trend === 'cold' ? 'fade watch' : 'neutral';
      lines.push(`ATS: ${trendStr}${ats.pct != null ? ` (${ats.pct}% cover)` : ''}${ats.record ? ` \u2014 ${ats.record}` : ''}`);
    }

    if (maximusInsight) {
      lines.push('');
      lines.push(`Maximus Insight: ${maximusInsight}`);
    }

    if (teamNews.length > 0) {
      lines.push('');
      lines.push('Latest News:');
      teamNews.slice(0, 3).forEach(n => lines.push(`- ${n.title || 'Read more'}`));
    }

    lines.push(`Team page: ${teamUrl}`);
    lines.push('');
  }

  lines.push('Open Maximus Sports -> https://maximussports.ai');
  lines.push('');
  lines.push('Not betting advice. Manage preferences: https://maximussports.ai/settings');

  return lines.join('\n');
}
