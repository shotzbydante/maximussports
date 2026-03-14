/**
 * Odds & ATS Intel — editorial newsletter template.
 * Sent at 12:15 PM PT. Focus on ATS leaders and line movement.
 *
 * @param {object} data
 * @param {string} [data.displayName]
 * @param {object} [data.atsLeaders]     — { best: [...], worst: [...] }
 * @param {Array}  [data.scoresToday]
 * @param {Array}  [data.rankingsTop25]
 * @param {Array}  [data.pinnedTeams]    — [{ name, slug }]
 */

import { EmailShell, heroBlock, sectionCard, sectionLabel, teamLogoImg } from '../EmailShell.js';
import { renderEmailGameList } from '../../../api/_lib/emailGameCards.js';

export function getSubject(data = {}) {
  const name = data.displayName ? data.displayName.split(' ')[0] : null;
  const { atsLeaders = {} } = data;
  const top = (atsLeaders.best || [])[0];
  if (top && name) return `${name}: ${top.name || top.team} is the ATS edge today`;
  if (top) return `${top.name || top.team} is the ATS edge today`;
  if (name) return `${name}, today\u2019s lines and edges`;
  return 'Today\u2019s lines and ATS edges';
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
  const greetingName = firstName || 'there';
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const bestAts = atsLeaders.best || [];
  const worstAts = atsLeaders.worst || [];

  // ATS Leaders
  let atsTableRows = '';
  if (bestAts.length > 0) {
    atsTableRows = bestAts.slice(0, 5).map((team, i) => {
      const name = team.name || team.team || 'Team';
      const pct = team.pct != null ? `${Math.round(team.pct * 100)}%` : '\u2014';
      const record = team.atsRecord || (team.atsW != null ? `${team.atsW}-${team.atsL}` : '\u2014');
      const teamObj = { name, slug: team.slug || name.toLowerCase().replace(/\s+/g, '-') };
      const logoHtml = teamLogoImg(teamObj, 18);

      return `<tr style="background-color:${i % 2 === 0 ? '#f9fafb' : '#ffffff'};">
  <td style="padding:8px 10px;font-size:13px;color:#1a1a2e;font-weight:600;font-family:'DM Sans',Arial,sans-serif;">
    <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      <tr>
        <td style="padding-right:8px;vertical-align:middle;">${logoHtml}</td>
        <td valign="middle">${name}</td>
      </tr>
    </table>
  </td>
  <td style="padding:8px 10px;font-size:13px;color:#2d6ca8;font-weight:700;text-align:center;font-family:'DM Sans',Arial,sans-serif;">${pct}</td>
  <td style="padding:8px 10px;font-size:12px;color:#8a94a6;text-align:right;font-family:'DM Sans',Arial,sans-serif;">${record}</td>
</tr>`;
    }).join('');
  }

  // Upset watch
  let upsetBody = '';
  if (worstAts.length > 0) {
    const bottom = worstAts[0];
    const pct = bottom.pct != null ? `${Math.round(bottom.pct * 100)}%` : '';
    upsetBody = `<strong style="color:#1a1a2e;">${bottom.name || bottom.team}</strong> is covering at only ${pct || 'a low rate'} ATS. When the public piles on, value often hides on the other side.`;
  } else {
    upsetBody = 'No standout underperformers today. The market looks efficient.';
  }

  // Games with odds
  const oddsGameSource = oddsGames.length > 0
    ? oddsGames
    : scoresToday.filter(g => g.spread || g.overUnder || g.total || g.moneylineHome);
  const oddsGameCardsHtml = oddsGameSource.length > 0
    ? renderEmailGameList(oddsGameSource, { max: 3, compact: false })
    : '';

  // Pinned teams ATS spotlight
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
      pinnedAtsBody = `${teamNames.join(' and ')} aren\u2019t among today\u2019s top ATS movers. Open the app to dig into their trends.`;
    }
  }

  const content = `
${heroBlock({
    line: `The lines are moving. Here\u2019s what Maximus Sports sees.`,
    sublabel: today,
  })}

<tr>
  <td style="padding:10px 24px 16px;" class="intro-td">
    <p style="margin:0;font-size:15px;color:#4a5568;line-height:1.65;font-family:'DM Sans',Arial,Helvetica,sans-serif;">
      Hey ${greetingName}, Maximus Sports has processed today\u2019s lines and ATS trends. Here\u2019s what matters.
    </p>
  </td>
</tr>

<tr>
  <td style="padding:0 24px;" class="divider-td">
    <div style="height:1px;background-color:#e8ecf0;font-size:0;line-height:0;">&nbsp;</div>
  </td>
</tr>
<tr><td style="height:14px;font-size:0;line-height:0;">&nbsp;</td></tr>

${atsTableRows ? `
<tr>
  <td style="padding:0 24px 14px;" class="section-td">
    <div style="margin-bottom:4px;">${sectionLabel('ATS LEADERS')}</div>
    <p style="margin:0 0 8px;font-size:12px;color:#8a94a6;font-family:'DM Sans',Arial,sans-serif;">Season cover rate leaders \u2014 updated daily.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
           style="border:1px solid #e8ecf0;border-radius:6px;border-collapse:collapse;overflow:hidden;">
      <tr style="background-color:#f0f3f7;">
        <td style="padding:6px 10px;font-size:10px;font-weight:700;color:#8a94a6;letter-spacing:0.08em;text-transform:uppercase;font-family:'DM Sans',Arial,sans-serif;">Team</td>
        <td style="padding:6px 10px;font-size:10px;font-weight:700;color:#8a94a6;letter-spacing:0.08em;text-transform:uppercase;text-align:center;font-family:'DM Sans',Arial,sans-serif;">Cover %</td>
        <td style="padding:6px 10px;font-size:10px;font-weight:700;color:#8a94a6;letter-spacing:0.08em;text-transform:uppercase;text-align:right;font-family:'DM Sans',Arial,sans-serif;">Record</td>
      </tr>
      ${atsTableRows}
    </table>
    <div style="margin-top:8px;">
      <a href="https://maximussports.ai/insights" style="font-size:12px;color:#2d6ca8;text-decoration:none;font-weight:600;font-family:'DM Sans',Arial,sans-serif;">Full ATS board &rarr;</a>
    </div>
  </td>
</tr>` : ''}

${sectionCard({
    pillLabel: 'UPSET WATCH',
    pillType: 'upset',
    headline: 'Fade Candidate',
    body: upsetBody,
  })}

${oddsGameCardsHtml ? `
<tr>
  <td style="padding:0 24px 4px;" class="section-td">
    <div style="margin-bottom:4px;">${sectionLabel('TODAY\u2019S LINES')}</div>
  </td>
</tr>
${oddsGameCardsHtml}
<tr>
  <td style="padding:4px 24px 14px;">
    <a href="https://maximussports.ai/insights" style="font-size:12px;color:#2d6ca8;text-decoration:none;font-weight:600;font-family:'DM Sans',Arial,Helvetica,sans-serif;">Full odds board &rarr;</a>
  </td>
</tr>` : ''}

${pinnedAtsBody ? sectionCard({
    pillLabel: 'YOUR TEAMS',
    pillType: 'watch',
    headline: 'ATS Spotlight',
    body: pinnedAtsBody,
  }) : ''}`;

  return EmailShell({
    content,
    previewText: `ATS leaders and line movement for ${today} \u2014 Maximus Sports.`,
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
    `Hey ${name}, the lines are moving. Here\u2019s the read.`,
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
