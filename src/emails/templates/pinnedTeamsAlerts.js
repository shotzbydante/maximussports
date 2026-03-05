/**
 * Pinned Teams Alerts email template.
 * Sent once per day at 9:00 AM PST to subscribers with preferences.teamAlerts = true.
 *
 * @param {object} data
 * @param {string} [data.displayName]    — user's resolved display name
 * @param {Array}  [data.pinnedTeams]    — [{ name, slug, tier, logo? }]
 * @param {Array}  [data.scoresToday]    — today's games from ESPN
 * @param {Array}  [data.headlines]      — news headlines
 * @param {string} [data.maximusNote]    — short Maximus bot intel note (optional)
 */

import { EmailShell, heroBlock, sectionCard, pill, teamLogoImg } from '../EmailShell.js';
import { getTeamTodaySummary } from '../../../api/_lib/teamSchedule.js';

export function getSubject(data = {}) {
  const { pinnedTeams = [] } = data;
  if (pinnedTeams.length === 0) return 'Maximus Sports: Your teams alert for today';
  if (pinnedTeams.length === 1) return `Maximus Sports: ${pinnedTeams[0].name} — Today's Intel`;
  return `Maximus Sports: ${pinnedTeams[0].name} + ${pinnedTeams.length - 1} more — Team Alerts`;
}

