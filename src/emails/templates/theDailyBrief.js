/**
 * The Daily Brief (email type `global_briefing`).
 *
 * Football first: what happened yesterday and how our calls did, then what
 * kicks off today. The NBA second: last night's scores and picks, then
 * tonight's card. The content is worked out in ../dailyBrief/model.js; this
 * file only lays it out.
 *
 * The look follows the app's brief card: an ink panel with the headline,
 * white cards with hairline borders, numbers set large, and the take in a
 * soft green box.
 *
 * Reads `data.dailyBrief` (see buildDailyBrief). The older cross-sport
 * template, globalBriefing.js, is no longer sent; it is kept for its MLB
 * sections until they are rebuilt on this layout.
 */
import { EmailShell } from '../EmailShell.js';
import { renderPartnerModule } from '../MlbEmailShell.js';
import { recordText } from '../dailyBrief/model.js';

const F = "'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,Helvetica,sans-serif";
const INK = '#0b1b33';
const INK2 = '#3b4d68';
const INK3 = '#5d6f8a';
const HAIR = '#e1e7f0';
const WASH = '#f3f6fb';
const BLUE = '#1668e3';
const UP = '#1f7a5c';
const UP_SOFT = '#e8f5ef';
const DOWN = '#b8452f';
const DOWN_SOFT = '#fbeeea';
const SITE = 'https://maximussports.ai';
const UTM = 'utm_source=email&utm_medium=email&utm_campaign=daily_brief';
const NFL_URL = `${SITE}/nfl?${UTM}`;
const NFL_PICKS_URL = `${SITE}/nfl/insights?${UTM}`;
const NBA_URL = `${SITE}/nba?${UTM}`;

const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const played = (r) => (r ? r.won + r.lost + r.push : 0);
const nflLogo = (abbrev, size = 26) => (abbrev
  ? `<img src="https://a.espncdn.com/i/teamlogos/nfl/500/${esc(String(abbrev).toLowerCase())}.png" alt="" width="${size}" height="${size}" style="display:inline-block;width:${size}px;height:${size}px;vertical-align:middle;border:0;" />`
  : '');

/* ── Pieces ──────────────────────────────────────────────────────────────── */

const row = (inner, pad = '0 24px 12px') => `
<tr><td style="padding:${pad};font-family:${F};" class="section-td">${inner}</td></tr>`;

const card = (inner, { pad = '14px 16px', border = HAIR, bg = '#ffffff', radius = 14 } = {}) => `
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:separate;border:1px solid ${border};border-radius:${radius}px;background-color:${bg};">
  <tr><td style="padding:${pad};font-family:${F};" class="card-td">${inner}</td></tr>
</table>`;

function hero(b) {
  return `
<tr>
  <td style="background-color:${INK};padding:22px 24px 24px;" class="hero-td">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
      <tr>
        <td valign="top" style="font-family:${F};">
          <p style="margin:0;font-size:13px;font-weight:600;color:#9db3d3;font-family:${F};">The Daily Brief, ${esc(b.date)}</p>
          <h1 style="margin:8px 0 0;font-size:27px;line-height:31px;font-weight:800;letter-spacing:-0.025em;color:#ffffff;font-family:${F};">${esc(b.headline)}</h1>
          ${b.dek ? `<p style="margin:10px 0 0;font-size:15px;line-height:22px;color:#d3dcea;font-family:${F};">${esc(b.dek)}</p>` : ''}
        </td>
        <td valign="top" align="right" width="68" style="width:68px;">
          <img src="${SITE}/mascot.png" alt="" width="58" style="display:block;width:58px;height:auto;border:0;margin-left:10px;" />
        </td>
      </tr>
    </table>
  </td>
</tr>`;
}

