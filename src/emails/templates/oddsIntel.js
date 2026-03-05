/**
 * Odds & ATS Intel email template.
 * Sent once per day at 11:00 AM PST to subscribers with preferences.oddsIntel = true.
 *
 * @param {object} data
 * @param {string} [data.displayName]    — user's resolved display name
 * @param {object} [data.atsLeaders]     — { best: [...], worst: [...] }
 * @param {Array}  [data.scoresToday]
 * @param {Array}  [data.rankingsTop25]
 * @param {Array}  [data.pinnedTeams]    — [{ name, slug }]
 */

import { EmailShell, heroBlock, sectionCard, pill, teamLogoImg } from '../EmailShell.js';
import { renderEmailGameList } from '../../../api/_lib/emailGameCards.js';

export function getSubject(data = {}) {
  const { atsLeaders = {} } = data;
  const top = (atsLeaders.best || [])[0];
  if (top) return `Maximus Sports: Against the Spread (ATS) Intel \u2014 ${top.name || top.team} is the edge today`;
  return 'Maximus Sports: Against the Spread (ATS) Intel \u2014 Today\u2019s lines and edges';
}

export function renderHTML(data = {}) {
  const {
    displayName,
    atsLeaders = {},
    scoresToday = [],
    rankingsTop25 = [],
    pinnedTeams = [],
    oddsGames = [],
  } = data;

  const firstName = displayName ? displayName.split(' ')[0] : null;
  const greetingName = firstName ? `, ${firstName}` : '';
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const bestAts = atsLeaders.best || [];
  const worstAts = atsLeaders.worst || [];

  // ── ATS Leaders table with logos
  let atsRows = '';
  if (bestAts.length > 0) {
    atsRows = bestAts.slice(0, 5).map((team, i) => {
      const name = team.name || team.team || 'Team';
      const pct = team.pct != null ? `${Math.round(team.pct * 100)}%` : '\u2014';
      const record = team.atsRecord || (team.atsW != null ? `${team.atsW}-${team.atsL}` : '\u2014');
      const rankRow = rankingsTop25.find(r =>
        (r.teamName || r.name || '').toLowerCase().includes(name.toLowerCase().split(' ')[0])
      );
      const rank = rankRow ? `#${rankRow.rank || (rankingsTop25.indexOf(rankRow) + 1)}` : '';
      const teamObj = { name, slug: team.slug || name.toLowerCase().replace(/\s+/g, '-') };
      const logoHtml = teamLogoImg(teamObj, 20);

      return `<tr style="background:${i % 2 === 0 ? 'rgba(255,255,255,0.025)' : 'transparent'};">
  <td style="padding:9px 12px 9px 14px;font-size:12px;color:#e8edf5;font-weight:600;font-family:'DM Sans',Arial,sans-serif;">
    <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      <tr>
        <td style="padding-right:8px;vertical-align:middle;">${logoHtml}</td>
        <td valign="middle">
          ${rank ? `<span style="color:#3a5268;font-size:10px;font-weight:600;margin-right:4px;font-family:'DM Sans',Arial,sans-serif;">${rank}</span>` : ''}${name}
        </td>
      </tr>
    </table>
  </td>
  <td style="padding:9px 12px;font-size:12px;color:#3d9c74;font-weight:700;text-align:center;font-family:'DM Sans',Arial,sans-serif;white-space:nowrap;">${pct}</td>
  <td style="padding:9px 14px 9px 8px;font-size:11px;color:#4a6070;text-align:right;font-family:'DM Sans',Arial,sans-serif;white-space:nowrap;">${record}</td>
</tr>`;
    }).join('');
  }

  // ── Upset watch
  let upsetBody = '';
  if (worstAts.length > 0) {
    const bottom = worstAts[0];
    const pct = bottom.pct != null ? `${Math.round(bottom.pct * 100)}%` : '';
    upsetBody = `<strong style="color:#f0f4f8;">${bottom.name || bottom.team}</strong> is covering at only ${pct || 'a low rate'} ATS. When the public piles on, value often hides on the other side.`;
  } else {
    upsetBody = 'No standout underperformers today. The market looks efficient \u2014 Maximus Sports is watching for movement.';
  }

  // ── Games with odds — prefer oddsGames (have spread data), fall back to scoresToday
  const oddsGameSource = oddsGames.length > 0
    ? oddsGames
    : scoresToday.filter(g => g.spread || g.overUnder || g.total || g.moneylineHome);
  const oddsGameCardsHtml = oddsGameSource.length > 0
    ? renderEmailGameList(oddsGameSource, { max: 3, compact: false })
    : '';

  // ── Pinned teams ATS spotlight
  let pinnedAtsBody = '';
  if (pinnedTeams.length > 0) {
    const inLeaders = pinnedTeams.filter(t =>
      bestAts.some(a => {
        const aName = (a.name || a.team || '').toLowerCase();
        return (t.name || '').toLowerCase().split(' ').some(w => w.length >= 3 && aName.includes(w));
      })
    );
    if (inLeaders.length > 0) {
      pinnedAtsBody = `Your pinned team ${inLeaders[0].name} appears in today\u2019s ATS leaders. Strong position \u2014 monitor line movement before tip.`;
    } else {
      const teamNames = pinnedTeams.slice(0, 2).map(t => t.name);
      pinnedAtsBody = `${teamNames.join(' and ')} aren\u2019t among today\u2019s top ATS movers. Open the app to dig into their specific trends and line history.`;
    }
  }

  const content = `
${heroBlock({
    line: `The lines are moving${greetingName}. Here\u2019s what Maximus Sports sees.`,
    sublabel: today,
  })}

<tr>
  <td style="padding:0 24px 8px;" class="section-td">
    <p style="margin:0;font-size:13px;color:#526070;line-height:1.55;font-family:'DM Sans',Arial,Helvetica,sans-serif;">
      Maximus Sports has processed today&rsquo;s lines and ATS trends. Here&rsquo;s what matters.
    </p>
  </td>
</tr>

<tr>
  <td style="padding:0 24px 10px;" class="section-td">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" bgcolor="#0f1825"
           style="background:#0f1825;border:1px solid rgba(255,255,255,0.09);border-radius:8px;border-collapse:collapse;"
           class="email-card-dark">
      <tr>
        <td bgcolor="#0f1825" style="padding:16px 18px 8px;background:#0f1825;" class="card-td">
          <div style="margin-bottom:10px;">${pill('ATS EDGE', 'ats')}</div>
          <p style="margin:0 0 2px;font-size:14px;font-weight:700;color:#e8edf5;line-height:1.3;font-family:'DM Sans',Arial,sans-serif;">Top Against the Spread (ATS) Performers</p>
          <p style="margin:0 0 10px;font-size:11px;color:#4a6070;font-family:'DM Sans',Arial,sans-serif;line-height:1.4;">Season cover rate leaders &mdash; updated daily.</p>
        </td>
      </tr>
      ${atsRows || `<tr><td style="padding:8px 14px 14px;font-size:12px;color:#4a5568;font-family:'DM Sans',Arial,sans-serif;">ATS data refreshing \u2014 check the app for live leaders.</td></tr>`}
      <tr>
        <td bgcolor="#0f1825" style="padding:10px 14px 13px;background:#0f1825;border-top:1px solid rgba(255,255,255,0.05);">
          <a href="https://maximussports.ai/insights" style="font-size:11px;color:#3C79B4;text-decoration:none;font-weight:600;font-family:'DM Sans',Arial,sans-serif;">Full ATS board &rarr;</a>
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

${oddsGameCardsHtml ? `
<tr>
  <td style="padding:0 24px 6px;" class="section-td">
    <div style="display:flex;align-items:center;gap:8px;">${pill('LINES', 'intel')}&nbsp;&nbsp;<span style="font-size:13px;font-weight:700;color:#e8edf5;font-family:'DM Sans',Arial,Helvetica,sans-serif;vertical-align:middle;">Today\u2019s Spread &amp; Lines</span></div>
  </td>
</tr>
${oddsGameCardsHtml}
<tr>
  <td style="padding:4px 24px 10px;">
    <a href="https://maximussports.ai/insights" style="font-size:11px;color:#3C79B4;text-decoration:none;font-weight:600;font-family:'DM Sans',Arial,Helvetica,sans-serif;">Full odds board &rarr;</a>
  </td>
</tr>` : ''}

${pinnedAtsBody ? sectionCard({
    pillLabel: 'YOUR TEAMS',
    pillType: 'watch',
    headline: 'ATS Spotlight \u2014 Your Pinned Teams',
    body: pinnedAtsBody,
  }) : ''}`;

  return EmailShell({
    content,
    previewText: `ATS leaders, line movement, and upset watch for ${today} \u2014 Maximus Sports has your edge.`,
  });
}

export function renderText(data = {}) {
  const { displayName, atsLeaders = {}, scoresToday = [] } = data;
  const name = displayName ? displayName.split(' ')[0] : 'there';
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const best = atsLeaders.best || [];
  const lines = [
    'MAXIMUS SPORTS \u2014 Odds & ATS Intel',
    today,
    '',
    `Hey ${name}, the lines are moving. Here's Maximus Sports's read.`,
    '',
    'ATS LEADERS',
    ...(best.length > 0
      ? best.slice(0, 3).map(t => `${t.name || t.team}: ${t.pct != null ? Math.round(t.pct * 100) + '% ATS' : '\u2014'}`)
      : ['No major ATS edges today.']),
    '',
    'GAMES TODAY',
    scoresToday.length > 0 ? `${scoresToday.length} games on the slate.` : 'Light slate today.',
    '',
    'Open Maximus Sports -> https://maximussports.ai',
    '',
    'Not betting advice. Manage preferences: https://maximussports.ai/settings',
  ];
  return lines.join('\n');
}
