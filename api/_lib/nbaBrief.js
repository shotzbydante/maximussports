/**
 * The NBA brief: what is on tonight, where our picks stand, and what the
 * numbers say. The same three layers as the NFL brief, each testable alone:
 *
 *   buildNbaBriefData()   every fact the brief may use, computed here so the
 *                         writer never does arithmetic
 *   buildNbaEngineBrief() a complete brief written from those facts with no
 *                         language model: the floor, and what a preview
 *                         build or a failed model call shows
 *   nbaBriefPrompt() / parseNbaBrief()
 *                         Claude rewrites the brief in Maximus's voice. Its
 *                         reply is checked against the data and thrown away
 *                         if it names a game that is not on the slate.
 *
 * The brief is structured: { headline, dek, now[], next[], numbers[], take, also }.
 * `now` and `next` items carry a gameId, so the page draws the logos, the
 * tip time and the live score itself.
 */

import { nbaNickname } from '../../src/sports/nba/teams.js';
import { pickLiveStatus } from '../../src/features/nfl/picks/pickLive.js';
import { maximusPicks, nbaPickSummary, totalSample, score } from '../../src/features/nba/picks/pickSummary.js';
import { fixPositiveOdds } from './oddsText.js';

export const NBA_BRIEF_LIMITS = Object.freeze({ headline: 72, dek: 220, item: 230, take: 340, also: 440, value: 9, label: 110, now: 4, next: 5, numbers: 3 });

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const odds = (v) => (isNum(v) ? (v > 0 ? `+${v}` : `${v}`) : null);
const line = (v) => (isNum(v) ? (v > 0 ? `+${v}` : v === 0 ? 'PK' : `${v}`) : null);
const NUMBER_WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen'];
const count = (n) => NUMBER_WORDS[n] || String(n);
const plural = (n, word) => `${n === 1 ? word : `${word}s`}`;