export function renderHTML(data = {}) {
  const {
    displayName,
    pinnedTeams = [],
    scoresToday = [],
    headlines = [],
    maximusNote = '',
  } = data;

  const firstName = displayName ? displayName.split(' ')[0] : null;
  const greetingName = firstName ? `, ${firstName}` : '';
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  if (pinnedTeams.length === 0) {
    const content = `
${heroBlock({
      line: `Your Teams${greetingName}: Stay Sharp Today`,
      sublabel: today,
    })}
${sectionCard({
      pillLabel: 'INTEL',
      pillType: 'intel',
      headline: 'Pin Teams to Get Personalized Alerts',
      body: 'Head to Maximus Sports and pin your favorite teams. You\'ll get daily intel, scores, and ATS breakdowns for every squad you follow.',
    })}`;
    return EmailShell({ content, previewText: 'Pin teams on Maximus to get personalized alerts.' });
  }

  // ── Team rows
  const teamRows = pinnedTeams.slice(0, 5).map(team => {
    const teamSlug = team.slug || '';
    const teamName = team.name || teamSlug || 'Your Team';
    const teamUrl = teamSlug ? `https://maximussports.ai/teams/${teamSlug}` : 'https://maximussports.ai';

    const { gameInfo } = getTeamTodaySummary(team, scoresToday);
    const logoHtml = teamLogoImg(team, 22);

    return `<tr>
  <td style="padding:10px 18px;border-bottom:1px solid rgba(255,255,255,0.05);">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
      <tr>
        <td valign="middle" style="width:26px;padding-right:8px;">
          ${logoHtml}
        </td>
        <td valign="middle">
          <a href="${teamUrl}" style="font-size:13px;font-weight:700;color:#f0f4f8;text-decoration:none;font-family:'DM Sans',Arial,sans-serif;" class="text-md">${teamName}</a>
          <div style="margin-top:3px;">${gameInfo}</div>
        </td>
        <td align="right" valign="middle">
          <a href="${teamUrl}" style="font-size:11px;color:#3C79B4;text-decoration:none;font-weight:600;white-space:nowrap;">View &rarr;</a>
        </td>
      </tr>
    </table>
  </td>
</tr>`;
  }).join('');

  // ── Headlines filtered to pinned teams (use all headlines if none match)
  const teamKeywords = pinnedTeams.flatMap(t => {
    const words = (t.name || '').split(' ');
    return [t.name?.toLowerCase(), words[0]?.toLowerCase(), words[words.length - 1]?.toLowerCase()].filter(Boolean);
  });

  const filteredNews = headlines.filter(h =>
    teamKeywords.some(kw => (h.title || '').toLowerCase().includes(kw))
  );
  const newsToShow = filteredNews.length > 0 ? filteredNews : headlines;

  let newsItems = '';
  if (newsToShow.length > 0) {
    newsItems = newsToShow.slice(0, 4).map(h => {
      const link = h.link || 'https://maximussports.ai';
      const source = h.source || '';
      return `<a href="${link}" style="display:block;color:#8892a4;font-size:12px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.04);text-decoration:none;line-height:1.45;" target="_blank">
      <span style="color:#c0cad8;">${h.title || 'No title'}</span>${source ? `<span style="color:#4a5568;font-size:11px;"> &mdash; ${source}</span>` : ''}
    </a>`;
    }).join('');
  } else {
    newsItems = '<span style="color:#4a5568;font-size:12px;">No major team news at this hour.</span>';
  }

  const heroLine = pinnedTeams.length === 1
    ? `${pinnedTeams[0].name}${greetingName} &mdash; Here&rsquo;s today&rsquo;s intel.`
    : `Your ${pinnedTeams.length} Teams${greetingName} &mdash; Here&rsquo;s today&rsquo;s intel.`;

  // ── Optional "MAXIMUS SAYS" note
  const maximusNoteSection = maximusNote ? sectionCard({
    pillLabel: 'MAXIMUS SAYS',
    pillType: 'intel',
    headline: null,
    body: maximusNote,
  }) : '';

  const content = `
${heroBlock({ line: heroLine, sublabel: today })}

<tr>
  <td style="padding:0 28px 14px;" class="section-pad">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
           style="background:#111827;border:1px solid rgba(255,255,255,0.07);border-radius:8px;overflow:hidden;">
      <tr>
        <td style="padding:12px 18px 4px;" class="card-inner">
          <div style="margin-bottom:10px;">${pill('YOUR TEAMS', 'watch')}</div>
        </td>
      </tr>
      ${teamRows}
      <tr>
        <td style="padding:10px 18px 12px;">
          <a href="https://maximussports.ai/teams" style="font-size:11px;color:#3C79B4;text-decoration:none;font-weight:600;">View all team pages &rarr;</a>
        </td>
      </tr>
    </table>
  </td>
</tr>

${maximusNoteSection}

<tr>
  <td style="padding:0 28px 14px;" class="section-pad">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
           style="background:#111827;border:1px solid rgba(255,255,255,0.07);border-radius:8px;overflow:hidden;">
      <tr>
        <td style="padding:16px 18px 14px;" class="card-inner">
          <div style="margin-bottom:10px;">${pill('TEAM NEWS', 'headlines')}</div>
          ${newsItems}
        </td>
      </tr>
    </table>
  </td>
</tr>`;

  return EmailShell({
    content,
    previewText: `Daily intel for ${pinnedTeams.map(t => t.name).slice(0, 2).join(' & ')}. Games, news, and analysis — powered by Maximus Sports.`,
  });
}

export function renderText(data = {}) {
  const { displayName, pinnedTeams = [], scoresToday = [], maximusNote = '' } = data;
  const name = displayName ? displayName.split(' ')[0] : 'there';
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const lines = [
    `MAXIMUS SPORTS — Pinned Teams Alerts`,
    today,
    ``,
    `Hey ${name}, here's the daily rundown for your pinned teams.`,
    ``,
    ...pinnedTeams.slice(0, 5).map(t => {
      const { gameInfoText } = getTeamTodaySummary(t, scoresToday);
      return `${t.name}: ${gameInfoText}`;
    }),
    ``,
    ...(maximusNote ? [`MAXIMUS SAYS`, maximusNote, ``] : []),
    `Open Maximus → https://maximussports.ai`,
    ``,
    `Not betting advice. Manage preferences: https://maximussports.ai/settings`,
  ];
  return lines.join('\n');
}
