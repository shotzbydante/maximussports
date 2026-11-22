/**
 * NFL Picks: the recurring football email (preference key nfl_picks).
 *
 * Sent Thursday at 5 PM ET (Sunday's games are inside the 72-hour pick
 * window by then, and Thursday night has not kicked off) and Sunday at 9 AM ET,
 * in season, by /api/email/run-daily. It
 * reads the live picks board at send time, so it says what the app says:
 * the recommended picks with line, price, book and reason, the lean on every
 * other upcoming game, and the matchups of the NFL teams the reader follows.
 * Games that have kicked off are left out. If nothing is upcoming the run
 * skips the send (see hasNflPicksContent).
 */

import { EmailShell } from '../EmailShell.js';
import { launchPicks, launchLeans, pickCard, leanCard, sectionTitle } from './nflLaunch.js';

const F = "'DM Sans',Arial,Helvetica,sans-serif";
const NAVY = '#0f2440';
const TEXT = '#1a1a2e';
const BODY = '#4b5563';
const DIM = '#8a94a6';
const BORDER = '#e8ecf0';
const SITE = 'https://maximussports.ai';
const UTM = 'utm_source=email&utm_medium=email&utm_campaign=nfl_picks';
const PICKS_URL = `${SITE}/nfl/insights?${UTM}`;
const RECORD_URL = `${SITE}/record?${UTM}`;

const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function kickoff(iso) {
  if (!iso) return '';
  try {
    return `${new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: '2-digit' })} ET`;
  } catch { return ''; }
}

const signed = (n) => (n > 0 ? `+${n}` : `${n}`);

/** Upcoming games on the board, earliest first. */
function upcomingGames(board, now) {
  return (board?.byGame || [])
    .filter((g) => g?.startTime && Date.parse(g.startTime) > now)
    .sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime));
}

/**
 * The reader's NFL teams that still have a game this week: who they play,
 * the line, and what the board says about the game.
 */
export function yourTeams(board, pinnedSlugs = [], { now = Date.now(), picks = [], leans = [] } = {}) {
  const follow = new Set(pinnedSlugs);
  if (follow.size === 0) return [];
  const callFor = (g) => {
    const label = `${g.awayTeam?.shortName} at ${g.homeTeam?.shortName}`;
    const rec = picks.find((p) => p.matchup === label);
    if (rec) return { kind: 'pick', text: `${rec.pick}${rec.price ? ` (${rec.price}${rec.book ? `, ${rec.book}` : ''})` : ''}` };
    const lean = leans.find((p) => p.matchup === label);
    if (lean) return { kind: 'lean', text: lean.pick };
    return { kind: 'none', text: 'No bet. The price is fair.' };
  };
  const rows = [];
  for (const g of upcomingGames(board, now)) {
    for (const side of ['awayTeam', 'homeTeam']) {
      const team = g[side];
      if (!team?.slug || !follow.has(team.slug)) continue;
      const home = side === 'homeTeam';
      const opp = home ? g.awayTeam : g.homeTeam;
      const spreadHome = g.market?.spreadHome;
      const spread = Number.isFinite(spreadHome) ? `${team.shortName} ${signed(home ? spreadHome : -spreadHome)}` : null;
      const total = Number.isFinite(g.market?.total) ? `total ${g.market.total}` : null;
      rows.push({
        slug: team.slug,
        team: team.name,
        logo: team.logo || null,
        record: team.record || '',
        versus: `${home ? 'vs' : 'at'} ${opp?.name || opp?.shortName || ''}`,
        kickoff: g.startTime,
        line: [spread, total].filter(Boolean).join(', '),
        call: callFor(g),
      });
    }
  }
  return rows;
}

/** Everything the email shows, worked out once for HTML, text and the subject. */
export function nflPicksContent(data = {}) {
  const now = data.now ?? Date.now();
  const board = data.nflPicksBoard || data.board || null;
  const picks = launchPicks(board, { now });
  const leans = launchLeans(board, { now });
  const games = upcomingGames(board, now).length;
  return {
    week: board?.week || null,
    picks,
    leans,
    games,
    teams: yourTeams(board, data.pinnedSlugs, { now, picks, leans }),
  };
}

