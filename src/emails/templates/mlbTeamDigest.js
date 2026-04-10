/**
 * MLB Team Digest — personalized team intel for pinned MLB teams.
 *
 * Design: dark navy + deep red, glassmorphism cards.
 * Per-team sections with game, ATS, news, and insights.
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
  const { team, game, rank, ats, teamNews, teamVideos, teamUrl, aiSummary, maximusInsight } = digest;
  const teamName = team.name || 'Your Team';
  const logoHtml = mlbTeamLogoImg(team, 36);

  // Team hero
  const teamHero = `
<tr>
  <td style="padding:${isFirst ? '0' : '14px'} 24px 12px;" class="section-td">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
      <tr>
        <td valign="middle" style="width:44px;padding-right:12px;">${logoHtml}</td>
        <td valign="middle">
          <a href="${teamUrl}" style="font-size:18px;font-weight:800;color:#f0f4f8;text-decoration:none;letter-spacing:-0.02em;font-family:'DM Sans',Arial,Helvetica,sans-serif;">${teamName}</a>
          ${team.conference ? `<div style="margin-top:3px;font-size:12px;color:#64748b;font-family:'DM Sans',Arial,sans-serif;">${team.conference}</div>` : ''}
        </td>
        <td align="right" valign="middle">
          <a href="${teamUrl}" style="font-size:12px;color:#e8364f;text-decoration:none;font-weight:600;font-family:'DM Sans',Arial,sans-serif;">Full page &rarr;</a>
        </td>
      </tr>
    </table>
  </td>
</tr>`;

  // Maximus Insight
  const insightText = maximusInsight || aiSummary || null;
  const summarySection = insightText ? `
<tr>
  <td style="padding:0 24px 10px;" class="section-td">
    <div style="margin-bottom:6px;">${mlbSectionLabel('MAXIMUS INSIGHT')}</div>
    <p style="margin:0;font-size:14px;color:#94a3b8;line-height:1.6;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-style:italic;">${insightText}</p>
  </td>
</tr>` : '';

  // Game card
  let gameSection = '';
  if (game) {
    const status = game.gameStatus || game.status || 'Scheduled';
    const isFinal = /final|postponed/i.test(status);
    const isLive = /\d|halftime|progress/i.test(status);
    let scoreDisplay = '';
    if (isFinal && game.homeScore != null) {
      scoreDisplay = `<span style="color:#e8364f;font-weight:700;">${game.awayScore} \u2013 ${game.homeScore}</span> <span style="color:#64748b;">Final</span>`;
    } else if (isLive) {
      scoreDisplay = `<span style="color:#e8364f;font-weight:700;">LIVE</span> <span style="color:#94a3b8;">${status}</span>`;
    } else {
      scoreDisplay = `<span style="color:#64748b;">${status}</span>`;
    }
    gameSection = `
<tr>
  <td style="padding:0 24px 10px;" class="section-td">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
           style="background-color:#1a2236;border:1px solid #2a1520;border-radius:8px;border-collapse:collapse;">
      <tr>
        <td style="padding:12px 16px;">
          <p style="margin:0 0 4px;font-size:14px;font-weight:600;color:#f0f4f8;font-family:'DM Sans',Arial,sans-serif;">
            ${game.awayTeam || 'Away'} @ ${game.homeTeam || 'Home'}
          </p>
          <p style="margin:0;font-size:13px;font-family:'DM Sans',Arial,sans-serif;">
            ${scoreDisplay}
            ${game.spread ? `<span style="color:#64748b;margin-left:8px;">Spread: ${game.spread}</span>` : ''}
          </p>
        </td>
      </tr>
    </table>
  </td>
</tr>`;
  } else {
    gameSection = `
<tr>
  <td style="padding:0 24px 10px;" class="section-td">
    <p style="margin:0;font-size:13px;color:#64748b;font-family:'DM Sans',Arial,sans-serif;">No game today \u2014 <a href="${teamUrl}" style="color:#e8364f;text-decoration:none;font-weight:600;">view full schedule &rarr;</a></p>
  </td>
</tr>`;
  }

  // ATS intel
  let atsSection = '';
  if (ats) {
    const trendLabel = ats.trend === 'hot' ? 'Hot ATS streak' : ats.trend === 'cold' ? 'ATS fade watch' : 'ATS Trend';
    const trendColor = ats.trend === 'hot' ? '#22c55e' : ats.trend === 'cold' ? '#f97316' : '#e8364f';
    const coverStr = ats.pct != null ? `${ats.pct}% cover rate` : '';
    const recordStr = ats.record ? ` (${ats.record} ATS)` : '';
    atsSection = `
<tr>
  <td style="padding:0 24px 10px;" class="section-td">
    <div style="margin-bottom:6px;">${mlbSectionLabel('ATS EDGE')}</div>
    <p style="margin:0;font-size:14px;font-family:'DM Sans',Arial,sans-serif;">
      <span style="font-weight:600;color:${trendColor};">${trendLabel}</span>
      ${coverStr ? `<span style="color:#94a3b8;"> &middot; ${coverStr}${recordStr}</span>` : ''}
    </p>
  </td>
</tr>`;
  }

  // Team News
  let newsSection = '';
  if (teamNews.length > 0) {
    const newsItems = teamNews.slice(0, 4).map(item => {
      const title = item.title || 'Read more';
      const source = item.source || '';
      const link = item.link || teamUrl;
      return `<tr><td style="padding:6px 0;border-bottom:1px solid #1e293b;">
        <a href="${link}" target="_blank" style="font-size:13px;color:#f0f4f8;text-decoration:none;line-height:1.45;font-family:'DM Sans',Arial,sans-serif;" class="news-item">${title}</a>
        ${source ? `<span style="font-size:11px;color:#64748b;"> \u2014 ${source}</span>` : ''}
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
${mlbHeroBlock({ line: `Pin MLB teams to get your digest`, sublabel: today })}
<tr>
  <td style="padding:10px 24px 16px;" class="intro-td">
    <p style="margin:0;font-size:15px;color:#94a3b8;line-height:1.65;font-family:'DM Sans',Arial,Helvetica,sans-serif;">
      Hey ${greetingName}, pin your favorite MLB teams in Settings. Your Team Digest will automatically cover every team you pin with full intel, trends, and news.
    </p>
  </td>
</tr>`;
    return MlbEmailShell({
      content,
      previewText: '\u26BE Pin MLB teams on Maximus Sports to get your personalized digest.',
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

  const divider = `\n${mlbDividerRow()}\n${mlbSpacerRow(6)}\n`;
  const teamSections = teamDigests
    .slice(0, TEAM_DIGEST_MAX_TEAMS)
    .map((digest, i) => renderTeamSection(digest, i === 0))
    .join(divider);

  const remainingCount = totalTeamCount - Math.min(teamDigests.length, TEAM_DIGEST_MAX_TEAMS);
  const truncationNote = remainingCount > 0 ? `
<tr>
  <td style="padding:0 24px 10px;text-align:center;" class="section-td">
    <p style="margin:0;font-size:12px;color:#64748b;font-family:'DM Sans',Arial,sans-serif;">
      ${remainingCount} more team${remainingCount !== 1 ? 's' : ''} in your digest \u2014
      <a href="https://maximussports.ai/mlb" style="color:#e8364f;text-decoration:none;font-weight:600;">view all &rarr;</a>
    </p>
  </td>
</tr>` : '';

  const content = `
${mlbHeroBlock({ line: heroLine, sublabel: today })}
<tr>
  <td style="padding:10px 24px 16px;" class="intro-td">
    <p style="margin:0;font-size:15px;color:#94a3b8;line-height:1.65;font-family:'DM Sans',Arial,Helvetica,sans-serif;">
      Good evening, ${greetingName}. Your personalized MLB team intel for today.
    </p>
  </td>
</tr>

<tr>
  <td style="padding:0 24px;" class="divider-td">
    <div style="height:1px;background-color:#1e293b;font-size:0;line-height:0;">&nbsp;</div>
  </td>
</tr>

${teamSections}
${truncationNote}`;

  const ctaUrl = teamDigests.length === 1 ? teamDigests[0].teamUrl : 'https://maximussports.ai/mlb';
  const ctaLabel = teamDigests.length === 1
    ? `Open ${teamDigests[0].team.name} page &rarr;`
    : 'View all MLB teams &rarr;';

  return MlbEmailShell({
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
    '\u26BE MAXIMUS SPORTS \u2014 MLB Team Digest',
    today,
    '',
    `Hey ${name}, here\u2019s your MLB team digest for today.`,
    '',
  ];

  for (const digest of teamDigests.slice(0, TEAM_DIGEST_MAX_TEAMS)) {
    const { team, game, ats, teamNews, teamUrl, maximusInsight } = digest;
    lines.push(`\u2501\u2501\u2501 ${team.name} \u2501\u2501\u2501`);

    if (game) {
      const statusStr = game.gameStatus || game.status || 'Scheduled';
      const isFinal = /final|postponed/i.test(statusStr);
      if (isFinal && game.homeScore != null) {
        lines.push(`Result: ${game.awayTeam} ${game.awayScore} @ ${game.homeTeam} ${game.homeScore} \u2014 Final`);
      } else {
        lines.push(`Upcoming: ${game.awayTeam} @ ${game.homeTeam}`);
      }
    }

    if (ats) {
      const trendStr = ats.trend === 'hot' ? 'hot streak' : ats.trend === 'cold' ? 'fade watch' : 'neutral';
      lines.push(`ATS: ${trendStr}${ats.pct != null ? ` (${ats.pct}% cover)` : ''}${ats.record ? ` \u2014 ${ats.record}` : ''}`);
    }

    if (maximusInsight) {
      lines.push(`Maximus Insight: ${maximusInsight}`);
    }

    if (teamNews.length > 0) {
      lines.push('Latest News:');
      teamNews.slice(0, 3).forEach(n => lines.push(`- ${n.title || 'Read more'}`));
    }

    lines.push(`Team page: ${teamUrl}`);
    lines.push('');
  }

  lines.push('Open MLB Intelligence -> https://maximussports.ai/mlb');
  lines.push('');
  lines.push('Not betting advice. Manage preferences: https://maximussports.ai/settings');

  return lines.join('\n');
}
