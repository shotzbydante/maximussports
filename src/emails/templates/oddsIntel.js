/**
 * Odds & ATS Intel email template.
 * Sent once per day at 11:00 AM PST to subscribers with preferences.oddsIntel = true.
 *
 * @param {object} data
 * @param {string} [data.displayName]    — user's resolved display name
 * @param {object} [data.atsLeaders]     — { best: [...], worst: [...] }
 * @param {Array}  [data.scoresToday]
 * @param {Array}  [data.rankingsTop25]
 * @param {Array}  [data.pinnedTeams]    — [{ name, slug, logo? }]
 */

import { EmailShell, heroBlock, sectionCard, pill, teamLogoImg } from '../EmailShell.js';

export function getSubject(data = {}) {
  const { atsLeaders = {} } = data;
  const top = (atsLeaders.best || [])[0];
  if (top) return `Maximus Sports ATS: ${top.name || top.team} is your edge today`;
  return "Maximus Sports: Odds & ATS Intel — Today's lines and edges";
}

export function renderHTML(data = {}) {
  const {
    displayName,
    atsLeaders = {},
    scoresToday = [],
    rankingsTop25 = [],
    pinnedTeams = [],
  } = data;

  const firstName = displayName ? displayName.split(' ')[0] : null;
  const greetingName = firstName ? `, ${firstName}` : '';
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const bestAts = atsLeaders.best || [];
  const worstAts = atsLeaders.worst || [];

  // ── ATS Leaders table (with logos)
  let atsRows = '';
  if (bestAts.length > 0) {
    atsRows = bestAts.slice(0, 5).map((team, i) => {
      const name = team.name || team.team || 'Team';
      const pct = team.pct != null ? `${Math.round(team.pct * 100)}%` : '—';
      const record = team.atsRecord || (team.atsW != null ? `${team.atsW}-${team.atsL}` : '—');
      const rankRow = rankingsTop25.find(r =>
        (r.teamName || r.name || '').toLowerCase().includes(name.toLowerCase().split(' ')[0])
      );
      const rank = rankRow ? `#${rankRow.rank || (rankingsTop25.indexOf(rankRow) + 1)}` : '';

      // Build team object for logo lookup
      const teamObj = { name, slug: team.slug || name.toLowerCase().replace(/\s+/g, '-') };
      const logoHtml = teamLogoImg(teamObj, 20);

      return `<tr style="background:${i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent'};">
  <td style="padding:9px 12px;font-size:12px;color:#f0f4f8;font-weight:600;font-family:'DM Sans',Arial,sans-serif;">
    <table role="presentation" cellpadding="0" cellspacing="0">
      <tr>
        <td style="padding-right:7px;vertical-align:middle;">${logoHtml}</td>
        <td valign="middle">
          ${rank ? `<span style="color:#4a5568;font-size:10px;margin-right:4px;">${rank}</span>` : ''}${name}
        </td>
      </tr>
    </table>
  </td>
  <td style="padding:9px 12px;font-size:12px;color:#3d9c74;font-weight:700;text-align:center;font-family:'DM Sans',Arial,sans-serif;">${pct}</td>
  <td style="padding:9px 12px;font-size:11px;color:#6b7f99;text-align:right;font-family:'DM Sans',Arial,sans-serif;">${record}</td>
</tr>`;
    }).join('');
  }

  // ── Upset Watch
  let upsetBody = '';
  if (worstAts.length > 0) {
    const bottom = worstAts[0];
    const pct = bottom.pct != null ? `${Math.round(bottom.pct * 100)}%` : '';
    upsetBody = `<strong style="color:#f0f4f8;">${bottom.name || bottom.team}</strong> is covering at only ${pct || 'a low rate'} ATS. When the public piles on, value often hides on the other side.`;
  } else {
    upsetBody = 'No standout underperformers today. The market looks efficient &mdash; Maximus is watching for movement.';
  }

  // ── Games with odds context
  const gamesWithOdds = scoresToday.filter(g => g.spread || g.overUnder || g.total || g.moneylineHome).slice(0, 3);
  let oddsRows = '';
  if (gamesWithOdds.length > 0) {
    oddsRows = gamesWithOdds.map(g => {
      const matchup = `${g.awayTeam || 'Away'} @ ${g.homeTeam || 'Home'}`;
      const spread = g.spread ? `Spread: ${g.spread}` : '';
      const ou = (g.overUnder || g.total) ? `O/U: ${g.overUnder || g.total}` : '';
      const details = [spread, ou].filter(Boolean).join(' &nbsp;&middot;&nbsp; ');
      return `<tr>
  <td style="padding:8px 12px;border-bottom:1px solid rgba(255,255,255,0.04);">
    <span style="font-size:12px;color:#c0cad8;font-weight:600;font-family:'DM Sans',Arial,sans-serif;">${matchup}</span>
    ${details ? `<div style="margin-top:3px;font-size:11px;color:#5a9fd4;font-family:'DM Sans',Arial,sans-serif;">${details}</div>` : ''}
  </td>
</tr>`;
    }).join('');
  }

  // ── Pinned teams ATS spotlight (with logos)
  let pinnedAtsBody = '';
  if (pinnedTeams.length > 0) {
    const inLeaders = pinnedTeams.filter(t =>
      bestAts.some(a => {
        const aName = (a.name || a.team || '').toLowerCase();
        const tWords = (t.name || '').toLowerCase().split(' ');
        return tWords.some(w => w.length >= 3 && aName.includes(w));
      })
    );
    if (inLeaders.length > 0) {
      pinnedAtsBody = `Your pinned team ${inLeaders[0].name} appears in today&rsquo;s ATS leaders. Strong position &mdash; monitor line movement before tip.`;
    } else {
      const teamNames = pinnedTeams.slice(0, 2).map(t => t.name);
      pinnedAtsBody = `${teamNames.join(' and ')} aren&rsquo;t among today&rsquo;s top ATS movers. Open the app to dig into their specific trends and line history.`;
    }
  }

  const content = `
${heroBlock({
    line: `The lines are moving${greetingName}. Here&rsquo;s what Maximus sees.`,
    sublabel: today,
  })}

<tr>
  <td style="padding:0 28px 14px;" class="section-pad">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
           style="background:#111827;border:1px solid rgba(255,255,255,0.07);border-radius:8px;overflow:hidden;">
      <tr>
        <td style="padding:16px 18px 8px;" class="card-inner">
          <div style="margin-bottom:10px;">${pill('ATS EDGE', 'ats')}</div>
          <p style="margin:0 0 10px;font-size:14px;font-weight:700;color:#f0f4f8;font-family:'DM Sans',Arial,sans-serif;" class="text-lg">Top ATS Performers</p>
        </td>
      </tr>
      ${atsRows || `<tr><td style="padding:8px 12px 14px;font-size:12px;color:#4a5568;font-family:'DM Sans',Arial,sans-serif;">ATS data refreshing &mdash; check the app for live leaders.</td></tr>`}
      <tr>
        <td style="padding:10px 12px 12px;">
          <a href="https://maximussports.ai" style="font-size:11px;color:#3C79B4;text-decoration:none;font-weight:600;">Full ATS board &rarr;</a>
        </td>
      </tr>
    </table>
  </td>
</tr>

${sectionCard({
    pillLabel: 'UPSET WATCH',
    pillType: 'upset',
    headline: 'Fade Candidate Today',
    body: upsetBody,
  })}

${oddsRows ? `
<tr>
  <td style="padding:0 28px 14px;" class="section-pad">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
           style="background:#111827;border:1px solid rgba(255,255,255,0.07);border-radius:8px;overflow:hidden;">
      <tr>
        <td style="padding:16px 18px 8px;" class="card-inner">
          <div style="margin-bottom:8px;">${pill('LINES', 'intel')}</div>
          <p style="margin:0 0 10px;font-size:13px;font-weight:700;color:#f0f4f8;font-family:'DM Sans',Arial,sans-serif;" class="text-md">Today&rsquo;s Odds</p>
        </td>
      </tr>
      ${oddsRows}
      <tr>
        <td style="padding:10px 12px 12px;">
          <a href="https://maximussports.ai" style="font-size:11px;color:#3C79B4;text-decoration:none;font-weight:600;">Full odds board &rarr;</a>
        </td>
      </tr>
    </table>
  </td>
</tr>` : ''}

${pinnedAtsBody ? sectionCard({
    pillLabel: 'YOUR TEAMS',
    pillType: 'watch',
    headline: 'ATS Spotlight — Your Pinned Teams',
    body: pinnedAtsBody,
  }) : ''}`;

  return EmailShell({
    content,
    previewText: `ATS leaders, line movement, and upset watch for ${today}. Maximus Sports has your edge.`,
  });
}

export function renderText(data = {}) {
  const { displayName, atsLeaders = {}, scoresToday = [] } = data;
  const name = displayName ? displayName.split(' ')[0] : 'there';
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const best = atsLeaders.best || [];
  const lines = [
    `MAXIMUS SPORTS — Odds & ATS Intel`,
    today,
    ``,
    `Hey ${name}, the lines are moving. Here's Maximus Sports's read.`,
    ``,
    `ATS LEADERS`,
    ...(best.length > 0
      ? best.slice(0, 3).map(t => `${t.name || t.team}: ${t.pct != null ? Math.round(t.pct * 100) + '% ATS' : '—'}`)
      : ['No major ATS edges today.']),
    ``,
    `GAMES TODAY`,
    scoresToday.length > 0
      ? `${scoresToday.length} games on the slate.`
      : 'Light slate today.',
    ``,
    `Open Maximus → https://maximussports.ai`,
    ``,
    `Not betting advice. Manage preferences: https://maximussports.ai/settings`,
  ];
  return lines.join('\n');
}
