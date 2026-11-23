/**
 * Pure helpers for NBA picks, shared by the pages and the brief: which
 * picks are Maximus's picks, the one-sentence reason for each, and the
 * lists behind the "Every game" tabs.
 *
 * The NBA engine is not the NFL one. It has no book-by-book prices, so a
 * pick here is not "a price that beats the market". A total is called from
 * each team's recent scoring; a side and a moneyline are called from the
 * gap between what the spread says and what the moneyline says. The
 * sentences below say exactly that, from the engine's own numbers, so the
 * page never claims more than the engine computed. No language model is
 * involved.
 */

import { nbaNickname } from '../../../sports/nba/teams.js';
import { pickLiveStatus } from '../../nfl/picks/pickLive.js';

export const score = (p) => p?.conviction?.score ?? Math.round((p?.betScore?.total || 0) * 100);

/** Highest conviction first; one of Maximus's picks beats a lean on a tie. */
export const byConviction = (a, b) => (score(b) - score(a)) || (isMaximusPick(b) - isMaximusPick(a));

export function pickedTeam(p) {
  const m = p?.matchup || {};
  return p?.selection?.side === 'home' ? m.homeTeam : p?.selection?.side === 'away' ? m.awayTeam : null;
}

export const MARKET = { moneyline: 'To win', runline: 'Spread', total: 'Total' };
export const MARKET_NAME = { moneyline: 'Moneyline', runline: 'Spread', total: 'Over/under' };

/** Why a call is held to a lean, when the engine gives a reason worth a chip. */
export const HELD_BACK = {
  low_cover_edge: 'Thin edge',
  low_edge: 'Thin edge',
  long_shot_dog: 'Long shot',
  large_favorite: 'Big favorite',
  data_gap: 'Thin data',
};

export const isMaximusPick = (p) => p?.pickRole === 'hero';

/** Maximus's picks, strongest first. Older payloads without roles fall back to the top two tiers. */
export function maximusPicks(board) {
  if (!board) return [];
  const all = board.fullSlatePicks || [];
  const heroes = all.filter(isMaximusPick);
  const list = heroes.length > 0
    ? heroes
    : (all.length > 0 ? [] : [...(board.tiers?.tier1 || []), ...(board.tiers?.tier2 || [])]);
  return [...list].sort(byConviction);
}

/** Every other call on the board: tracked and graded, not picks. */
export function leanPicks(board) {
  if (!board) return [];
  const picked = new Set(maximusPicks(board).map((p) => p.id));
  return (board.fullSlatePicks || board.coverage || []).filter((p) => !picked.has(p.id)).sort(byConviction);
}

const round = (v, places = 0) => {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const f = 10 ** places;
  return Math.round(v * f) / f;
};
const pct = (p) => (typeof p === 'number' ? `${Math.round(p * 100)}%` : null);
const odds = (v) => (typeof v === 'number' ? (v > 0 ? `+${v}` : `${v}`) : null);
const games = (n) => `${n} ${n === 1 ? 'game' : 'games'}`;

/** How many recent games the total is built from: the smaller of the two teams' samples. */
export function totalSample(pick) {
  const a = pick?.awayTeamForm?.sample;
  const h = pick?.homeTeamForm?.sample;
  if (typeof a !== 'number' || typeof h !== 'number') return null;
  return Math.min(a, h);
}

/**
 * One sentence on why, from the engine's numbers.
 *
 *   total      each team's recent scoring against the posted total
 *   spread     the margin the moneyline implies against the spread
 *   moneyline  the win chance the spread implies against the price
 */
