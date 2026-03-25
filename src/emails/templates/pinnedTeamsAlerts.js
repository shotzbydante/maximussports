/**
 * Pinned Teams Alerts — editorial newsletter template.
 * Sent at 3:45 PM PT. Focused on user's pinned teams.
 *
 * @param {object} data
 * @param {string} [data.displayName]
 * @param {Array}  [data.pinnedTeams]    — [{ name, slug, tier }]
 * @param {Array}  [data.scoresToday]
 * @param {Array}  [data.headlines]
 * @param {string} [data.maximusNote]
 */

import { EmailShell, heroBlock, sectionCard, sectionLabel, teamLogoImg } from '../EmailShell.js';
import { getTeamTodaySummary } from '../../../api/_lib/teamSchedule.js';
import { renderEmailGameCard } from '../../../api/_lib/emailGameCards.js';
import { getTeamAts } from '../../../api/_lib/teamDigest.js';
import { pinnedTeamsSubject } from '../helpers/subjectGenerator.js';

export function getSubject(data = {}) {
  return pinnedTeamsSubject(data);
}

export function getPreviewText(data = {}) {
  const { pinnedTeams = [] } = data;
  if (pinnedTeams.length === 0) return 'Pin teams on Maximus Sports to get personalized alerts.';
  const names = pinnedTeams.slice(0, 2).map(t => t.name).join(' & ');
  return `ATS trends, scores, and intel for ${names}${pinnedTeams.length > 2 ? ` + ${pinnedTeams.length - 2} more` : ''}.`;
}

