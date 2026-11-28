/**
 * GET /nfl/<away>-vs-<home>-prediction — one NFL game in plain HTML, for
 * search engines and AI agents. Rewritten from vercel.json.
 *
 * It states what the logged-out home page states and no more (the data is
 * getPublicWeek, the same payload): the teams, kickoff, the market lines,
 * which position groups have the edge, and the call itself only for the
 * week's top three picks. Like /nfl-picks it carries no reasons and no
 * model numbers: an edge is "big", "an edge" or "even", never a figure.
 *
 * A matchup that is not on this week's schedule answers 404 with links to
 * the games that are. The reversed order redirects to away-vs-home.
 */
import { getPublicWeek } from '../_lib/nflPublicWeek.js';
import { getNflTeamBySlug } from '../../src/sports/nfl/teams.js';
import { ORIGIN, SITE } from '../../src/seo/siteCopy.js';
import { esc } from './_site.js';
import { gameShell } from './_gameShell.js';

const SUFFIX = '-prediction';
const MASCOT = '/brand/mascots/football-2d.webp';

/** The page address for a game: away first, as the schedule lists it. */
export const gameSlug = (game) => `${game.teams.away.slug}-vs-${game.teams.home.slug}${SUFFIX}`;
export const gamePath = (game) => `/nfl/${gameSlug(game)}`;

/** @returns {{ a: string, b: string }|null} the two team slugs in the order given */
export function parseGameSlug(slug) {
  const m = /^([a-z0-9]+)-vs-([a-z0-9]+)-prediction$/.exec(String(slug || '').toLowerCase());
  if (!m || m[1] === m[2] || !getNflTeamBySlug(m[1]) || !getNflTeamBySlug(m[2])) return null;
  return { a: m[1], b: m[2] };
}

/** @returns {{ game: object|null, reversed: boolean }} */
export function findGame(week, slug) {
  const pair = parseGameSlug(slug);
  const games = week?.games || [];
  if (!pair) return { game: null, reversed: false };
  const exact = games.find((g) => g.teams?.away?.slug === pair.a && g.teams?.home?.slug === pair.b);
  if (exact) return { game: exact, reversed: false };
  const flipped = games.find((g) => g.teams?.away?.slug === pair.b && g.teams?.home?.slug === pair.a);
  return { game: flipped || null, reversed: !!flipped };
}