const sportHead = (name, aside = '') => row(`
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;"><tr>
    <td style="font-size:22px;font-weight:800;letter-spacing:-0.02em;color:${INK};font-family:${F};">${esc(name)}</td>
    <td align="right" style="font-size:13px;color:${INK3};font-family:${F};">${esc(aside)}</td>
  </tr></table>`, '26px 24px 10px');

const subHead = (text, aside = '') => row(`
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;"><tr>
    <td style="font-size:15px;font-weight:700;color:${INK};font-family:${F};">${esc(text)}</td>
    <td align="right" style="font-size:13px;color:${INK3};font-family:${F};">${esc(aside)}</td>
  </tr></table>`, '8px 24px 8px');

function tiles(items) {
  const shown = items.filter(Boolean);
  if (!shown.length) return '';
  const width = Math.floor(100 / shown.length);
  const cells = shown.map((t, i) => `
    <td width="${width}%" valign="top" style="padding:${i ? '0 0 0 8px' : '0'};">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:separate;background-color:${WASH};border-radius:12px;">
        <tr><td style="padding:12px 12px 11px;font-family:${F};">
          <p style="margin:0;font-size:25px;line-height:27px;font-weight:800;letter-spacing:-0.03em;color:${INK};font-family:${F};">${esc(t.big)}</p>
          <p style="margin:3px 0 0;font-size:12px;line-height:16px;color:${INK2};font-family:${F};">${esc(t.small)}</p>
        </td></tr>
      </table>
    </td>`).join('');
  return row(`<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;"><tr>${cells}</tr></table>`);
}

const STATUS = {
  won: { word: 'Won', color: UP, bg: UP_SOFT },
  lost: { word: 'Lost', color: DOWN, bg: DOWN_SOFT },
  push: { word: 'Push', color: INK2, bg: WASH },
};
const chip = (status) => {
  const s = STATUS[status] || STATUS.push;
  return `<span style="display:inline-block;font-size:12px;font-weight:700;color:${s.color};background-color:${s.bg};border-radius:999px;padding:2px 9px;font-family:${F};">${s.word}</span>`;
};
const statusWord = (status) => {
  const s = STATUS[status] || STATUS.push;
  return `<span style="font-weight:700;color:${s.color};">${s.word.toLowerCase()}</span>`;
};

/** A graded call: chip, what it was, where it was priced, and the review's note. */
function resultCard({ status, label, meta, note }) {
  return row(card(`
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;"><tr>
      <td style="font-size:17px;font-weight:800;letter-spacing:-0.01em;color:${INK};font-family:${F};">${esc(label)}</td>
      <td align="right" style="white-space:nowrap;">${chip(status)}</td>
    </tr></table>
    ${meta ? `<p style="margin:3px 0 0;font-size:13px;color:${INK3};font-family:${F};">${esc(meta)}</p>` : ''}
    ${note ? `<p style="margin:8px 0 0;font-size:14px;line-height:20px;color:${INK2};font-family:${F};">${esc(note)}</p>` : ''}`,
  { border: status === 'won' ? '#bfe3d3' : status === 'lost' ? '#f1cfc6' : HAIR }), '0 24px 10px');
}

function spotlightCard(g, title) {
  const calls = g.calls.map((c) => `
    <tr><td style="padding:9px 0 0;border-top:1px solid ${HAIR};font-family:${F};">
      <p style="margin:0;font-size:14px;line-height:20px;color:${INK};font-family:${F};"><span style="font-weight:700;">${esc(c.label)}</span> ${statusWord(c.status)}${c.recommended ? ` <span style="color:${INK3};">(pick)</span>` : ''}</p>
      ${c.note ? `<p style="margin:2px 0 9px;font-size:13px;line-height:19px;color:${INK2};font-family:${F};">${esc(c.note)}</p>` : '<p style="margin:0 0 9px;font-size:1px;line-height:1px;">&nbsp;</p>'}
    </td></tr>`).join('');
  return row(card(`
    <p style="margin:0;font-size:13px;font-weight:700;color:${INK3};font-family:${F};">${esc(title)}</p>
    <p style="margin:8px 0 12px;font-size:23px;line-height:28px;font-weight:800;letter-spacing:-0.02em;color:${INK};font-family:${F};">
      ${nflLogo(g.winner.abbrev)}&nbsp;${esc(g.winner.name)} ${g.winner.score}<span style="color:${INK3};font-weight:600;">,</span>
      <span style="color:${INK2};font-weight:700;">${nflLogo(g.loser.abbrev)}&nbsp;${esc(g.loser.name)} ${g.loser.score}</span>
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">${calls}</table>`,
  { pad: '14px 16px 4px' }), '0 24px 12px');
}

