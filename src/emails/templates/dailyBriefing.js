/**
 * Daily AI Briefing email template.
 * Sent once per day at 8:00 AM PST to subscribers with preferences.briefing = true.
 *
 * @param {object} data
 * @param {string} [data.displayName]     — user's resolved display name
 * @param {Array}  [data.scoresToday]
 * @param {Array}  [data.rankingsTop25]
 * @param {object} [data.atsLeaders]      — { best: [...], worst: [...] }
 * @param {Array}  [data.headlines]       — news headlines (pre-deduped, entities decoded)
 * @param {Array}  [data.pinnedTeams]     — [{ name, slug }]
 * @param {Array}  [data.botIntelBullets] — 2–4 bullets from home bot intel (optional)
 */

import { EmailShell, heroBlock, sectionCard, pill, teamLogoImg } from '../EmailShell.js';
import { getTeamTodaySummary } from '../../../api/_lib/teamSchedule.js';

export function getSubject(data = {}) {
  const name = data.displayName ? data.displayName.split(' ')[0] : null;
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  return `Maximus Sports: Daily Briefing${name ? `, ${name}` : ''} \u2014 ${today}`;
}

export function renderHTML(data = {}) {
  const {
    displayName,
    scoresToday = [],
    rankingsTop25 = [],
    atsLeaders = {},
    headlines = [],
    pinnedTeams = [],
    botIntelBullets = [],
  } = data;

  const firstName = displayName ? displayName.split(' ')[0] : null;
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const greetingName = firstName ? `, ${firstName}` : '';

  // ── Pinned teams with logos + game status
  let pinnedSection = '';
  if (pinnedTeams.length > 0) {
    const pinnedRows = pinnedTeams.slice(0, 3).map(team => {
      const teamSlug = team.slug || '';
      const teamUrl = teamSlug ? `https://maximussports.ai/teams/${teamSlug}` : 'https://maximussports.ai';
      const { gameInfo } = getTeamTodaySummary(team, scoresToday);
      const logoHtml = teamLogoImg(team, 20);
      return `<tr>
  <td style="padding:8px 18px;border-bottom:1px solid rgba(255,255,255,0.04);">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
      <tr>
        <td valign="middle" style="width:24px;padding-right:7px;">${logoHtml}</td>
        <td valign="middle">
          <a href="${teamUrl}" style="font-size:12px;font-weight:700;color:#c0cad8;text-decoration:none;font-family:'DM Sans',Arial,sans-serif;">${team.name}</a>
          <div style="margin-top:2px;">${gameInfo}</div>
        </td>
      </tr>
    </table>
  </td>
</tr>`;
    }).join('');

    pinnedSection = `
<tr>
  <td style="padding:0 28px 12px;" class="section-td">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
           style="background:#111827;border:1px solid rgba(255,255,255,0.07);border-radius:8px;border-collapse:collapse;">
      <tr>
        <td style="padding:12px 18px 4px;" class="card-td">
          <div style="margin-bottom:4px;">${pill('YOUR TEAMS', 'watch')}</div>
        </td>
      </tr>
      ${pinnedRows}
      <tr>
        <td style="padding:9px 18px 11px;">
          <a href="https://maximussports.ai/teams" style="font-size:11px;color:#3C79B4;text-decoration:none;font-weight:600;">Full team intel &rarr;</a>
        </td>
      </tr>
    </table>
  </td>
</tr>`;
  }

  // ── Games today
  const gameCount = scoresToday.length;
  let gamesBody = '';
  if (gameCount > 0) {
    const sample = scoresToday.slice(0, 3).map(g => {
      const teams = g.awayTeam && g.homeTeam ? `${g.awayTeam} @ ${g.homeTeam}` : 'Game TBD';
      const status = g.gameStatus || g.status || 'Scheduled';
      return `<span style="display:block;color:#8892a4;font-size:12px;padding:3px 0;border-bottom:1px solid rgba(255,255,255,0.04);">${teams} &mdash; <span style="color:#5a9fd4;">${status}</span></span>`;
    }).join('');
    gamesBody = `${gameCount} game${gameCount !== 1 ? 's' : ''} on the slate today. Here&rsquo;s what Maximus Sports is tracking.<br/><br/><div style="margin-top:4px;">${sample}</div>`;
  } else {
    gamesBody = 'The schedule is light today. Maximus Sports is staying disciplined &mdash; no forced action.';
  }

  // ── ATS Edge
  const bestAts = atsLeaders.best || [];
  let atsBody = '';
  if (bestAts.length > 0) {
    const top = bestAts[0];
    const pct = top.pct != null ? `${Math.round(top.pct * 100)}%` : '';
    atsBody = `<strong style="color:#f0f4f8;">${top.name || top.team || 'A team'}</strong> ${pct ? `is covering at ${pct} ATS` : 'is the top ATS performer right now'}. ${bestAts.length > 1 ? `${bestAts[1].name || bestAts[1].team} is also worth a look.` : ''}`;
  } else {
    atsBody = 'No major ATS edges detected today. Staying disciplined &mdash; patience is a strategy too.';
  }

  // ── Rankings
  let rankBody = '';
  if (rankingsTop25.length > 0) {
    const top3 = rankingsTop25.slice(0, 3).map((r, i) => `#${i + 1} ${r.teamName || r.name || r.team || 'Unknown'}`).join(', ');
    rankBody = `Current top 3: ${top3}. The bubble is tightening as conference play heats up.`;
  } else {
    rankBody = 'Rankings data is refreshing. Check the app for the latest AP Top 25 movements.';
  }

  // ── Headlines (entities already decoded by dedupeNewsItems)
  let headlineItems = '';
  if (headlines.length > 0) {
    headlineItems = headlines.slice(0, 3).map(h => {
      const title = h.title || 'Breaking';
      const source = h.source || '';
      const link = h.link || 'https://maximussports.ai';
      return `<a href="${link}" style="display:block;color:#8892a4;font-size:12px;padding:7px 0;border-bottom:1px solid rgba(255,255,255,0.04);text-decoration:none;line-height:1.45;" target="_blank">
        <span style="color:#c0cad8;">${title}</span>${source ? `<span style="color:#4a5568;font-size:11px;"> &mdash; ${source}</span>` : ''}
      </a>`;
    }).join('');
  } else {
    headlineItems = '<span style="color:#4a5568;font-size:12px;">No major headlines at this hour.</span>';
  }

  // ── Maximus bot intel bullets
  let botIntelSection = '';
  if (botIntelBullets.length > 0) {
    const bulletHtml = botIntelBullets.slice(0, 4).map(b =>
      `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 4px;border-collapse:collapse;">
        <tr>
          <td valign="top" style="width:12px;color:#3d9c74;font-size:12px;padding-top:2px;font-family:'DM Sans',Arial,sans-serif;">&bull;</td>
          <td valign="top" style="font-size:12px;color:#8892a4;line-height:1.5;font-family:'DM Sans',Arial,sans-serif;padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.04);">${b}</td>
        </tr>
      </table>`
    ).join('');
    botIntelSection = `
<tr>
  <td style="padding:0 28px 12px;" class="section-td">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
           style="background:#111827;border:1px solid rgba(255,255,255,0.07);border-radius:8px;border-collapse:collapse;">
      <tr>
        <td style="padding:16px 18px 14px;" class="card-td">
          <div style="margin-bottom:10px;">${pill('MAXIMUS SAYS', 'intel')}</div>
          ${bulletHtml}
        </td>
      </tr>
    </table>
  </td>
</tr>`;
  }

  const content = `
${heroBlock({
    line: `Maximus Sports Briefing${greetingName}: Here\u2019s your edge today.`,
    sublabel: today,
  })}

<tr>
  <td style="padding:0 28px 8px;" class="section-td">
    <p style="margin:0;font-size:13px;color:#6b7f99;line-height:1.6;font-family:'DM Sans',Arial,sans-serif;">
      Good morning. Maximus Sports has processed today&rsquo;s slate, lines, and trends. Here&rsquo;s what matters.
    </p>
  </td>
</tr>

${botIntelSection}

${sectionCard({
    pillLabel: 'WHAT TO WATCH',
    pillType: 'watch',
    headline: gameCount > 0 ? `${gameCount} Games Today` : 'Light Slate',
    body: gamesBody,
  })}

${sectionCard({
    pillLabel: 'ATS EDGE',
    pillType: 'ats',
    headline: 'Maximus ATS Radar',
    body: atsBody,
  })}

${sectionCard({
    pillLabel: 'RANKINGS',
    pillType: 'intel',
    headline: 'AP Top 25 Pulse',
    body: rankBody,
  })}

${pinnedSection}

<tr>
  <td style="padding:0 28px 12px;" class="section-td">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
           style="background:#111827;border:1px solid rgba(255,255,255,0.07);border-radius:8px;border-collapse:collapse;">
      <tr>
        <td style="padding:16px 18px 14px;" class="card-td">
          <div style="margin-bottom:10px;">${pill('HEADLINES', 'headlines')}</div>
          ${headlineItems}
        </td>
      </tr>
    </table>
  </td>
</tr>`;

  return EmailShell({
    content,
    previewText: `Your Maximus Sports edge for ${today} \u2014 ATS leaders, games, and intel in one read.`,
  });
}