const ET = (iso, opts) => { try { return new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', ...opts }); } catch { return ''; } };
const kickoffLong = (iso) => (iso ? `${ET(iso, { weekday: 'long', month: 'long', day: 'numeric' })} at ${ET(iso, { hour: 'numeric', minute: '2-digit' })} ET` : '');
const kickoffDay = (iso) => (iso ? ET(iso, { weekday: 'short', month: 'short', day: 'numeric' }) : '');
const kickoffTime = (iso) => (iso ? `${ET(iso, { hour: 'numeric', minute: '2-digit' })} ET` : '');
const stamp = (iso) => (iso ? `${ET(iso, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} ET` : '');
const signed = (v) => (v > 0 ? `+${v}` : `${v}`);
const cap = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : '');
const MARKET = { runline: 'Spread', total: 'Over/under', moneyline: 'Moneyline' };

/** What a moneyline says about each side's chance, with the book's margin shared out. */
export function impliedChance(moneyline) {
  const raw = (ml) => (!Number.isFinite(ml) || ml === 0 ? null : ml < 0 ? -ml / (-ml + 100) : 100 / (ml + 100));
  const home = raw(moneyline?.home);
  const away = raw(moneyline?.away);
  if (home == null || away == null) return null;
  const h = Math.round((home / (home + away)) * 100);
  return { home: h, away: 100 - h };
}

/** Everything the page prints about one game, as plain values. Pure. */
export function gameFacts(game) {
  const { away, home } = game.teams;
  const lines = game.lines || {};
  const final = game.status === 'final' || !!game.state?.final;
  const live = !final && (game.status === 'live' || !!game.state?.live);
  const spread = Number.isFinite(lines.spreadHome) ? lines.spreadHome : null;
  const total = Number.isFinite(lines.total) ? lines.total : null;
  const fav = spread == null || spread === 0 ? null : spread < 0 ? home : away;
  const dog = fav ? (fav === home ? away : home) : null;
  const by = spread == null ? null : Math.abs(spread);
  const awayScore = Number(away.score) || 0;
  const homeScore = Number(home.score) || 0;
  const winner = !final || awayScore === homeScore ? null : awayScore > homeScore ? away : home;
  const loser = winner ? (winner === away ? home : away) : null;
  // Against the spread and the total, from the final score and the closing lines.
  let covered = null;
  let totalResult = null;
  if (final && spread != null) {
    const margin = homeScore + spread - awayScore;
    covered = margin === 0 ? 'push' : margin > 0 ? home : away;
  }
  if (final && total != null) {
    const sum = awayScore + homeScore;
    totalResult = sum === total ? 'push' : sum > total ? 'over' : 'under';
  }
  const venue = [game.venue?.name, [game.venue?.city, game.venue?.state].filter(Boolean).join(', ')].filter(Boolean);
  return {
    away, home, final, live, spread, total, fav, dog, by,
    moneyline: lines.moneyline || null,
    chance: final ? null : impliedChance(lines.moneyline),
    closed: lines.kind === 'closed',
    awayScore, homeScore, winner, loser, covered, totalResult,
    venue, network: game.network || '',
    title: `${away.nickname} vs ${home.nickname}`,
    rows: game.matchup?.rows || [],
    pick: game.pick || null,
  };
}

const nick = (f, abbrev) => (abbrev === f.home.abbrev ? f.home.nickname : abbrev === f.away.abbrev ? f.away.nickname : abbrev);

function spreadText(f) {
  if (f.spread == null) return '';
  if (!f.fav) return `The game is a pick’em: neither the ${f.away.nickname} nor the ${f.home.nickname} is favored.`;
  return `The ${f.fav.nickname} are ${f.by}-point favorites${f.fav === f.away ? ' on the road' : ' at home'} over the ${f.dog.nickname}.`;
}

function pickPrice(p) {
  if (p.market === 'moneyline') return p.book ? `at ${p.book}` : '';
  return [Number.isFinite(p.price) ? signed(p.price) : '', p.book ? `at ${p.book}` : ''].filter(Boolean).join(' ');
}

function faq(f, weekLabel) {
  const out = [];
  const t = f.title;
  if (f.final) {
    if (f.winner) out.push({ q: `Who won ${t}?`, a: `The ${f.winner.nickname} beat the ${f.loser.nickname} ${Math.max(f.awayScore, f.homeScore)}-${Math.min(f.awayScore, f.homeScore)} in ${weekLabel}.` });
    if (f.covered) out.push({ q: `Who covered the spread in ${t}?`, a: f.covered === 'push' ? `Nobody: the game landed on the closing spread of ${f.home.abbrev} ${signed(f.spread)}, a push.` : `The ${f.covered.nickname} covered. The spread closed at ${f.home.abbrev} ${f.spread === 0 ? 'PK' : signed(f.spread)}.` });
    if (f.totalResult) out.push({ q: `Did ${t} go over or under?`, a: f.totalResult === 'push' ? `Neither: ${f.awayScore + f.homeScore} points matched the closing total of ${f.total}.` : `${cap(f.totalResult)}. The teams combined for ${f.awayScore + f.homeScore} points against a closing total of ${f.total}.` });
  } else {
    if (f.spread != null) out.push({ q: `Who is favored in ${t}?`, a: `${spreadText(f)}${f.moneyline ? ` The moneyline is ${f.away.nickname} ${signed(f.moneyline.away)}, ${f.home.nickname} ${signed(f.moneyline.home)}.` : ''}` });
    if (f.total != null) out.push({ q: `What is the over/under for ${t}?`, a: `The total is ${f.total} points.` });
    out.push({ q: `What time is ${t}, and what channel is it on?`, a: `Kickoff is ${kickoffLong(f.startTime)}${f.venue[0] ? ` at ${f.venue[0]}` : ''}${f.network ? `, on ${f.network}` : ''}.` });
  }
  if (f.pick) {
    const p = f.pick;
    const graded = p.result?.verdict ? ` It ${p.result.verdict === 'push' ? 'pushed' : p.result.verdict}.` : '';
    out.push({ q: `What is the Maximus pick for ${t}?`, a: `${p.role === 'recommended' ? 'The recommended pick' : 'The lean'} is ${p.label}${pickPrice(p) ? ` ${pickPrice(p)}` : ''}${p.lockedAt ? `, locked ${stamp(p.lockedAt)}` : ''}.${graded}${f.final ? '' : ' Lines move, so check the price before you bet.'}` });
  } else if (!f.final) {
    out.push({ q: `What is the Maximus pick for ${t}?`, a: 'Maximus has a call on the spread, the over/under and the moneyline for this game. The week’s top three picks are open to everyone; the call on this game opens with a free account, and you can ask Maximus about it without one.' });
  }
  const top = f.rows.find((r) => r.favours);
  if (top) {
    const favUnit = top.favours === top.offenseTeam ? top.offense : top.defense;
    const otherTeam = top.favours === top.offenseTeam ? top.defenseTeam : top.offenseTeam;
    const otherUnit = top.favours === top.offenseTeam ? top.defense : top.offense;
    out.push({ q: `Where is the biggest mismatch in ${t}?`, a: `The ${nick(f, top.favours)} ${favUnit} against the ${nick(f, otherTeam)} ${otherUnit}. Every starter is rated, and that is the widest gap between two units that line up against each other.` });
  }
  return out;
}

/* ── HTML blocks ── */

function boardHtml(f, g) {
  const side = (t, where) => `<a class="side" href="/nfl/teams/${esc(t.slug)}">
${t.logo ? `<img src="${esc(t.logo)}" alt="" width="76" height="76">` : ''}
<span class="name">${esc(t.nickname)}</span>
<span class="rec">${esc(t.record || '')}${t.record ? ' · ' : ''}${where}</span></a>`;
  const mid = f.final || f.live
    ? `<span class="score">${f.winner === f.home ? `<i>${f.awayScore}</i>` : f.awayScore}<i> – </i>${f.winner === f.away ? `<i>${f.homeScore}</i>` : f.homeScore}</span><span class="when">${f.final ? `Final${g.state?.overtime ? ' (OT)' : ''}` : esc(g.state?.label || 'Live')}</span>`
    : `<span class="at">AT</span><span class="when">${esc(kickoffDay(g.startTime))}<br>${esc(kickoffTime(g.startTime))}</span>`;
  const foot = [f.venue.length ? `<span><b>${esc(f.venue[0])}</b>${f.venue[1] ? `, ${esc(f.venue[1])}` : ''}</span>` : '', f.network ? `<span>TV: <b>${esc(f.network)}</b></span>` : ''].filter(Boolean).join('');
  return `<section class="tile board" aria-label="${esc(f.title)}">
${side(f.away, 'Away')}<div class="mid">${mid}</div>${side(f.home, 'Home')}
${foot ? `<div class="boardFoot">${foot}</div>` : ''}
</section>`;
}

function linesHtml(f) {
  if (f.spread == null && f.total == null && !f.moneyline) return '';
  const word = f.closed ? 'Closing ' : '';
  const tiles = [];
  if (f.spread != null) {
    tiles.push(`<div class="tile lineTile"><div class="label">${word}Spread</div><div class="big">${f.fav ? `${esc(f.fav.abbrev)} ${signed(-f.by)}` : 'Pick’em'}</div><div class="note">${f.covered ? (f.covered === 'push' ? 'Result: push' : `Result: ${esc(f.covered.nickname)} covered`) : f.fav ? `${esc(f.dog.nickname)} ${signed(f.by)}` : 'No favorite'}</div></div>`);
  }
  if (f.total != null) {
    tiles.push(`<div class="tile lineTile"><div class="label">${word}Over/under</div><div class="big">${f.total}</div><div class="note">${f.totalResult ? (f.totalResult === 'push' ? `Result: push at ${f.awayScore + f.homeScore}` : `Result: ${f.totalResult}, ${f.awayScore + f.homeScore} points`) : 'Combined points'}</div></div>`);
  }
  if (f.moneyline) {
    tiles.push(`<div class="tile lineTile"><div class="label">Moneyline</div><div class="note">To win outright</div><div class="pair"><span>${signed(f.moneyline.away)}<small>${esc(f.away.abbrev)}</small></span><span>${signed(f.moneyline.home)}<small>${esc(f.home.abbrev)}</small></span></div></div>`);
  }
  return `<section class="lines" aria-label="Betting lines">${tiles.join('')}</section>`;
}

function chanceHtml(f) {
  if (!f.chance) return '';
  return `<section class="tile"><h2>Who the market expects to win</h2><p class="sub">Each side’s chance, as the moneyline prices it.</p>
<div class="chance" role="img" aria-label="${esc(f.away.nickname)} ${f.chance.away}%, ${esc(f.home.nickname)} ${f.chance.home}%"><i class="a" style="width:${f.chance.away}%"></i><i class="h" style="width:${f.chance.home}%"></i></div>
<div class="chanceRow"><span><b>${f.chance.away}%</b><br><i class="key" style="background:var(--cyan)"></i>${esc(f.away.nickname)}</span><span class="r"><b>${f.chance.home}%</b><br>${esc(f.home.nickname)}<i class="key" style="background:var(--blue);margin:0 0 0 6px"></i></span></div></section>`;
}

function callHtml(f, g) {
  const p = f.pick;
  const appGame = `/nfl/games/${f.away.slug}-at-${f.home.slug}`;
  if (p) {
    const verdict = p.result?.verdict;
    const tag = verdict ? `<span class="tag ${verdict}">${verdict === 'won' ? 'Won' : verdict === 'lost' ? 'Lost' : 'Push'}</span>` : '';
    return `<section class="tile call"><div class="callHead"><h2>The Maximus call</h2><span class="tag ${p.role === 'recommended' ? 'rec' : 'lean'}">${p.role === 'recommended' ? 'Recommended' : 'Lean'}</span></div>
<p class="sub">${esc(MARKET[p.market] || '')}${p.rank ? ` · No. ${p.rank} pick of the week` : ''}</p>
<div class="pickBox${verdict === 'won' ? ' won' : verdict === 'lost' ? ' lost' : ''}">${p.team?.logo ? `<img src="${esc(p.team.logo)}" alt="" width="44" height="44">` : ''}<div><div class="pickLabel">${esc(p.label)}</div><div class="pickMeta">${esc(pickPrice(p))}${p.lockedAt ? `${pickPrice(p) ? ' · ' : ''}Locked ${esc(stamp(p.lockedAt))}` : ''}</div></div>${tag ? `<div style="margin-left:auto">${tag}</div>` : ''}</div>
${p.result?.text ? `<p class="fine">${esc(p.result.text)}</p>` : ''}
<p class="fine">${p.role === 'recommended' ? 'A pick is recommended only when a sportsbook’s price beats the market’s fair price.' : 'A lean is the model’s side when no sportsbook price beats the market. It is tracked and graded, not recommended.'}${f.final ? '' : ' Lines move: check the price before you bet.'} Every result goes on <a href="/record">the public record</a>.</p>
<div class="actions"><a class="btn" href="${appGame}">Open the full game page</a><a class="btn ghost" href="/nfl-picks">All ${esc(g.weekLabel)} picks</a></div></section>`;
  }
  if (f.final) return '';
  const cell = (label) => `<div class="lockCell"><div class="label">${label}</div><div class="bars" aria-hidden="true"><i></i><i></i></div><div class="hint">Free account</div></div>`;
  return `<section class="tile call"><div class="callHead"><h2>The Maximus call</h2><span class="tag lean">3 calls</span></div>
<p class="sub">A side against the spread, an over or under, and a moneyline read.</p>
<div class="locked">${cell('Spread')}${cell('Over/under')}${cell('Moneyline')}</div>
<p class="fine">The week’s top three picks are open to everyone on <a href="/nfl-picks">the NFL picks page</a>. The call on this game opens with a free account, and every result goes on <a href="/record">the public record</a>.</p>
<div class="actions"><a class="btn" href="${appGame}">See the call, free</a><a class="btn ghost" href="/nfl-picks">This week’s top picks</a></div></section>`;
}

function matchupHtml(f) {
  if (!f.rows.length) return '';
  const row = (r) => {
    const even = r.size === 'even' || !r.favours;
    const toHome = r.favours === f.home.abbrev;
    const width = even ? 0 : r.size === 'big' ? 44 : 24;
    const verdict = even ? '<span class="verdict">Even</span>' : `<span class="verdict ${r.size === 'big' ? 'big' : 'some'}">${r.size === 'big' ? 'Big edge' : 'Edge'}: ${esc(nick(f, r.favours))}</span>`;
    return `<div class="edge"><div class="units">${esc(nick(f, r.offenseTeam))} ${esc(r.offense)} <span>vs</span> ${esc(nick(f, r.defenseTeam))} ${esc(r.defense)}</div>${verdict}
<div class="track" aria-hidden="true">${even ? '' : `<i class="${toHome ? 'toRight' : 'toLeft'}" style="width:${width}%"></i>`}</div>
<div class="ends" aria-hidden="true"><span>${esc(f.away.abbrev)}</span><span>${esc(f.home.abbrev)}</span></div></div>`;
  };
  return `<section class="tile"><h2>${f.final ? 'How the units matched up' : 'Where the game is decided'}</h2><p class="sub">The widest gaps between units that line up against each other. Every starter is rated.</p>
${f.rows.map(row).join('\n')}
<p class="fine">The full game page has each unit’s rating and the players behind it.</p></section>`;
}

function askHtml(f) {
  const q = (text) => `/ask?q=${encodeURIComponent(text)}`;
  const pair = `${f.away.nickname} at ${f.home.nickname}`;
  // The link carries the teams; the label does not need to repeat them.
  const prompts = [
    ['🏈', 'Break down this game', `Break down ${pair}`],
    ['🧱', 'Where is the biggest mismatch?', `Where is the biggest mismatch in ${pair}?`],
    ['🎯', 'What is your call?', `What is your call on ${pair}?`],
  ];
  return `<section class="ask"><div><h2>Ask Maximus about this game</h2><p>Our AI assistant answers from the live board: the lines, the injuries, the matchups and the call.</p></div>
<img src="${MASCOT}" alt="" width="96" height="96" loading="lazy">
<div class="prompts">${prompts.map(([e, label, text]) => `<a class="prompt" href="${q(text)}"><i aria-hidden="true">${e}</i><span>“${esc(label)}”</span><b>Ask ›</b></a>`).join('')}</div>
<p class="fineNavy">3 free questions a day. No account, no email.</p></section>`;
}

function factsHtml(f, g) {
  const rows = [
    ['Matchup', `${f.away.name} at ${f.home.name}`],
    ['Week', g.weekLabel],
    ['Kickoff', kickoffLong(g.startTime)],
    f.venue.length ? ['Stadium', f.venue.join(', ')] : null,
    f.network ? ['TV', f.network] : null,
    f.away.record ? [`${f.away.nickname} record`, f.away.record] : null,
    f.home.record ? [`${f.home.nickname} record`, f.home.record] : null,
  ].filter(Boolean);
  return `<section class="tile"><h2>Game details</h2><table class="facts">${rows.map(([k, v]) => `<tr><th scope="row">${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</table></section>`;
}

function othersHtml(week, game) {
  const others = (week.games || []).filter((x) => x.gameId !== game.gameId && x.teams?.away?.slug && x.teams?.home?.slug)
    .sort((a, b) => (Date.parse(a.startTime) || 0) - (Date.parse(b.startTime) || 0));
  if (!others.length) return '';
  const link = (x) => {
    const final = x.status === 'final';
    const sub = final ? `Final: ${x.teams.away.abbrev} ${x.teams.away.score}, ${x.teams.home.abbrev} ${x.teams.home.score}` : `${kickoffDay(x.startTime)}, ${kickoffTime(x.startTime)}`;
    return `<a class="gameLink" href="${gamePath(x)}"><span class="logos">${[x.teams.away, x.teams.home].map((t) => (t.logo ? `<img src="${esc(t.logo)}" alt="" width="26" height="26" loading="lazy">` : '')).join('')}</span><span>${esc(x.teams.away.nickname)} vs ${esc(x.teams.home.nickname)}<small>${esc(sub)}</small></span><span class="go" aria-hidden="true">›</span></a>`;
  };
  return `<section class="section"><h2>More ${esc(week.label || 'NFL')} games</h2><p>Lines, matchups and the call for every game on the schedule.</p><div class="games">${others.map(link).join('')}</div></section>`;
}

/** The whole page for one game. Pure: everything comes from `week`. */
export function renderNflGame(week, game) {
  const weekLabel = week.label || 'this week';
  const g = { ...game, weekLabel };
  const f = { ...gameFacts(game), startTime: game.startTime };
  const path = gamePath(game);
  const questions = faq(f, weekLabel);
  const title = f.final
    ? `${f.title}: Final Score, Spread and Total Result (${weekLabel}) | ${SITE.name}`
    : `${f.title} Prediction, Odds and Pick (${weekLabel}) | ${SITE.name}`;
  const lineBits = [f.fav ? `${f.fav.nickname} ${signed(-f.by)}` : f.spread === 0 ? 'pick’em' : '', f.total != null ? `total ${f.total}` : ''].filter(Boolean).join(', ');
  const description = f.final
    ? `${f.winner ? `${f.winner.nickname} ${Math.max(f.awayScore, f.homeScore)}, ${f.loser.nickname} ${Math.min(f.awayScore, f.homeScore)}` : `${f.away.nickname} ${f.awayScore}, ${f.home.nickname} ${f.homeScore}`} in ${weekLabel}. Who covered the spread, whether it went over, and how the Maximus call was graded.`
    : `${f.away.name} at ${f.home.name}, ${kickoffLong(game.startTime)}${lineBits ? `: ${lineBits}` : ''}. The odds, the position-group matchups that decide it, and the Maximus call.`;
  const pills = [
    `<span class="pill">${esc(weekLabel)}</span>`,
    f.final ? '<span class="pill final">Final</span>' : f.live ? '<span class="pill live">Live</span>' : `<span class="pill">${esc(kickoffDay(game.startTime))} · ${esc(kickoffTime(game.startTime))}</span>`,
    f.network && !f.final ? `<span class="pill">${esc(f.network)}</span>` : '',
  ].join('');
  const lede = f.final
    ? `${f.winner ? `The ${esc(f.winner.nickname)} beat the ${esc(f.loser.nickname)} ${Math.max(f.awayScore, f.homeScore)}–${Math.min(f.awayScore, f.homeScore)}.` : `The ${esc(f.away.nickname)} and ${esc(f.home.nickname)} tied.`} Here is how the game finished against the closing lines.`
    : `${esc(spreadText(f))}${f.total != null ? ` The over/under is ${f.total}.` : ''} Here are the odds, the matchups that decide it and the Maximus call.`;
  const body = `
<nav class="crumbs" aria-label="Breadcrumb"><a href="/nfl-picks">NFL picks</a><span>›</span>${esc(weekLabel)}<span>›</span>${esc(f.title)}</nav>
<div class="kicker">${pills}</div>
<h1>${esc(f.away.nickname)} vs ${esc(f.home.nickname)} <span class="accent">${f.final ? 'final score and results' : 'prediction, odds and pick'}</span></h1>
<p class="lede">${lede}</p>
${boardHtml(f, g)}
<div class="stack">
${linesHtml(f)}
${callHtml(f, g)}
${chanceHtml(f)}
${matchupHtml(f)}
</div>
${askHtml(f)}
<div class="stack">
${factsHtml(f, g)}
<section class="tile qa"><h2>${esc(f.title)}: questions and answers</h2>
${questions.map((x) => `<h3>${esc(x.q)}</h3><p>${esc(x.a)}</p>`).join('\n')}</section>
</div>
${othersHtml(week, game)}
`;
  const url = `${ORIGIN}${path}`;
  const teamNode = (t) => ({ '@type': 'SportsTeam', name: t.name, url: `${ORIGIN}/nfl/teams/${t.slug}`, ...(t.logo ? { logo: t.logo } : {}) });
  const jsonLd = [
    {
      '@type': 'SportsEvent', '@id': `${url}#event`, name: `${f.away.name} at ${f.home.name}`, url, sport: 'American football',
      startDate: game.startTime, eventStatus: 'https://schema.org/EventScheduled',
      description,
      homeTeam: teamNode(f.home), awayTeam: teamNode(f.away), competitor: [teamNode(f.away), teamNode(f.home)],
      ...(f.venue.length ? { location: { '@type': 'Place', name: f.venue[0], address: { '@type': 'PostalAddress', addressLocality: game.venue?.city || '', addressRegion: game.venue?.state || '', addressCountry: 'US' } } } : {}),
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'NFL picks', item: `${ORIGIN}/nfl-picks` },
        { '@type': 'ListItem', position: 2, name: f.title, item: url },
      ],
    },
    { '@type': 'FAQPage', mainEntity: questions.map((x) => ({ '@type': 'Question', name: x.q, acceptedAnswer: { '@type': 'Answer', text: x.a } })) },
  ];
  return gameShell({ title, description, path, body, jsonLd });
}