function gamesTable(games) {
  if (!games.length) return '';
  const side = (t, won) => `<span style="font-weight:${won ? 800 : 500};color:${won ? INK : INK2};">${esc(t.abbrev)} ${t.score}</span>`;
  const rows = games.map((g, i) => {
    const calls = g.calls.map((c) => `${c.recommended ? '<span style="font-weight:700;">' : '<span>'}${esc(c.label)}</span> ${statusWord(c.status)}`).join(' <span style="color:#b9c4d4;">&middot;</span> ');
    return `
    <tr><td style="padding:10px 0;${i ? `border-top:1px solid ${HAIR};` : ''}font-family:${F};">
      <p style="margin:0;font-size:15px;color:${INK};font-family:${F};">${side(g.away, g.winner === g.away)}<span style="color:${INK3};">, </span>${side(g.home, g.winner === g.home)}</p>
      <p style="margin:3px 0 0;font-size:13px;line-height:19px;color:${INK2};font-family:${F};">${calls}</p>
    </td></tr>`;
  }).join('');
  return row(card(`<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">${rows}</table>`, { pad: '4px 16px' }));
}

function nflGameCard(g) {
  const pick = g.picks.map((p) => `
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:separate;background-color:${UP_SOFT};border-radius:10px;margin-top:12px;">
      <tr><td style="padding:11px 13px;font-family:${F};">
        <p style="margin:0;font-size:12px;font-weight:700;color:${UP};font-family:${F};">Our pick${p.ev ? ` <span style="font-weight:600;">&middot; ${esc(p.ev)}</span>` : ''}</p>
        <p style="margin:2px 0 0;font-size:21px;line-height:26px;font-weight:800;letter-spacing:-0.02em;color:${INK};font-family:${F};">${esc(p.label)} <span style="font-size:14px;font-weight:600;color:${INK2};letter-spacing:0;">${esc([p.price, p.book ? `at ${p.book}` : ''].filter(Boolean).join(' '))}</span></p>
        ${!g.read && p.why ? `<p style="margin:6px 0 0;font-size:13px;line-height:19px;color:${INK2};font-family:${F};">${esc(p.why)}</p>` : ''}
      </td></tr>
    </table>`).join('');
  return row(card(`
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;"><tr>
      <td style="font-size:17px;font-weight:800;letter-spacing:-0.01em;color:${INK};font-family:${F};">${nflLogo(g.away.abbrev, 24)}&nbsp;${esc(g.away.name)} <span style="font-weight:500;color:${INK3};">at</span> ${nflLogo(g.home.abbrev, 24)}&nbsp;${esc(g.home.name)}</td>
      <td align="right" style="font-size:13px;color:${INK3};white-space:nowrap;font-family:${F};">${esc(g.kickoff)}</td>
    </tr></table>
    ${pick || `<p style="margin:10px 0 0;font-size:14px;color:${INK2};font-family:${F};">No recommended pick on this game.</p>`}
    ${g.read ? `<p style="margin:12px 0 0;font-size:14px;line-height:21px;color:${INK};font-family:${F};">${esc(g.read)}</p>` : ''}
    ${g.leans.length ? `<p style="margin:10px 0 0;font-size:13px;line-height:19px;color:${INK3};font-family:${F};">Leans, not bets: ${esc(g.leans.join(', '))}</p>` : ''}`), '0 24px 12px');
}