export function nbaPickSummary(pick) {
  if (!pick) return '';
  const type = pick.market?.type;
  const m = pick.matchup || {};
  const away = nbaNickname(m.awayTeam?.slug) || m.awayTeam?.shortName || 'road team';
  const home = nbaNickname(m.homeTeam?.slug) || m.homeTeam?.shortName || 'home team';
  const poss = (name) => (/s$/.test(name) ? `${name}’` : `${name}’s`);

  if (type === 'total') {
    const line = pick.market?.line ?? pick.totalDebug?.marketTotal;
    const af = pick.awayTeamForm;
    const hf = pick.homeTeamForm;
    const fair = round(pick.totalDebug?.fairTotal ?? pick.expectedTotal, 1);
    if (af?.sample > 0 && hf?.sample > 0 && af.recentTotalAvg != null && hf.recentTotalAvg != null && line != null) {
      return `The ${poss(away)} last ${games(af.sample)} averaged ${round(af.recentTotalAvg)} points and the ${poss(home)} last ${hf.sample} averaged ${round(hf.recentTotalAvg)}, against a total of ${line}.`;
    }
    if (fair != null && line != null) {
      const gap = round(Math.abs(fair - line), 1);
      return `Recent scoring projects this game at ${fair} points, ${gap} ${fair > line ? 'above' : 'below'} the total of ${line}.`;
    }
    return '';
  }

  if (type === 'runline') {
    const d = pick.spreadDebug;
    const side = pick.selection?.side;
    const team = side === 'home' ? home : away;
    const line = pick.market?.line;
    if (d && typeof d.projectedHomeMargin === 'number' && line != null) {
      const margin = round(Math.abs(d.projectedHomeMargin), 1);
      const favored = d.projectedHomeMargin >= 0 ? home : away;
      const edge = round(side === 'home' ? d.homeCoverEdge : d.awayCoverEdge, 1);
      const lineText = line > 0 ? `+${line}` : `${line}`;
      return `The moneyline prices the ${favored} as about a ${margin}-point favorite, and the ${team} are ${line > 0 ? 'getting' : 'laying'} ${lineText.replace('-', '')}${edge != null && edge > 0 ? `, ${edge} ${edge === 1 ? 'point' : 'points'} of room` : ''}.`;
    }
    return '';
  }

  if (type === 'moneyline') {
    const model = pct(pick.modelProb);
    const needs = pct(pick.impliedProb);
    const side = pick.selection?.side;
    const team = side === 'home' ? home : away;
    const price = odds(pick.market?.priceAmerican);
    if (model && needs) {
      return `The spread implies the ${team} win ${model} of the time, and ${price ? `${price} needs` : 'the price needs'} ${needs}.`;
    }
    return '';
  }
  return '';
}

/** One market's call for every game, strongest first. */
export function rankMarket(picks, type) {
  return (picks || []).filter((p) => p?.market?.type === type).sort(byConviction);
}

const MARKET_ORDER = { total: 0, runline: 1, moneyline: 2 };

/** The single strongest call on each game, whichever market, with the games ranked strongest first. */
export function bestPerGame(picks) {
  const best = new Map();
  const stronger = (a, b) => (isMaximusPick(b) - isMaximusPick(a))
    || (score(b) - score(a))
    || ((MARKET_ORDER[a?.market?.type] ?? 9) - (MARKET_ORDER[b?.market?.type] ?? 9));
  for (const p of picks || []) {
    const key = String(p.gameId);
    const cur = best.get(key);
    if (!cur || stronger(p, cur) < 0) best.set(key, p);
  }
  return [...best.values()].sort((a, b) => (isMaximusPick(b) - isMaximusPick(a)) || byConviction(a, b));
}

/** "3-1" or "3-1-1" from a record object; null when nothing is graded. */
export function recordText(r) {
  if (!r) return null;
  const n = (r.won || 0) + (r.lost || 0) + (r.push || 0);
  if (n === 0) return null;
  return r.push > 0 ? `${r.won}-${r.lost}-${r.push}` : `${r.won}-${r.lost}`;
}

/** The three markets for the game: the live consensus when the game is in the feed, else what the pick carries. */
export function linesFor(pick, game) {
  const market = game?.market || {};
  const type = pick?.market?.type;
  const side = pick?.selection?.side;
  let spreadHome = market.pregameSpread ?? null;
  if (spreadHome == null && type === 'runline' && pick.market?.line != null) {
    spreadHome = side === 'home' ? pick.market.line : -pick.market.line;
  }
  const total = market.pregameTotal ?? (type === 'total' ? pick.market?.line ?? null : null);
  const moneyline = market.moneyline || null;
  if (spreadHome == null && total == null && !moneyline) return null;
  return { spreadHome, total, moneyline, books: market.booksCount || null };
}

/** A board pick reduced to what the in-play list needs; the server's started picks already have this shape. */
const slim = (p) => ({
  id: p.id,
  gameId: String(p.gameId),
  market: p.market?.type,
  side: p.selection?.side,
  line: p.market?.line ?? null,
  label: p.selection?.label,
});