/** A matchup that is not on this week's schedule. */
export function renderNoGame(week, slug) {
  const pair = parseGameSlug(slug);
  const names = pair ? `${getNflTeamBySlug(pair.a).nickname} vs ${getNflTeamBySlug(pair.b).nickname}` : 'That game';
  const weekLabel = week?.label || 'this week';
  const list = othersHtml({ ...(week || {}), label: weekLabel }, { gameId: null });
  const body = `
<nav class="crumbs" aria-label="Breadcrumb"><a href="/nfl-picks">NFL picks</a><span>›</span>${esc(weekLabel)}</nav>
<h1>${esc(names)} <span class="accent">is not on the ${esc(weekLabel)} schedule</span></h1>
<p class="lede">Game pages cover the current week. Here are the games that are on, each with its odds, its matchups and the Maximus call.</p>
<div class="actions"><a class="btn" href="/nfl-picks">This week’s NFL picks</a><a class="btn onNavy" href="/ask">Ask Maximus</a></div>
${list}
`;
  return gameShell({ title: `${names}: not on this week’s schedule | ${SITE.name}`, description: `There is no ${names} game in ${weekLabel}. See this week’s NFL games, odds and picks.`, path: `/nfl/${pair ? `${pair.a}-vs-${pair.b}${SUFFIX}` : ''}`, body, index: false });
}

export default async function handler(req, res) {
  const slug = String(req.query?.matchup || '').toLowerCase();
  const week = await getPublicWeek().catch(() => null);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  const { game, reversed } = findGame(week, slug);
  if (game && reversed) {
    res.setHeader('Cache-Control', 'public, s-maxage=3600');
    res.setHeader('Location', gamePath(game));
    return res.status(301).end();
  }
  if (!game) {
    // No schedule at all is our failure, not a missing page: do not let it be cached as one.
    res.setHeader('Cache-Control', week?.ok ? 'public, s-maxage=300, stale-while-revalidate=600' : 'no-store');
    return res.status(week?.ok ? 404 : 503).send(renderNoGame(week, slug));
  }
  // Scores move during a game; lines move all week.
  const hold = game.status === 'live' ? 30 : game.status === 'final' ? 3600 : 300;
  res.setHeader('Cache-Control', `public, s-maxage=${hold}, stale-while-revalidate=${hold * 4}`);
  return res.status(200).send(renderNflGame(week, game));
}