/** False when there is nothing upcoming to say; the run skips the send. */
export function hasNflPicksContent(data = {}) {
  const c = nflPicksContent(data);
  return c.picks.length + c.leans.length > 0;
}

function headline(c) {
  if (c.picks.length === 0) return 'No bet clears the bar.';
  const passed = Math.max(0, c.games - new Set(c.picks.map((p) => p.matchup)).size);
  return `${plural(c.picks.length, 'pick')}.${passed > 0 ? ` ${plural(passed, 'game')} passed.` : ''}`;
}

export function getSubject(data = {}) {
  const c = nflPicksContent(data);
  const wk = c.week ? `NFL Week ${c.week}` : 'NFL';
  if (c.picks.length > 0) return `${wk}: ${plural(c.picks.length, 'pick')} from Maximus`;
  return `${wk}: no bets yet, ${plural(c.leans.length, 'lean')} on the board`;
}

function teamRow(t) {
  const tone = t.call.kind === 'pick' ? { c: '#166534', bg: '#ecfdf3', label: 'Our pick' }
    : t.call.kind === 'lean' ? { c: '#475569', bg: '#f1f5f9', label: 'Lean' }
      : { c: '#475569', bg: '#f1f5f9', label: 'Pass' };
  const img = t.logo
    ? `<img src="${esc(t.logo)}" alt="" width="28" height="28" style="display:block;width:28px;height:28px;border:0;" />`
    : '';
  return `
<tr>
  <td style="padding:0 24px 10px;" class="section-td">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:separate;border:1px solid ${BORDER};border-radius:8px;">
      <tr>
        <td width="44" valign="top" style="width:44px;padding:13px 0 12px 14px;">${img}</td>
        <td valign="top" style="padding:12px 16px 12px 8px;font-family:${F};">
          <p style="margin:0;font-size:14px;font-weight:700;color:${TEXT};line-height:19px;font-family:${F};">${esc(t.team)}${t.record ? ` <span style="font-weight:500;color:${DIM};">${esc(t.record)}</span>` : ''}</p>
          <p style="margin:2px 0 0;font-size:13px;color:${BODY};line-height:19px;font-family:${F};">${esc(t.versus)}, ${esc(kickoff(t.kickoff))}${t.line ? `. ${esc(t.line)}` : ''}</p>
          <p style="margin:7px 0 0;font-size:13px;color:${NAVY};line-height:19px;font-family:${F};"><span style="display:inline-block;font-size:10px;font-weight:700;color:${tone.c};background-color:${tone.bg};border-radius:3px;padding:2px 7px;margin-right:6px;">${tone.label}</span><span style="font-weight:700;">${esc(t.call.text)}</span></p>
        </td>
      </tr>
    </table>
  </td>
</tr>`;
}

