/**
 * Ask Maximus cards.
 *
 * An answer is a few words from the model plus cards the SERVER builds from
 * data rows. The model only names which rows to show (by id); every team,
 * line, price, book, score and percentage on a card is copied from the data
 * here, so the model cannot invent or mistype one.
 *
 * A card is plain JSON, stored beside the message, and read by three
 * renderers:
 *   - the web chat draws it as a card (src/components/ask/AskCards.jsx)
 *   - asTexts() lays it out as phone bubbles, for the texting channel
 *   - asPlainText() writes it into the model's own history
 *
 * Every card carries `asOf` (ms). Lines and scores go stale quickly; the
 * renderers show the time and the web card offers a refresh once it is old.
 */

import { getNflTeamBySlug } from '../../../src/sports/nfl/teams.js';

export const MARKET_LABEL = { runline: 'Spread', moneyline: 'Moneyline', total: 'Over/under' };

const num = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
export const fmtOdds = (v) => (num(v) == null ? '' : num(v) > 0 ? `+${num(v)}` : `${num(v)}`);
export const fmtLine = (v) => (num(v) == null ? '' : num(v) > 0 ? `+${num(v)}` : num(v) === 0 ? 'PK' : `${num(v)}`);
export const fmtPct = (v, digits = 1) => (num(v) == null ? '' : `${num(v) >= 0 ? '+' : ''}${(num(v) * 100).toFixed(digits)}%`);

function team(t) {
  if (!t) return null;
  const meta = getNflTeamBySlug(t.slug);
  return {
    slug: t.slug || null,
    abbrev: t.abbrev || t.shortName || meta?.abbrev || '',
    name: meta?.nickname || t.name || t.abbrev || 'TBD',
    record: t.record || null,
  };
}

const convictionOf = (p) => p?.conviction?.score ?? Math.round((p?.betScore?.total || 0) * 100);

/** "Sun 1:00 PM ET" — for text channels and the model, which have no viewer time zone. */
export function kickoffET(iso) {
  const t = Date.parse(iso || '');
  if (!Number.isFinite(t)) return '';
  return `${new Date(t).toLocaleString('en-US', {
    weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York',
  }).replace(',', '')} ET`;
}

function environmentLine(env) {
  if (!env) return null;
  if (env.indoor === true) return 'Indoors';
  if (env.indoor !== false) return null;
  return ['Outdoors',
    num(env.wind) != null ? `${Math.round(env.wind)} mph wind` : null,
    num(env.temp) != null ? `${Math.round(env.temp)}°F` : null,
  ].filter(Boolean).join(', ');
}

/** A pick from the week's board (a game still to be played). */
export function pickCard(pick, { asOf = null, stale = false } = {}) {
  const m = pick.matchup || {};
  const lock = pick.lock || null;
  const price = num(lock?.price ?? pick.market?.priceAmerican);
  const recommended = pick.pickRole === 'hero';
  return {
    type: 'pick',
    id: pick.id,
    gameId: String(pick.gameId),
    market: pick.market?.type || null,
    label: pick.selection?.label || '',
    side: pick.selection?.side || null,
    line: num(lock?.line ?? pick.market?.line),
    price,
    book: lock?.book || pick.book?.title || null,
    recommended,
    conviction: convictionOf(pick),
    ev: typeof pick.ev === 'number' ? fmtPct(lock?.evAtLock ?? pick.ev) : null,
    why: pick.why || pick.rationale?.why || pick.whyShort || pick.rationale?.whyShort || null,
    away: team(m.awayTeam),
    home: team(m.homeTeam),
    startTime: m.startTime || null,
    network: m.network || null,
    venue: pick.environment?.venue || m.venue || null,
    conditions: environmentLine(pick.environment),
    lockedAt: lock?.lockedAt || null,
    asOf,
    stale: !!stale,
  };
}