function et(iso, opts) {
  try { return new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', ...opts }); } catch { return ''; }
}
const tipText = (iso) => `${et(iso, { hour: 'numeric', minute: '2-digit' })} ET`;

/** "MIA -4.5", or "pick’em": the favorite and what it is laying. */
function spreadText(game) {
  const s = game.market?.pregameSpread;
  if (!isNum(s)) return null;
  if (s === 0) return 'pick’em';
  const fav = s < 0 ? game.teams.home : game.teams.away;
  return `${fav.abbrev} ${line(-Math.abs(s))}`;
}

const QUARTERS = { 1: 'first quarter', 2: 'second quarter', 3: 'third quarter', 4: 'fourth quarter' };
function stageOf(game) {
  const gs = game.gameState || {};
  if (/half/i.test(gs.periodLabel || '')) return 'halftime';
  if (gs.period > 4) return 'overtime';
  return QUARTERS[gs.period] || 'under way';
}

/** Our pick on a game as the brief states it: the call, the reason, and how much it rests on. */
function pickFact(p) {
  const sample = p.market?.type === 'total' ? totalSample(p) : null;
  return {
    call: p.selection?.label,
    market: p.market?.type === 'runline' ? 'spread' : p.market?.type,
    conviction: score(p),
    why: nbaPickSummary(p),
    ...(sample != null ? { builtOnGames: sample } : {}),
  };
}

const withoutClock = (text) => String(text || '').replace(/\s+at\s+[^.]*?(?=[.,])/, '').replace(/\s+so far/, '');

/**
 * @param {object} args
 * @param {Array}  args.games      today's slate from the games feed
 * @param {object} [args.board]    the picks board (fullSlatePicks, startedPicks)
 * @param {object} [args.champOdds] title odds keyed by team slug
 * @param {Array}  [args.headlines]
 * @param {Date}   [args.now]
 */
export function buildNbaBriefData({ games = [], board = null, champOdds = {}, headlines = [], now = new Date() }) {
  const byId = new Map(games.map((g) => [String(g.gameId), g]));
  const picks = maximusPicks(board);
  const pickByGame = new Map();
  for (const p of picks) if (!pickByGame.has(String(p.gameId))) pickByGame.set(String(p.gameId), p);
  const startedByGame = new Map((board?.startedPicks || []).map((p) => [String(p.gameId), p]));

  const base = (g) => ({
    gameId: String(g.gameId),
    away: g.teams.away.abbrev,
    home: g.teams.home.abbrev,
    awayName: nbaNickname(g.teams.away.slug) || g.teams.away.name,
    homeName: nbaNickname(g.teams.home.slug) || g.teams.home.name,
    ...(g.teams.away.record ? { awayRecord: g.teams.away.record } : {}),
    ...(g.teams.home.record ? { homeRecord: g.teams.home.record } : {}),
    ...(g.venue?.name ? { arena: g.venue.name } : {}),
  });

  const standing = (g) => {
    // A pick still on the board for a game that has tipped off, or one the ledger carried over.
    const live = startedByGame.get(String(g.gameId))
      || (pickByGame.has(String(g.gameId)) ? (() => { const p = pickByGame.get(String(g.gameId)); return { market: p.market?.type, side: p.selection?.side, line: p.market?.line ?? null, label: p.selection?.label }; })() : null);
    if (!live) return null;
    const s = pickLiveStatus(live, g);
    return { call: live.label, verdict: s.verdict, standing: withoutClock(s.text) };
  };

  const order = (a, b) => Date.parse(a.startTime) - Date.parse(b.startTime);
  const liveGames = games.filter((g) => g.status === 'live').sort(order).map((g) => {
    const our = standing(g);
    return { ...base(g), stage: stageOf(g), ...(our ? { maximusPick: our } : {}) };
  });

  const gamesToCome = games.filter((g) => g.status === 'upcoming').sort(order).map((g) => {
    const p = pickByGame.get(String(g.gameId));
    const ml = g.market?.moneyline || {};
    return {
      ...base(g),
      tip: tipText(g.startTime),
      ...(spreadText(g) ? { spread: spreadText(g) } : {}),
      ...(isNum(g.market?.pregameTotal) ? { total: g.market.pregameTotal } : {}),
      ...(isNum(ml.away) && isNum(ml.home) ? { moneyline: `${g.teams.away.abbrev} ${odds(ml.away)}, ${g.teams.home.abbrev} ${odds(ml.home)}` } : {}),
      ...(g.broadcast?.network ? { tv: g.broadcast.network } : {}),
      ...(p ? { maximusPick: pickFact(p) } : {}),
    };
  });

  const finals = games.filter((g) => g.status === 'final').map((g) => {
    const our = standing(g);
    const { away, home } = g.teams;
    const awayWon = (away.score ?? 0) > (home.score ?? 0);
    return {
      ...base(g),
      result: `${awayWon ? away.abbrev : home.abbrev} won ${Math.max(away.score ?? 0, home.score ?? 0)}-${Math.min(away.score ?? 0, home.score ?? 0)}`,
      ...(our ? { maximusPick: our } : {}),
    };
  });

  const titleMarket = Object.entries(champOdds || {})
    .map(([slug, v]) => ({ team: nbaNickname(slug), price: v?.bestChanceAmerican }))
    .filter((t) => t.team && isNum(t.price))
    .sort((a, b) => a.price - b.price)
    .slice(0, 5)
    .map((t) => ({ team: t.team, price: odds(t.price) }));

  return {
    now: `${et(now.toISOString(), { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })} ET`,
    counts: { live: liveGames.length, toCome: gamesToCome.length, final: finals.length },
    liveGames,
    gamesToCome,
    finals,
    picksToCome: gamesToCome.filter((g) => g.maximusPick).length,
    titleMarket,
    headlines: (headlines || []).slice(0, 8).map((x) => x.title).filter(Boolean),
    ids: { live: liveGames.map((g) => g.gameId), toCome: gamesToCome.map((g) => g.gameId) },
    _games: byId,
  };
}

/** The brief is rewritten when the slate changes shape: a game tips off or ends, or the picks change. */
export function nbaBriefSignature(games, board) {
  const c = { live: 0, upcoming: 0, final: 0 };
  for (const g of games || []) if (c[g.status] != null) c[g.status] += 1;
  return `l${c.live}|u${c.upcoming}|f${c.final}|p${maximusPicks(board).map((p) => p.id).sort().join(',')}`;
}

/* ── The factual brief, no model ─────────────────────────────────────── */

function nextLine(g) {
  const parts = [];
  if (g.spread && g.total != null) parts.push(`${g.spread}, total ${g.total}.`);
  else if (g.spread) parts.push(`${g.spread}.`);
  if (g.maximusPick) parts.push(`Our pick is ${g.maximusPick.call}. ${g.maximusPick.why}`.trim());
  else if (g.awayRecord && g.homeRecord) parts.push(`The ${g.awayName} are ${g.awayRecord} and the ${g.homeName} are ${g.homeRecord}.`);
  return parts.join(' ');
}

function liveLine(g) {
  if (g.maximusPick?.standing) return `Our pick is ${g.maximusPick.call}. ${g.maximusPick.standing}`;
  return `${g.awayName} at ${g.homeName} is in the ${g.stage === 'under way' ? 'early going' : g.stage}. No pick on this one.`;
}

export function buildNbaEngineBrief(data) {
  const { liveGames, gamesToCome, finals, counts } = data;
  const L = NBA_BRIEF_LIMITS;
  let headline;
  if (counts.live > 0) {
    headline = `${count(counts.live)} ${plural(counts.live, 'game')} live${counts.toCome ? `, ${count(counts.toCome).toLowerCase()} still to tip` : ''}`;
  } else if (counts.toCome > 0) {
    headline = `${count(counts.toCome)} ${plural(counts.toCome, 'game')} tonight${data.picksToCome ? `, ${count(data.picksToCome).toLowerCase()} ${plural(data.picksToCome, 'pick')} on the board` : ''}`;
  } else if (counts.final > 0) {
    headline = 'Tonight’s slate is in the books';
  } else {
    headline = 'No NBA games today';
  }

  const first = gamesToCome[0];
  const tight = [...gamesToCome].filter((g) => g.spread).sort((a, b) => Math.abs(parseFloat(a.spread.split(' ')[1]) || 0) - Math.abs(parseFloat(b.spread.split(' ')[1]) || 0))[0];
  const dekParts = [];
  if (first) dekParts.push(`${first.awayName} at ${first.homeName} tips ${counts.live ? 'next' : 'first'} at ${first.tip}.`);
  if (tight && tight !== first) dekParts.push(`The tightest line is ${tight.awayName} at ${tight.homeName} (${tight.spread}).`);
  if (!first && finals.length > 0) dekParts.push(`${count(finals.length)} ${plural(finals.length, 'game')} went final. The next slate posts in the morning.`);

  const numbers = [];
  const top = gamesToCome.filter((g) => g.maximusPick).sort((a, b) => b.maximusPick.conviction - a.maximusPick.conviction)[0];
  if (top) numbers.push({ value: String(top.maximusPick.conviction), label: `Conviction out of 100 on ${top.maximusPick.call}, ${top.away} at ${top.home}` });
  const high = [...gamesToCome].filter((g) => g.total != null).sort((a, b) => b.total - a.total)[0];
  if (high) numbers.push({ value: String(high.total), label: `The highest total tonight: ${high.away} at ${high.home}` });
  if (data.titleMarket[0]) numbers.push({ value: data.titleMarket[0].price, label: `The ${data.titleMarket[0].team} to win the title, the shortest price on the board` });

  let take = '';
  if (top) {
    const p = top.maximusPick;
    take = `${p.call} in ${top.awayName} at ${top.homeName} is the strongest call left tonight. ${p.why}${p.builtOnGames != null ? ' That is a small sample, so treat the conviction number as a ranking, not a probability.' : ''}`;
  } else if (counts.toCome > 0) {
    take = 'Nothing left on tonight’s board clears the bar for a pick. The leans on every game are on the picks page.';
  } else if (finals.some((g) => g.maximusPick)) {
    const graded = finals.filter((g) => g.maximusPick);
    const won = graded.filter((g) => g.maximusPick.verdict === 'won').length;
    take = `Tonight’s picks finished ${won}-${graded.filter((g) => g.maximusPick.verdict === 'lost').length}.`;
  }

  const t = data.titleMarket;
  const also = t.length >= 3 ? `The ${t[0].team} are the ${t[0].price} title favorite, ahead of the ${t[1].team} (${t[1].price}) and the ${t[2].team} (${t[2].price}).` : '';

  return {
    headline,
    dek: dekParts.join(' '),
    now: liveGames.slice().sort((a, b) => Number(Boolean(b.maximusPick)) - Number(Boolean(a.maximusPick))).slice(0, L.now).map((g) => ({ gameId: g.gameId, text: liveLine(g) })),
    next: gamesToCome.slice(0, L.next).map((g) => ({ gameId: g.gameId, text: nextLine(g) })).filter((x) => x.text),
    numbers: numbers.slice(0, L.numbers),
    take,
    also,
    source: 'engine',
  };
}

/* ── Claude: the same brief, in Maximus's voice ─────────────────────── */

function forModel(data) {
  const { _games, ids, ...rest } = data;   // eslint-disable-line no-unused-vars
  return rest;
}

export function nbaBriefPrompt(data, base) {
  const L = NBA_BRIEF_LIMITS;
  const system = `You are Maximus, the voice of Maximus Sports: a small genius robot who reads the betting market the way other kids read picture books. You write the NBA brief on the home page.

VOICE
- Quick, confident, a little cheeky. Short sentences. Talk to one bettor, like a sharp friend with the model open.
- One dry joke or vivid image in the whole brief at most. Never mean, never hype, never baby talk. No emoji.
- Specific beats clever. A number, a matchup or a consequence in every line.
- Have a read on everything: say what a number means for someone deciding on tonight's card. A line that only restates the data is a failure.
- Sentence case. No word in capitals except team abbreviations. Name a game as away at home: "OKC at MIA".

TIME
- It is ${data.now}. Write for this minute. Games in liveGames are being played now; games in gamesToCome have not started; finals are over.
- Lead with what is live or about to tip. A finished game is context only, unless nothing is live and nothing is left to play.
- It is the regular season. Do not mention playoffs, series, seeds or brackets unless a headline in the data does.

WHAT TO USE
- ONLY the JSON data. Every team, player, number, price, record and fact must be in it. Do not add injuries, players, history or storylines from memory. A player may be named only if a headline names him, and only for what that headline says.
- Every game you write about gets its line: the spread and the total exactly as given. Prices keep their sign (+150, -110).
- Our picks are only the maximusPick entries. State each call exactly as given and give its reason from "why". When builtOnGames is present the pick rests on that many recent games: say so plainly once. Anything else is context: never call it a pick, a play or a bet.
- "conviction" is a ranking out of 100, not a probability. Never call it a win chance.
- Do NOT state a live score, the clock or time left. The page shows the live score next to your line. Say where our pick stands from "standing".
- No guarantees, no "lock", no "can't lose", no profanity.

FORMAT
Reply with one JSON object and nothing else. No markdown, no code fence.
{
  "headline": "max ${L.headline} characters, no period, about right now",
  "dek": "one or two sentences, max ${L.dek} characters, setting up tonight",
  "now": [{ "gameId": "from liveGames", "text": "one or two sentences, max ${L.item} characters" }],
  "next": [{ "gameId": "from gamesToCome", "text": "one or two sentences, max ${L.item} characters" }],
  "numbers": [{ "value": "a number or price from the data, max ${L.value} characters", "label": "what it is and why it matters, max ${L.label} characters" }],
  "take": "Maximus's own read on the best thing left on the board, max ${L.take} characters. If a maximusPick is still to come, this is about it.",
  "also": "optional: one short paragraph on the title market or the day's biggest headline, max ${L.also} characters. Empty string if it adds nothing."
}
- "now": up to ${L.now} live games, our picks first. Empty array if nothing is live.
- "next": up to ${L.next} games still to come, in tip-off order. Empty array if none are left.
- "numbers": exactly 3 when the data supports it. Each must be a different kind of fact.
- Do not start two items the same way. Do not repeat a fact across sections.`;

  const user = `DATA:\n${JSON.stringify(forModel(data))}\n\nA plain version of this brief, for reference on what matters (rewrite it, do not copy it):\n${JSON.stringify({ headline: base.headline, now: base.now, next: base.next })}\n\nWrite the brief now as one JSON object.`;
  return { system, user };
}

const clip = (t, n) => {
  const s = String(t ?? '').replace(/\s+/g, ' ').trim();
  if (s.length <= n) return s;
  const cut = s.slice(0, n);
  const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('; '));
  return stop > n * 0.5 ? cut.slice(0, stop + 1) : `${cut.slice(0, cut.lastIndexOf(' '))}…`;
};