export function renderHTML(data = {}) {
  const c = nflPicksContent(data);
  const { displayName, userId } = data;
  const wk = c.week ? `NFL Week ${c.week}` : 'NFL';

  const hero = `
<tr>
  <td bgcolor="${NAVY}" style="background-color:${NAVY};padding:24px 24px 22px;" class="hero-td">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
      <tr>
        <td valign="middle" style="font-family:${F};">
          <p style="margin:0 0 8px;font-size:11px;font-weight:700;color:#7fb2e5;letter-spacing:0.14em;text-transform:uppercase;font-family:${F};">${wk} &middot; Maximus&rsquo;s picks</p>
          <h1 class="hero-h1" style="margin:0;font-size:28px;font-weight:800;color:#ffffff;line-height:1.15;letter-spacing:-0.02em;font-family:${F};">${esc(headline(c))}</h1>
          <p style="margin:10px 0 0;font-size:14px;color:#d6e2f0;line-height:21px;font-family:${F};">${displayName ? `${esc(displayName)}, here` : 'Here'} is the board for the ${plural(c.games, 'game')} still to play. Every pick is locked at the price shown and graded in public.</p>
        </td>
        <td width="92" valign="middle" align="right" style="width:92px;padding-left:10px;">
          <img src="${SITE}/mascot.png" alt="" width="84" height="84" style="display:block;width:84px;height:84px;border:0;" />
        </td>
      </tr>
    </table>
  </td>
</tr>`;

  const picksBlock = c.picks.length > 0
    ? `${sectionTitle('Recommended', c.picks.length === 1 ? 'The pick' : 'The picks')}${c.picks.map(pickCard).join('')}`
    : `
<tr>
  <td style="padding:20px 24px 4px;" class="section-td">
    <p style="margin:0;font-size:14px;color:${BODY};line-height:21px;font-family:${F};"><span style="font-weight:700;color:${TEXT};">Nothing is recommended right now.</span> A pick needs a sportsbook paying more than the fair price, and none does for the games left. Passing is part of the model. New picks post in the app as lines move.</p>
  </td>
</tr>`;

  const teamsBlock = c.teams.length > 0
    ? `${sectionTitle('Your teams', c.teams.length === 1 ? 'Your team this week' : 'Your teams this week')}${c.teams.map(teamRow).join('')}`
    : '';

  const leansBlock = c.leans.length > 0
    ? `${sectionTitle('Leans, not recommended bets', 'The rest of the board')}
<tr>
  <td style="padding:0 24px 12px;" class="section-td">
    <p style="margin:0;font-size:13px;color:${BODY};line-height:19px;font-family:${F};">A lean is the side the ratings prefer where no price beats fair. It is saved and graded like a pick, and never recommended.</p>
  </td>
</tr>${c.leans.map(leanCard).join('')}`
    : '';

  const close = `
<tr>
  <td style="padding:18px 24px 6px;" class="section-td">
    <p style="margin:0;font-size:13px;color:${BODY};line-height:20px;font-family:${F};">See every game four ways on <a href="${PICKS_URL}" style="color:#2d6ca8;font-weight:700;text-decoration:none;">the full board</a>, and every past pick, price and result on <a href="${RECORD_URL}" style="color:#2d6ca8;font-weight:700;text-decoration:none;">the public record</a>.</p>
    <p style="margin:12px 0 0;font-size:11px;color:${DIM};line-height:17px;font-family:${F};">21+. For entertainment only. Lines move: check the price before you bet. Gambling problem? Call 1-800-GAMBLER.</p>
  </td>
</tr>`;

  return EmailShell({
    content: [hero, picksBlock, teamsBlock, leansBlock, close].join('\n'),
    previewText: c.picks.length > 0
      ? `${c.picks.map((p) => p.pick).join(', ')}. Price, book and reason inside.`
      : `No bet clears the bar yet. ${plural(c.leans.length, 'lean')} on the games left.`,
    userId,
    ctaUrl: PICKS_URL,
    ctaLabel: 'Open the NFL board &rarr;',
  });
}

export function renderText(data = {}) {
  const c = nflPicksContent(data);
  const wk = c.week ? `NFL Week ${c.week}` : 'NFL';
  const out = [`${wk}: ${headline(c)}`, ''];
  if (c.picks.length > 0) {
    out.push('RECOMMENDED');
    for (const p of c.picks) {
      out.push(`- ${p.pick}${p.price ? ` (${p.price}${p.book ? ` at ${p.book}` : ''})` : ''}, ${p.matchup}, ${kickoff(p.kickoff)}`);
      if (p.why) out.push(`  Why: ${p.why}`);
    }
    out.push('');
  } else {
    out.push('Nothing is recommended right now. No sportsbook is paying more than the fair price on the games left.', '');
  }
  if (c.teams.length > 0) {
    out.push('YOUR TEAMS');
    for (const t of c.teams) out.push(`- ${t.team} ${t.versus}, ${kickoff(t.kickoff)}${t.line ? `. ${t.line}` : ''}. ${t.call.kind === 'pick' ? 'Our pick: ' : t.call.kind === 'lean' ? 'Lean: ' : ''}${t.call.text}`);
    out.push('');
  }
  if (c.leans.length > 0) {
    out.push('LEANS (not recommended bets)');
    for (const p of c.leans) out.push(`- ${p.pick}, ${p.matchup}, ${kickoff(p.kickoff)}${p.why ? `. ${p.why}` : ''}`);
    out.push('');
  }
  out.push(`The full board: ${PICKS_URL}`, `The public record: ${RECORD_URL}`, '', '21+. For entertainment only. Gambling problem? Call 1-800-GAMBLER.', 'Manage your emails: https://maximussports.ai/settings');
  return out.join('\n');
}