/** A recommended pick whose game has kicked off, with where it stands. */
export function inPlayPickCard(row, { asOf = null } = {}) {
  return {
    type: 'pick',
    id: `live-${row.id}`,
    gameId: String(row.gameId),
    market: row.market,
    label: row.label,
    side: row.side,
    line: num(row.line),
    price: num(row.price),
    book: row.book || null,
    recommended: true,
    conviction: null,
    ev: typeof row.evAtLock === 'number' ? fmtPct(row.evAtLock) : null,
    why: row.why || row.whyShort || null,
    away: { ...team(row.away), score: num(row.away?.score) },
    home: { ...team(row.home), score: num(row.home?.score) },
    startTime: row.startTime || null,
    lockedAt: row.lockedAt || null,
    game: { status: row.gameStatus, clock: row.clock || null },
    standing: row.status?.verdict ? { verdict: row.status.verdict, text: row.status.text || '' } : null,
    closingLine: num(row.closingLine),
    asOf,
    stale: false,
  };
}

/** One game from the week's slate: state, score and the consensus lines. */
export function gameCard(game, { asOf = null } = {}) {
  const market = game.market || {};
  const away = game.teams?.away;
  const home = game.teams?.home;
  const env = game.engine?.env || null;
  return {
    type: 'game',
    id: `game-${game.gameId}`,
    gameId: String(game.gameId),
    status: game.status,
    clock: game.gameState?.periodLabel || null,
    away: { ...team(away), score: num(away?.score) },
    home: { ...team(home), score: num(home?.score) },
    startTime: game.startTime || null,
    network: game.broadcast?.network || null,
    venue: env?.venue || game.venue?.name || null,
    conditions: environmentLine(env || (game.venue?.indoor === true ? { indoor: true } : null)),
    spreadHome: num(market.pregameSpread),
    total: num(market.pregameTotal),
    moneyline: market.moneyline && num(market.moneyline.home) != null && num(market.moneyline.away) != null
      ? { home: num(market.moneyline.home), away: num(market.moneyline.away) }
      : null,
    books: num(market.booksCount) || null,
    asOf,
    stale: false,
  };
}

const rec = (r) => ({ won: Number(r?.won || 0), lost: Number(r?.lost || 0), push: Number(r?.push || 0) });

/**
 * The graded record. Recommended picks only: those are the ones published
 * with a price. Returns null when nothing has been graded.
 */
export function recordCard(scorecard, { asOf = null } = {}) {
  if (!scorecard) return null;
  const season = scorecard.season;
  const seasonRec = season?.performance?.hero?.record || season?.byPickRole?.hero || null;
  const recentPerf = scorecard.performance?.hero || null;
  const rows = [];
  if (seasonRec && (seasonRec.won + seasonRec.lost + seasonRec.push) > 0) {
    const perf = season.performance?.hero || null;
    rows.push({
      label: 'Season',
      ...rec(seasonRec),
      units: num(perf?.units),
      roiPct: num(perf?.roiPct),
      beatClosePct: num(perf?.beatClosePct),
    });
  }
  const recent = recentPerf?.record || scorecard.byPickRole?.hero;
  if (recent && (recent.won + recent.lost + recent.push) > 0) {
    rows.push({
      label: `Last ${scorecard.window?.days || 9} days`,
      ...rec(recent),
      units: num(recentPerf?.units),
      roiPct: num(recentPerf?.roiPct),
      beatClosePct: num(recentPerf?.beatClosePct),
    });
  }
  if (rows.length === 0) return null;
  return {
    type: 'record',
    id: 'record',
    title: 'Recommended picks, graded',
    rows,
    lastGraded: season?.lastGradedDate || null,
    asOf,
    stale: false,
  };
}

/** Picks the account's plan does not include. Never carries the picks themselves. */
export function lockedCard(count) {
  return { type: 'locked', id: 'locked', count };
}