export function renderText(data = {}) {
  const { displayName, scoresToday = [], atsLeaders = {}, headlines = [], botIntelBullets = [], pinnedTeams = [] } = data;
  const name = displayName ? displayName.split(' ')[0] : 'there';
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const lines = [
    'MAXIMUS SPORTS — Daily AI Briefing',
    today,
    '',
    `Good morning, ${name}. Here's your edge today.`,
    '',
    ...(botIntelBullets.length > 0 ? [
      'MAXIMUS SAYS',
      ...botIntelBullets.slice(0, 4).map(b => `- ${b}`),
      '',
    ] : []),
    'WHAT TO WATCH',
    scoresToday.length > 0 ? `${scoresToday.length} games on the slate today.` : 'Light slate today. Stay disciplined.',
    '',
    'ATS EDGE',
    atsLeaders.best?.length > 0
      ? `Top ATS performer: ${atsLeaders.best[0].name || atsLeaders.best[0].team}`
      : 'No major ATS edges detected today.',
    '',
    ...(pinnedTeams.length > 0 ? [
      'YOUR TEAMS',
      ...pinnedTeams.slice(0, 3).map(t => {
        const { gameInfoText } = getTeamTodaySummary(t, scoresToday);
        return `${t.name}: ${gameInfoText}`;
      }),
      '',
    ] : []),
    'HEADLINES',
    ...headlines.slice(0, 3).map(h => `- ${h.title || 'No title'}`),
    '',
    'Open Maximus Sports -> https://maximussports.ai',
    '',
    'Not betting advice. Manage preferences: https://maximussports.ai/settings',
  ];
  return lines.join('\n');
}
