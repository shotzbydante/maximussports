/**
 * Pinned Teams Alerts email template.
 * Sent once per day at 9:00 AM PST to subscribers with preferences.teamAlerts = true.
 *
 * @param {object} data
 * @param {string} [data.displayName]
 * @param {Array}  [data.pinnedTeams]   — [{ name, slug, tier }]
 * @param {Array}  [data.scoresToday]
 * @param {Array}  [data.headlines]
 */

import { EmailShell, heroBlock, sectionCard, pill } from '../EmailShell.js';

export function getSubject(data = {}) {
  const { pinnedTeams = [] } = data;
  if (pinnedTeams.length === 0) return 'Maximus: Your teams alert for today';
  if (pinnedTeams.length === 1) return `Maximus: ${pinnedTeams[0].name} — Today's Intel`;
  return `Maximus: ${pinnedTeams[0].name} + ${pinnedTeams.length - 1} more — Team Alerts`;
}

export function renderHTML(data = {}) {
  const {
    displayName,
    pinnedTeams = [],
    scoresToday = [],
    headlines = [],
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

  // Team rows
  const teamRows = pinnedTeams.slice(0, 5).map(team => {
    const teamSlug = team.slug || '';
    const teamName = team.name || teamSlug || 'Your Team';
    const teamUrl = teamSlug ? `https://maximussports.ai/teams/${teamSlug}` : 'https://maximussports.ai';

    // Find today's game for this team
    const game = scoresToday.find(g =>
      (g.homeTeam || '').toLowerCase().includes(teamName.toLowerCase().split(' ').pop()) ||
      (g.awayTeam || '').toLowerCase().includes(teamName.toLowerCase().split(' ').pop())
    );

    let gameInfo = '';
    if (game) {
      const opponent = (game.homeTeam || '').toLowerCase().includes(teamName.toLowerCase().split(' ').pop())
        ? game.awayTeam
        : game.homeTeam;
      const status = game.status || 'Scheduled';
      gameInfo = `<span style="color:#5a9fd4;font-size:11px;font-weight:600;">vs ${opponent || 'TBD'} &mdash; ${status}</span>`;
    } else {
      gameInfo = `<span style="color:#4a5568;font-size:11px;">No game today</span>`;
    }

    return `<tr>
  <td style="padding:10px 20px;border-bottom:1px solid rgba(255,255,255,0.05);">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
      <tr>
        <td>
          <a href="${teamUrl}" style="font-size:13px;font-weight:700;color:#f0f4f8;text-decoration:none;font-family:'DM Sans',Arial,sans-serif;">${teamName}</a>
          <div style="margin-top:3px;">${gameInfo}</div>
        </td>
        <td align="right">
          <a href="${teamUrl}" style="font-size:11px;color:#3C79B4;text-decoration:none;font-weight:600;">View →</a>
        </td>
      </tr>
    </table>
  </td>
</tr>`;
  }).join('');

  // Headlines filtered to pinned teams (use all headlines if none match)
  const teamNames = pinnedTeams.map(t => (t.name || '').toLowerCase());
  const filteredNews = headlines.filter(h =>
    teamNames.some(n => (h.title || '').toLowerCase().includes(n.split(' ').pop()))
  );
  const newsToShow = filteredNews.length > 0 ? filteredNews : headlines;

  let newsItems = '';
  if (newsToShow.length > 0) {
    newsItems = newsToShow.slice(0, 4).map(h => {
      const link = h.link || 'https://maximussports.ai';
      const source = h.source || '';
      return `<a href="${link}" style="display:block;color:#8892a4;font-size:12px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.04);text-decoration:none;line-height:1.4;" target="_blank">
      <span style="color:#c0cad8;">${h.title || 'No title'}</span>${source ? `<span style="color:#4a5568;"> &mdash; ${source}</span>` : ''}
    </a>`;
    }).join('');
  } else {
    newsItems = '<span style="color:#4a5568;font-size:12px;">No major team news at this hour.</span>';
  }

  const heroLine = pinnedTeams.length === 1
    ? `${pinnedTeams[0].name}${greetingName} — Here&rsquo;s today&rsquo;s intel.`
    : `Your ${pinnedTeams.length} Teams${greetingName} — Here&rsquo;s today&rsquo;s intel.`;

  const content = `
${heroBlock({ line: heroLine, sublabel: today })}

<tr>
  <td style="padding:0 32px 16px;" class="section-pad">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
           style="background:#111827;border:1px solid rgba(255,255,255,0.07);border-radius:8px;overflow:hidden;">
      <tr>
        <td style="padding:12px 20px 4px;">
          <div style="margin-bottom:10px;">${pill('YOUR TEAMS', 'watch')}</div>
        </td>
      </tr>
      ${teamRows}
      <tr>
        <td style="padding:10px 20px 12px;">
          <a href="https://maximussports.ai/teams" style="font-size:11px;color:#3C79B4;text-decoration:none;font-weight:600;">View all team pages →</a>
        </td>
      </tr>
    </table>
  </td>
</tr>

<tr>
  <td style="padding:0 32px 16px;" class="section-pad">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
           style="background:#111827;border:1px solid rgba(255,255,255,0.07);border-radius:8px;overflow:hidden;">
      <tr>
        <td style="padding:16px 20px 14px;">
          <div style="margin-bottom:10px;">${pill('TEAM NEWS', 'headlines')}</div>
          ${newsItems}
        </td>
      </tr>
    </table>
  </td>
</tr>`;

  return EmailShell({
    content,
    previewText: `Daily intel for ${pinnedTeams.map(t => t.name).slice(0, 2).join(' & ')}. Games, news, and analysis — powered by Maximus.`,
  });
}

export function renderText(data = {}) {
  const { displayName, pinnedTeams = [], scoresToday = [] } = data;
  const name = displayName ? displayName.split(' ')[0] : 'there';
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const lines = [
    `MAXIMUS SPORTS — Pinned Teams Alerts`,
    `${today}`,
    ``,
    `Hey ${name}, here's the daily rundown for your pinned teams.`,
    ``,
    ...pinnedTeams.slice(0, 5).map(t => {
      const game = scoresToday.find(g =>
        (g.homeTeam || '').toLowerCase().includes((t.name || '').toLowerCase().split(' ').pop()) ||
        (g.awayTeam || '').toLowerCase().includes((t.name || '').toLowerCase().split(' ').pop())
      );
      return `${t.name}: ${game ? `vs ${game.awayTeam || game.homeTeam} — ${game.status || 'Scheduled'}` : 'No game today'}`;
    }),
    ``,
    `Open Maximus → https://maximussports.ai`,
    ``,
    `Not betting advice. Manage preferences: https://maximussports.ai/settings`,
  ];
  return lines.join('\n');
}