export function renderHTML(data = {}) {
  const {
    displayName,
    pinnedTeams = [],
    scoresToday = [],
    headlines = [],
    atsLeaders = {},
    maximusNote = '',
  } = data;

  const firstName = displayName ? displayName.split(' ')[0] : null;
  const greetingName = firstName || 'there';
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  if (pinnedTeams.length === 0) {
    const content = `
${heroBlock({ line: `Pin teams to get personalized alerts.`, sublabel: today })}
<tr>
  <td style="padding:10px 24px 16px;" class="intro-td">
    <p style="margin:0;font-size:15px;color:#4a5568;line-height:1.65;font-family:'DM Sans',Arial,Helvetica,sans-serif;">
      Hey ${greetingName}, head to Maximus Sports and pin your favorite teams. You\u2019ll get daily intel, scores, and ATS breakdowns for every squad you follow.
    </p>
  </td>
</tr>`;
    return EmailShell({ content, previewText: 'Pin teams on Maximus Sports to get personalized alerts.' });
  }

  // Team rows with ATS intelligence
  const teamRows = pinnedTeams.slice(0, 5).map(team => {
    const teamSlug = team.slug || '';
    const teamName = team.name || teamSlug || 'Your Team';
    const teamUrl = teamSlug ? `https://maximussports.ai/teams/${teamSlug}` : 'https://maximussports.ai';
    const { hasGame, game, gameInfo } = getTeamTodaySummary(team, scoresToday);
    const logoHtml = teamLogoImg(team, 22);
    const ats = getTeamAts(team, atsLeaders);

    const gameContent = hasGame && game
      ? renderEmailGameCard(game, { compact: true })
      : `<div style="margin-top:3px;font-size:12px;color:#8a94a6;font-family:'DM Sans',Arial,sans-serif;">${gameInfo}</div>`;

    let atsLine = '';
    if (ats) {
      const trendColor = ats.trend === 'hot' ? '#16a34a' : ats.trend === 'cold' ? '#dc6b20' : '#2d6ca8';
      const trendText = ats.trend === 'hot' ? 'Covering' : ats.trend === 'cold' ? 'Fade watch' : 'ATS';
      atsLine = `<div style="margin-top:4px;font-size:11px;font-family:'DM Sans',Arial,sans-serif;">
        <span style="color:${trendColor};font-weight:600;">${trendText}</span>
        ${ats.pct != null ? `<span style="color:#8a94a6;"> &middot; ${ats.pct}% cover rate</span>` : ''}
        ${ats.record ? `<span style="color:#8a94a6;"> &middot; ${ats.record} ATS</span>` : ''}
      </div>`;
    }

    return `<tr>
  <td style="padding:12px 0;border-bottom:1px solid #e8ecf0;" class="row-pad">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
      <tr>
        <td valign="top" style="width:28px;padding-right:10px;padding-top:2px;">${logoHtml}</td>
        <td valign="top">
          <a href="${teamUrl}" style="font-size:14px;font-weight:700;color:#1a1a2e;text-decoration:none;font-family:'DM Sans',Arial,Helvetica,sans-serif;line-height:1.35;">${teamName}</a>
          ${atsLine}
          <div style="margin-top:6px;">${gameContent}</div>
        </td>
        <td align="right" valign="top" style="padding-left:8px;white-space:nowrap;">
          <a href="${teamUrl}" style="font-size:12px;color:#2d6ca8;text-decoration:none;font-weight:600;font-family:'DM Sans',Arial,Helvetica,sans-serif;">View &rarr;</a>
        </td>
      </tr>
    </table>
  </td>
</tr>`;
  }).join('');

  // Filtered headlines
  const teamKeywords = pinnedTeams.flatMap(t => {
    const words = (t.name || '').split(' ');
    return [t.name?.toLowerCase(), words[0]?.toLowerCase(), words[words.length - 1]?.toLowerCase()].filter(Boolean);
  });
  const filteredNews = headlines.filter(h =>
    teamKeywords.some(kw => (h.title || '').toLowerCase().includes(kw))
  );
  const newsToShow = filteredNews.length > 0 ? filteredNews : headlines;

  let newsSection = '';
  if (newsToShow.length > 0) {
    const newsItems = newsToShow.slice(0, 4).map(h => {
      const link = h.link || 'https://maximussports.ai';
      const source = h.source || '';
      return `<tr><td style="padding:6px 0;border-bottom:1px solid #e8ecf0;">
      <a href="${link}" style="font-size:13px;color:#1a1a2e;text-decoration:none;line-height:1.45;font-family:'DM Sans',Arial,sans-serif;" target="_blank">${h.title || 'No title'}</a>
      ${source ? `<span style="font-size:11px;color:#8a94a6;"> \u2014 ${source}</span>` : ''}
    </td></tr>`;
    }).join('');
    newsSection = `
<tr>
  <td style="padding:0 24px 14px;" class="section-td">
    <div style="margin-bottom:8px;">${sectionLabel('TEAM NEWS')}</div>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
      ${newsItems}
    </table>
  </td>
</tr>`;
  }

  const heroLine = pinnedTeams.length === 1
    ? `${pinnedTeams[0].name} \u2014 here\u2019s today\u2019s intel.`
    : `Your ${pinnedTeams.length} teams \u2014 here\u2019s today\u2019s intel.`;

  const maximusNoteSection = maximusNote ? sectionCard({
    pillLabel: 'MAXIMUS SAYS',
    pillType: 'intel',
    headline: null,
    body: maximusNote,
  }) : '';

  const content = `
${heroBlock({ line: heroLine, sublabel: today })}

<tr>
  <td style="padding:10px 24px 16px;" class="intro-td">
    <p style="margin:0;font-size:15px;color:#4a5568;line-height:1.65;font-family:'DM Sans',Arial,Helvetica,sans-serif;">
      Good afternoon, ${greetingName}. Here\u2019s the latest on the teams you\u2019re following.
    </p>
  </td>
</tr>

<tr>
  <td style="padding:0 24px;" class="divider-td">
    <div style="height:1px;background-color:#e8ecf0;font-size:0;line-height:0;">&nbsp;</div>
  </td>
</tr>
<tr><td style="height:14px;font-size:0;line-height:0;">&nbsp;</td></tr>

<tr>
  <td style="padding:0 24px 14px;" class="section-td">
    <div style="margin-bottom:4px;">${sectionLabel('YOUR TEAMS')}</div>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
      ${teamRows}
    </table>
    <div style="margin-top:8px;">
      <a href="https://maximussports.ai/teams" style="font-size:12px;color:#2d6ca8;text-decoration:none;font-weight:600;font-family:'DM Sans',Arial,sans-serif;">All team pages &rarr;</a>
    </div>
  </td>
</tr>

${maximusNoteSection}

${newsSection}`;

  return EmailShell({
    content,
    previewText: getPreviewText(data),
  });
}

export function renderText(data = {}) {
  const { displayName, pinnedTeams = [], scoresToday = [], maximusNote = '' } = data;
  const name = displayName ? displayName.split(' ')[0] : 'there';
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const lines = [
    'MAXIMUS SPORTS \u2014 Team Alerts',
    today,
    '',
    `Hey ${name}, here\u2019s your daily intel for your pinned teams.`,
    '',
    ...pinnedTeams.slice(0, 5).map(t => {
      const { gameInfoText } = getTeamTodaySummary(t, scoresToday);
      return `${t.name}: ${gameInfoText}`;
    }),
    '',
    ...(maximusNote ? ['MAXIMUS SAYS', maximusNote, ''] : []),
    'Open Maximus Sports -> https://maximussports.ai',
    '',
    'Not betting advice. Manage preferences: https://maximussports.ai/settings',
  ];
  return lines.join('\n');
}