function numbers(list) {
  if (!list?.length) return '';
  const rows = list.map((n, i) => `
    <tr>
      <td width="84" valign="middle" style="width:84px;padding:10px 0;${i ? `border-top:1px solid ${HAIR};` : ''}font-size:24px;font-weight:800;letter-spacing:-0.03em;color:${INK};font-family:${F};">${esc(n.value)}</td>
      <td valign="middle" style="padding:10px 0;${i ? `border-top:1px solid ${HAIR};` : ''}font-size:13px;line-height:19px;color:${INK2};font-family:${F};">${esc(n.label)}</td>
    </tr>`).join('');
  return row(card(`<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">${rows}</table>`, { pad: '4px 16px' }));
}

const take = (text) => (text ? row(`
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:separate;background-color:${UP_SOFT};border-radius:14px;">
    <tr><td style="padding:13px 16px 14px;font-family:${F};">
      <p style="margin:0;font-size:12px;font-weight:700;color:${UP};font-family:${F};">Maximus’s take</p>
      <p style="margin:4px 0 0;font-size:15px;line-height:22px;color:${INK};font-family:${F};">${esc(text)}</p>
    </td></tr>
  </table>`) : '');

const para = (text, { color = INK2, size = 14 } = {}) => (text ? row(`<p style="margin:0;font-size:${size}px;line-height:${size + 7}px;color:${color};font-family:${F};">${esc(text)}</p>`) : '');
const link = (label, url) => row(`<a href="${url}" style="font-size:14px;font-weight:700;color:${BLUE};text-decoration:none;font-family:${F};">${esc(label)}</a>`, '2px 24px 6px');

/* ── Sections ────────────────────────────────────────────────────────────── */

function nflSeasonLine(s) {
  if (!s) return '';
  const bits = [];
  if (played(s.picks)) bits.push(`picks ${recordText(s.picks)}${s.units != null ? ` (${s.units > 0 ? '+' : ''}${s.units.toFixed(2)} units)` : ''}`);
  if (played(s.leans)) bits.push(`leans ${recordText(s.leans)}`);
  if (!bits.length) return '';
  let line = `Season so far: ${bits.join(', ')}.`;
  if (s.beatClosePct != null) line += ` Our picks beat the closing line ${Math.round(s.beatClosePct)}% of the time.`;
  return para(line, { color: INK3, size: 13 });
}

function nflBlock(nfl) {
  if (!nfl) return '';
  const out = [sportHead('NFL', nfl.week ? `Week ${nfl.week}` : '')];
  const y = nfl.yesterday;
  if (y) {
    out.push(subHead(`${y.day}’s results`));
    out.push(tiles([
      played(y.picks) ? { big: recordText(y.picks), small: 'Recommended picks' } : null,
      played(y.leans) ? { big: recordText(y.leans), small: 'Leans on every other market' } : null,
      played(y.totals) ? { big: recordText(y.totals), small: 'All totals' } : null,
    ]));
    for (const p of y.recommended) {
      out.push(resultCard({ status: p.status, label: p.label, meta: [p.matchup, p.final, [p.price, p.book ? `at ${p.book}` : ''].filter(Boolean).join(' ')].filter(Boolean).join(' · '), note: p.note }));
    }
    if (y.spotlight) out.push(spotlightCard(y.spotlight, y.games.length === 1 ? `${y.day} night` : `${y.day} night, the late game`));
    const rest = y.games.filter((g) => g !== y.spotlight);
    if (rest.length) {
      out.push(subHead('Every other game', 'Our calls, graded'));
      out.push(gamesTable(rest));
    }
  }
  const t = nfl.today;
  if (t) {
    out.push(subHead(t.when === 'tonight' ? 'Tonight' : 'Today'));
    for (const g of t.games) out.push(nflGameCard(g));
    out.push(numbers(nfl.numbers));
    out.push(take(nfl.take));
    out.push(para(nfl.also));
  } else if (!y) {
    // A quiet day: no results and no kickoff, so the brief about what is next carries the section.
    if (nfl.headline) out.push(para(nfl.headline, { color: INK, size: 17 }));
    out.push(para(nfl.dek));
    for (const text of nfl.next) out.push(row(card(`<p style="margin:0;font-size:14px;line-height:21px;color:${INK};font-family:${F};">${esc(text)}</p>`), '0 24px 10px'));
    out.push(numbers(nfl.numbers));
    out.push(take(nfl.take));
    out.push(para(nfl.also));
  }
  out.push(nflSeasonLine(nfl.season));
  out.push(link('All NFL picks and results', NFL_PICKS_URL));
  return out.join('');
}

