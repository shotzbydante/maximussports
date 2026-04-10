/**
 * MLB Maximus's Picks — model-driven picks and edges.
 *
 * Design: dark navy + deep red, glassmorphism cards.
 * Sharp, confident tone — analyst voice.
 *
 * @param {object} data
 * @param {string} [data.displayName]
 * @param {object} [data.atsLeaders]
 * @param {Array}  [data.scoresToday]
 * @param {Array}  [data.oddsGames]
 * @param {Array}  [data.pinnedTeams]
 */

import { MlbEmailShell, mlbHeroBlock, mlbSectionHeader, mlbGlassCard, mlbSectionLabel, mlbDividerRow } from '../MlbEmailShell.js';
import { mlbPicksSubject } from '../helpers/subjectGenerator.js';

export function getSubject(data = {}) {
  return mlbPicksSubject(data);
}

export function renderHTML(data = {}) {
  const {
    displayName,
    atsLeaders = {},
    scoresToday = [],
    oddsGames = [],
    pinnedTeams = [],
  } = data;

  const firstName = displayName ? displayName.split(' ')[0] : null;
  const greetingName = firstName || 'there';
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const bestAts = atsLeaders.best || [];
  const worstAts = atsLeaders.worst || [];

  // ── ATS LEADERS TABLE ─────────────────────────────────────────
  let atsSection = '';
  if (bestAts.length > 0) {
    const atsRows = bestAts.slice(0, 5).map((team, i) => {
      const name = team.name || team.team || 'Team';
      const pct = team.pct != null ? `${Math.round(team.pct * 100)}%` : '\u2014';
      const record = team.atsRecord || (team.atsW != null ? `${team.atsW}-${team.atsL}` : '\u2014');

      return `<tr style="background-color:${i % 2 === 0 ? '#1a2236' : '#151d2e'};">
  <td style="padding:8px 10px;font-size:13px;color:#f0f4f8;font-weight:600;font-family:'DM Sans',Arial,sans-serif;">${name}</td>
  <td style="padding:8px 10px;font-size:13px;color:#e8364f;font-weight:700;text-align:center;font-family:'DM Sans',Arial,sans-serif;">${pct}</td>
  <td style="padding:8px 10px;font-size:12px;color:#64748b;text-align:right;font-family:'DM Sans',Arial,sans-serif;">${record}</td>
</tr>`;
    }).join('');

    atsSection = `
${mlbSectionHeader('\u{1F4CA}', 'ATS LEADERS')}
<tr>
  <td style="padding:0 24px 14px;" class="section-td">
    <p style="margin:0 0 8px;font-size:12px;color:#64748b;font-family:'DM Sans',Arial,sans-serif;">Season cover rate leaders \u2014 updated daily.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
           style="border:1px solid #2a1520;border-radius:8px;border-collapse:collapse;overflow:hidden;">
      <tr style="background-color:#0d1117;">
        <td style="padding:6px 10px;font-size:10px;font-weight:700;color:#64748b;letter-spacing:0.08em;text-transform:uppercase;font-family:'DM Sans',Arial,sans-serif;">Team</td>
        <td style="padding:6px 10px;font-size:10px;font-weight:700;color:#64748b;letter-spacing:0.08em;text-transform:uppercase;text-align:center;font-family:'DM Sans',Arial,sans-serif;">Cover %</td>
        <td style="padding:6px 10px;font-size:10px;font-weight:700;color:#64748b;letter-spacing:0.08em;text-transform:uppercase;text-align:right;font-family:'DM Sans',Arial,sans-serif;">Record</td>
      </tr>
      ${atsRows}
    </table>
    <div style="margin-top:8px;">
      <a href="https://maximussports.ai/mlb/insights" style="font-size:12px;color:#e8364f;text-decoration:none;font-weight:600;font-family:'DM Sans',Arial,sans-serif;">Full ATS board &rarr;</a>
    </div>
  </td>
</tr>`;
  }

  // ── FADE CANDIDATE ────────────────────────────────────────────
  let fadeSection = '';
  if (worstAts.length > 0) {
    const bottom = worstAts[0];
    const pct = bottom.pct != null ? `${Math.round(bottom.pct * 100)}%` : '';
    const fadeBody = `<strong style="color:#f0f4f8;">${bottom.name || bottom.team}</strong> is covering at only ${pct || 'a low rate'} ATS. When the public piles on, value often hides on the other side.`;
    fadeSection = mlbGlassCard({
      label: 'FADE CANDIDATE',
      headline: 'Contrarian Edge',
      body: fadeBody,
    });
  }

  // ── TODAY'S LINES ─────────────────────────────────────────────
  const oddsSource = oddsGames.length > 0
    ? oddsGames
    : scoresToday.filter(g => g.spread || g.overUnder || g.total || g.moneylineHome);
  let linesSection = '';
  if (oddsSource.length > 0) {
    const lineRows = oddsSource.slice(0, 4).map(g => {
      const matchup = `${g.awayTeam || 'Away'} @ ${g.homeTeam || 'Home'}`;
      const spread = g.spread ? `Spread: ${g.spread}` : '';
      const total = g.overUnder || g.total ? `O/U: ${g.overUnder || g.total}` : '';
      const details = [spread, total].filter(Boolean).join(' &middot; ');
      return `<tr><td style="padding:8px 0;border-bottom:1px solid #1e293b;">
        <p style="margin:0;font-size:14px;font-weight:600;color:#f0f4f8;font-family:'DM Sans',Arial,sans-serif;">${matchup}</p>
        ${details ? `<p style="margin:3px 0 0;font-size:12px;color:#64748b;font-family:'DM Sans',Arial,sans-serif;">${details}</p>` : ''}
      </td></tr>`;
    }).join('');

    linesSection = `
${mlbSectionHeader('\u{1F3AF}', 'TODAY\'S LINES')}
<tr>
  <td style="padding:0 24px 14px;" class="section-td">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
      ${lineRows}
    </table>
    <div style="margin-top:8px;">
      <a href="https://maximussports.ai/mlb/picks" style="font-size:12px;color:#e8364f;text-decoration:none;font-weight:600;font-family:'DM Sans',Arial,sans-serif;">Full picks board &rarr;</a>
    </div>
  </td>
</tr>`;
  }

  // ── YOUR TEAMS SPOTLIGHT ──────────────────────────────────────
  let teamSpotlight = '';
  if (pinnedTeams.length > 0) {
    const inLeaders = pinnedTeams.filter(t =>
      bestAts.some(a => {
        const aName = (a.name || a.team || '').toLowerCase();
        return (t.name || '').toLowerCase().split(' ').some(w => w.length >= 3 && aName.includes(w));
      })
    );
    let spotBody = '';
    if (inLeaders.length > 0) {
      spotBody = `Your team <strong style="color:#f0f4f8;">${inLeaders[0].name}</strong> appears in today\u2019s ATS leaders. Strong position \u2014 monitor line movement before first pitch.`;
    } else {
      const teamNames = pinnedTeams.slice(0, 2).map(t => t.name);
      spotBody = `${teamNames.join(' and ')} aren\u2019t among today\u2019s top ATS movers. Open the app to dig into their trends.`;
    }
    teamSpotlight = mlbGlassCard({
      label: 'YOUR TEAMS',
      headline: 'ATS Spotlight',
      body: spotBody,
    });
  }

  const totalGames = oddsSource.length || scoresToday.length || 0;
  const heroLine = totalGames > 0
    ? `${totalGames} game${totalGames !== 1 ? 's' : ''} on the board. The model has reads.`
    : `Today\u2019s picks and edges are ready.`;

  const content = `
${mlbHeroBlock({ line: heroLine, sublabel: today })}

<tr>
  <td style="padding:10px 24px 16px;" class="intro-td">
    <p style="margin:0;font-size:15px;color:#94a3b8;line-height:1.65;font-family:'DM Sans',Arial,Helvetica,sans-serif;">
      Hey ${greetingName}, Maximus has processed today\u2019s lines and ATS trends. Here\u2019s where the value lives.
    </p>
  </td>
</tr>

<tr>
  <td style="padding:0 24px;" class="divider-td">
    <div style="height:1px;background-color:#1e293b;font-size:0;line-height:0;">&nbsp;</div>
  </td>
</tr>

${atsSection}
${fadeSection}
${linesSection}
${teamSpotlight}`;

  return MlbEmailShell({
    content,
    previewText: `\u26BE ATS leaders and picks for ${today} \u2014 Maximus Sports.`,
    ctaUrl: 'https://maximussports.ai/mlb/picks',
    ctaLabel: 'Open MLB Picks &rarr;',
  });
}

export function renderText(data = {}) {
  const { displayName, atsLeaders = {}, scoresToday = [] } = data;
  const name = displayName ? displayName.split(' ')[0] : 'there';
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const best = atsLeaders.best || [];
  const lines = [
    '\u26BE MAXIMUS SPORTS \u2014 MLB Maximus\'s Picks',
    today,
    '',
    `Hey ${name}, the model has processed today\u2019s lines. Here\u2019s the read.`,
    '',
    'ATS LEADERS',
    ...(best.length > 0
      ? best.slice(0, 3).map(t => `${t.name || t.team}: ${t.pct != null ? Math.round(t.pct * 100) + '% ATS' : '\u2014'}`)
      : ['No major ATS edges today.']),
    '',
    'GAMES TODAY',
    scoresToday.length > 0 ? `${scoresToday.length} games on the slate.` : 'Light slate today.',
    '',
    'Open MLB Picks -> https://maximussports.ai/mlb/picks',
    '',
    'Not betting advice. Manage preferences: https://maximussports.ai/settings',
  ];
  return lines.join('\n');
}