/**
 * Split tonight's picks into those still to tip off and those in play.
 * A pick counts as started when the games feed says its game is live or
 * final, whether the board still lists it or the server carried it over.
 */
export function splitByStart(board, games) {
  const byId = new Map((games || []).map((g) => [String(g.gameId), g]));
  const started = new Map();
  const toPlay = [];
  for (const p of maximusPicks(board)) {
    const g = byId.get(String(p.gameId));
    if (g && g.status !== 'upcoming') started.set(p.id, { pick: slim(p), game: g });
    else toPlay.push(p);
  }
  for (const p of board?.startedPicks || []) {
    const g = byId.get(String(p.gameId));
    if (g && g.status !== 'upcoming' && !started.has(p.id)) started.set(p.id, { pick: p, game: g });
  }
  const order = { live: 0, final: 1 };
  const inPlay = [...started.values()].sort((a, b) => (order[a.game.status] ?? 2) - (order[b.game.status] ?? 2));
  return { toPlay, inPlay };
}

/**
 * Minutes of game time played, from the period and the clock ESPN shows
 * ("6:10 - 2nd" is 6:10 left in the second). Null when it cannot be told.
 */
export function minutesPlayed(game) {
  const gs = game?.gameState || {};
  const period = Number(gs.period);
  if (!Number.isFinite(period) || period < 1) return null;
  const label = String(gs.periodLabel || '');
  const before = period <= 4 ? (period - 1) * 12 : 48 + (period - 5) * 5;
  const length = period <= 4 ? 12 : 5;
  if (/half/i.test(label)) return 24;
  if (/^end\b/i.test(label)) return before + length;
  const clock = /(\d{1,2}):(\d{2})/.exec(label);
  // A date ("11/22 - 6:00 PM") is not a game clock.
  if (!clock || /\d{1,2}\/\d{1,2}/.test(label) || /[AP]M/i.test(label)) return null;
  const left = Number(clock[1]) + Number(clock[2]) / 60;
  if (left > length) return null;
  return before + (length - left);
}

const EARLY_MINUTES = 6;

/**
 * Where a pick stands in a live or finished NBA game.
 *
 * Sides, moneylines and anything already decided use the shared scoreboard
 * logic. A live total is different in basketball: points come all game, so
 * "needs 213 more" in the first quarter says nothing. A live total is read
 * against the pace it needs instead, and not at all in the first minutes.
 *
 * `text` is for the page, which shows the live score beside it. `plain`
 * has no score or clock in it, for copy that is read minutes later.
 */
export function nbaLiveStatus(pick, game) {
  const base = pickLiveStatus(pick, game);
  const settled = ['won', 'lost', 'push'].includes(base.verdict);
  const PLAIN = { won: 'won', lost: 'lost', push: 'a push', ahead: 'in front', behind: 'behind', level: 'right on the number' };
  if (pick?.market !== 'total' || base.state !== 'live' || settled) {
    return { ...base, plain: base.verdict ? PLAIN[base.verdict] : '' };
  }
  const home = Number(game.teams?.home?.score);
  const away = Number(game.teams?.away?.score);
  const line = Number(pick.line);
  const played = minutesPlayed(game);
  if (!Number.isFinite(home + away) || !Number.isFinite(line)) return { ...base, plain: '' };
  const points = home + away;
  // No readable clock: give the score and make no claim about the pace.
  if (played == null) return { state: 'live', verdict: null, text: `${points} points so far against a total of ${line}.`, plain: 'under way' };
  if (played < EARLY_MINUTES) {
    return { state: 'live', verdict: null, text: `${points} points so far. Too early to read the pace.`, plain: 'too early to read' };
  }
  // In overtime the game is already longer than 48 minutes; project to the end of the current period.
  const full = played <= 48 ? 48 : 48 + Math.ceil((played - 48) / 5) * 5;
  const pace = Math.round((points / played) * full);
  const over = pick.side === 'over';
  const verdict = pace === Math.round(line) ? 'level' : (pace > line) === over ? 'ahead' : 'behind';
  return {
    state: 'live',
    verdict,
    text: `${points} points so far, on pace for about ${pace} against a total of ${line}.`,
    plain: verdict === 'level' ? 'on pace to land right on the total' : pace > line ? 'on pace to go over the total' : 'on pace to stay under the total',
  };
}