function nbaScores(games) {
  const cell = (g) => (g ? `
    <td width="50%" style="padding:7px 0;font-size:14px;color:${INK2};font-family:${F};">
      <span style="font-weight:${g.homeWon ? 500 : 800};color:${g.homeWon ? INK2 : INK};">${esc(g.away.abbrev)} ${g.away.score}</span><span style="color:${INK3};">, </span><span style="font-weight:${g.homeWon ? 800 : 500};color:${g.homeWon ? INK : INK2};">${esc(g.home.abbrev)} ${g.home.score}</span>
    </td>` : '<td width="50%"></td>');
  const rows = [];
  for (let i = 0; i < games.length; i += 2) {
    rows.push(`<tr${i ? ` style="border-top:1px solid ${HAIR};"` : ''}>${cell(games[i])}${cell(games[i + 1])}</tr>`);
  }
  return row(card(`<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">${rows.join('')}</table>`, { pad: '6px 16px' }));
}

function nbaBlock(nba) {
  if (!nba) return '';
  const out = [sportHead('NBA', 'Around the league')];
  const ln = nba.lastNight;
  if (ln) {
    out.push(subHead('Last night', ln.record ? `Our picks: ${recordText(ln.record)}` : ''));
    for (const p of ln.picks) out.push(resultCard({ status: p.status, label: p.label, meta: p.matchup, note: p.text }));
    out.push(nbaScores(ln.games));
  }
  const picks = nba.tonight?.picks || [];
  if (picks.length || nba.dek) {
    out.push(subHead('Tonight', nba.tonight?.pickCount ? `${nba.tonight.pickCount} ${nba.tonight.pickCount === 1 ? 'pick' : 'picks'} on the card` : ''));
    out.push(para(nba.dek));
    for (const p of picks) {
      out.push(row(card(`
        <p style="margin:0;font-size:17px;font-weight:800;letter-spacing:-0.01em;color:${INK};font-family:${F};">${esc(p.label)}</p>
        <p style="margin:3px 0 0;font-size:13px;color:${INK3};font-family:${F};">${esc([p.matchup, p.tip, p.conviction != null ? `conviction ${p.conviction}` : ''].filter(Boolean).join(' · '))}</p>
        ${p.why ? `<p style="margin:8px 0 0;font-size:14px;line-height:20px;color:${INK2};font-family:${F};">${esc(p.why)}</p>` : ''}`), '0 24px 10px'));
    }
    out.push(take(nba.take));
  }
  out.push(para(nba.also));
  out.push(link('Tonight’s NBA board', NBA_URL));
  return out.join('');
}

/* ── Public API ──────────────────────────────────────────────────────────── */

const FALLBACK = { date: '', headline: 'The morning brief', dek: 'Today’s board is on the site.', subject: 'The Daily Brief', nfl: null, nba: null, empty: true };

export function getSubject(data = {}) {
  return data.dailyBrief?.subject || 'The Daily Brief';
}