/** Follow-up suggestions. Tapping one sends it as an ordinary message. */
export function chipsCard(items = []) {
  const clean = [...new Set(items.map((s) => String(s || '').replace(/\s+/g, ' ').trim()).filter(Boolean))]
    .filter((s) => s.length <= 48)
    .slice(0, 3);
  return clean.length ? { type: 'chips', id: 'chips', items: clean } : null;
}

// ── Text renderers ──────────────────────────────────────────────────────────

const recordText = (r) => `${r.won}-${r.lost}${r.push ? `-${r.push}` : ''}`;
const matchupText = (c) => `${c.away?.abbrev || 'Away'} at ${c.home?.abbrev || 'Home'}`;

function scoreText(c) {
  if (c.away?.score == null || c.home?.score == null) return '';
  return `${c.away.abbrev} ${c.away.score}, ${c.home.abbrev} ${c.home.score}`;
}

/** One card as one line of plain text. */
export function cardLine(card) {
  if (!card) return '';
  if (card.type === 'pick') {
    const price = [fmtOdds(card.price), card.book ? `at ${card.book}` : ''].filter(Boolean).join(' ');
    const state = card.standing
      ? `${card.game?.status === 'final' ? 'Final' : 'Live'}: ${[scoreText(card), card.standing.text].filter(Boolean).join('. ')}`
      : kickoffET(card.startTime);
    return [
      `${card.label}${price ? ` (${price})` : ''}`,
      matchupText(card),
      state,
      card.recommended ? null : 'lean, not a recommended pick',
      card.conviction != null ? `conviction ${card.conviction}` : null,
      card.ev ? `${card.ev} expected value` : null,
    ].filter(Boolean).join(', ');
  }
  if (card.type === 'game') {
    const state = card.status === 'upcoming'
      ? kickoffET(card.startTime)
      : `${card.status === 'final' ? 'Final' : card.clock || 'Live'}: ${scoreText(card)}`;
    const lines = [
      card.spreadHome != null ? `${card.home.abbrev} ${fmtLine(card.spreadHome)}` : null,
      card.total != null ? `total ${card.total}` : null,
    ].filter(Boolean).join(', ');
    return [matchupText(card), state, lines].filter(Boolean).join(', ');
  }
  if (card.type === 'record') {
    return card.rows.map((r) => `${r.label}: ${recordText(r)}${r.units != null ? `, ${r.units > 0 ? '+' : ''}${r.units} units` : ''}`).join('. ');
  }
  if (card.type === 'locked') {
    return `${card.count} more recommended ${card.count === 1 ? 'pick is' : 'picks are'} for Pro members`;
  }
  return '';
}

const shown = (cards) => (cards || []).filter((c) => c && c.type !== 'chips');

/**
 * A stored message as the model sees it in its history: its words, then
 * what was shown, each line tagged with the card id so a later turn can
 * refer back to it ("the second one").
 */
export function asPlainText(message) {
  const lines = shown(message?.cards).map((c) => {
    const line = cardLine(c);
    return line ? `- [${c.id}] ${line}` : '';
  }).filter(Boolean);
  const text = String(message?.text || '').trim();
  if (lines.length === 0) return text;
  return `${text}\n\n[Shown to the user as cards]\n${lines.join('\n')}`.trim();
}

/**
 * A stored message as phone bubbles: the words, then the cards as a short
 * numbered list. Plain text only, so one string works over iMessage and SMS.
 * `link` is appended to the options bubble (the thread on the web).
 */
export function asTexts(message, { link = '' } = {}) {
  const out = [];
  const text = String(message?.text || '').trim();
  if (text) out.push(text);
  const lines = shown(message?.cards).map(cardLine).filter(Boolean);
  if (lines.length) {
    const body = lines.map((l, i) => (lines.length > 1 ? `${i + 1}. ${l}` : l)).join('\n');
    out.push(link ? `${body}\n\nFull breakdown: ${link}` : body);
  }
  return out;
}