// Emoji and pictographs: the brief's tone is carried by the words.
const stripEmoji = (t) => String(t ?? '').replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]|\uFE0F|\u200D/gu, '').replace(/\s{2,}/g, ' ').replace(/\s+([.,;:!?])/g, '$1').trim();

/**
 * Check a model reply against the data. Returns a clean brief, or null when
 * the reply is not usable: not JSON, no headline, or it ignores what is
 * live or what is left to play.
 */
export function parseNbaBrief(raw, data) {
  if (!raw || typeof raw !== 'string') return null;
  const start = raw.indexOf('{'), end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  let obj;
  try { obj = JSON.parse(raw.slice(start, end + 1)); } catch { return null; }
  if (!obj || typeof obj.headline !== 'string' || obj.headline.trim().length < 4) return null;

  const L = NBA_BRIEF_LIMITS;
  const liveIds = new Set(data.ids.live);
  const nextIds = new Set(data.ids.toCome);
  const fix = (t) => stripEmoji(fixPositiveOdds(String(t ?? '')));
  const items = (list, ids, max) => (Array.isArray(list) ? list : [])
    .filter((x) => x && typeof x.text === 'string' && x.text.trim() && ids.has(String(x.gameId)))
    .filter((x, i, all) => all.findIndex((y) => String(y.gameId) === String(x.gameId)) === i)
    .slice(0, max)
    .map((x) => ({ gameId: String(x.gameId), text: clip(fix(x.text), L.item) }));
  const now = items(obj.now, liveIds, L.now);
  const next = items(obj.next, nextIds, L.next);
  if (liveIds.size > 0 && now.length === 0) return null;
  if (liveIds.size === 0 && nextIds.size > 0 && next.length === 0) return null;
  const order = new Map(data.ids.toCome.map((id, i) => [id, i]));
  next.sort((a, b) => order.get(a.gameId) - order.get(b.gameId));

  return {
    headline: clip(fix(obj.headline), L.headline).replace(/[.]$/, ''),
    dek: clip(fix(obj.dek), L.dek),
    now,
    next,
    numbers: (Array.isArray(obj.numbers) ? obj.numbers : [])
      .filter((x) => x && String(x.value ?? '').trim() && typeof x.label === 'string' && x.label.trim())
      .slice(0, L.numbers)
      .map((x) => ({ value: clip(fixPositiveOdds(String(x.value)), L.value), label: clip(fix(x.label), L.label) })),
    take: clip(fix(obj.take), L.take),
    also: clip(fix(obj.also), L.also),
    source: 'claude',
  };
}

/** The brief as plain paragraphs, for the email and anything else that wants text. */
export function nbaBriefToText(brief, data) {
  if (!brief) return '';
  const name = new Map([...data.liveGames, ...data.gamesToCome].map((g) => [g.gameId, `**${g.away} at ${g.home}**`]));
  const list = (items) => items.map((x) => `${name.get(x.gameId) || ''}: ${x.text}`).join(' ');
  return [
    [brief.headline ? `${brief.headline}.` : '', brief.dek].filter(Boolean).join(' '),
    brief.now.length ? list(brief.now) : '',
    brief.next.length ? list(brief.next) : '',
    brief.take,
    brief.also,
  ].filter(Boolean).join('\n\n');
}