export function renderHTML(data = {}) {
  const b = data.dailyBrief || FALLBACK;
  const content = `
${hero(b)}
${nflBlock(b.nfl)}
${nbaBlock(b.nba)}
${b.empty ? row(`<p style="margin:18px 0 0;font-size:15px;line-height:22px;color:${INK2};font-family:${F};">We could not load today’s board for this email. It is live on the site.</p>`) : ''}
${row('', '8px 24px 0')}
${b.empty ? '' : renderPartnerModule({ padding: '8px 24px 12px' })}
${row(`<p style="margin:0;font-size:11px;line-height:17px;color:${INK3};font-family:${F};">21+. For entertainment only. Gambling problem? Call 1-800-GAMBLER.</p>`, '4px 24px 8px')}`;

  return EmailShell({
    content,
    previewText: b.dek || b.headline,
    userId: data.userId || '',
    ctaUrl: `${SITE}/?${UTM}`,
    ctaLabel: 'Open Maximus Sports &rarr;',
  });
}

export function renderText(data = {}) {
  const b = data.dailyBrief || FALLBACK;
  const out = [`The Daily Brief, ${b.date}`, '', b.headline, b.dek, ''];
  const nfl = b.nfl;
  if (nfl) {
    out.push(`NFL${nfl.week ? `, Week ${nfl.week}` : ''}`, '-'.repeat(32));
    const y = nfl.yesterday;
    if (y) {
      out.push(`${y.day}: picks ${recordText(y.picks)}, leans ${recordText(y.leans)}, totals ${recordText(y.totals)}`);
      for (const p of y.recommended) out.push(`  ${p.status.toUpperCase()}: ${p.label} (${p.matchup}; ${p.final}). ${p.note}`);
      for (const g of y.games) out.push(`  ${g.away.abbrev} ${g.away.score}, ${g.home.abbrev} ${g.home.score}: ${g.calls.map((c) => `${c.label} ${c.status}`).join('; ')}`);
      out.push('');
    }
    if (nfl.today) {
      for (const g of nfl.today.games) {
        out.push(`${g.away.name} at ${g.home.name}, ${g.kickoff}`);
        for (const p of g.picks) out.push(`  Our pick: ${p.label} ${p.price}${p.book ? ` at ${p.book}` : ''}${p.ev ? ` (${p.ev})` : ''}`);
        if (g.read) out.push(`  ${g.read}`);
        if (g.leans.length) out.push(`  Leans, not bets: ${g.leans.join(', ')}`);
      }
      out.push('');
    }
    for (const t of nfl.next) out.push(`  ${t}`);
    if (nfl.today || !y) { if (nfl.take) out.push(`Maximus's take: ${nfl.take}`); if (nfl.also) out.push(nfl.also); }
    out.push(`All NFL picks and results: ${NFL_PICKS_URL}`, '');
  }
  const nba = b.nba;
  if (nba) {
    out.push('NBA', '-'.repeat(32));
    if (nba.lastNight) {
      if (nba.lastNight.record) out.push(`Last night, our picks: ${recordText(nba.lastNight.record)}`);
      for (const p of nba.lastNight.picks) out.push(`  ${p.status.toUpperCase()}: ${p.label} (${p.matchup}). ${p.text}`);
      out.push(`  ${nba.lastNight.games.map((g) => `${g.away.abbrev} ${g.away.score}, ${g.home.abbrev} ${g.home.score}`).join(' | ')}`);
    }
    if (nba.dek) out.push('', nba.dek);
    for (const p of nba.tonight?.picks || []) out.push(`  ${p.label} (${p.matchup}, ${p.tip}). ${p.why}`);
    if (nba.take) out.push(`Maximus's take: ${nba.take}`);
    out.push(`Tonight's NBA board: ${NBA_URL}`, '');
  }
  out.push('21+. For entertainment only. Gambling problem? Call 1-800-GAMBLER.', `${SITE}/settings to manage emails.`);
  return out.filter((l) => l != null).join('\n');
}
