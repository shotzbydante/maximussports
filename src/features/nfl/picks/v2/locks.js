/**
 * Pick locking and closing-line value. Pure.
 *
 * A recommended pick is locked the first time it is published: its side,
 * line, price and book are stored once and never rewritten. The board keeps
 * showing that exact ticket until kickoff, and it is the ticket that gets
 * graded. Without this, a pick could be recommended on Saturday, drift to
 * tracking by Sunday morning and vanish from the record.
 *
 * Closing-line value answers "was that a good number?" long before the
 * win-loss record can. It is the expected value of the locked ticket
 * against the fair number at the last snapshot before kickoff.
 */

import { spreadProbs, totalProbs, expectedValue, probToAmerican } from './distribution.js';
import { SITUATION_RECORDS } from './situations.js';

function isNum(v) { return typeof v === 'number' && Number.isFinite(v); }
const r3 = (v) => (isNum(v) ? Math.round(v * 1000) / 1000 : null);
const key = (gameId, market) => `${gameId}|${market}`;
const isSide = (m) => m === 'runline' || m === 'moneyline';

/** Win / push / lose for a stored ticket against a fair number. */
export function ticketProbs({ market, side, line, fair }) {
  if (!fair) return null;
  if (market === 'runline') {
    if (!isNum(fair.margin) || !isNum(line)) return null;
    const homeLine = side === 'home' ? line : -line;
    return spreadProbs(fair.margin, homeLine, side);
  }
  if (market === 'total') {
    if (!isNum(fair.total) || !isNum(line)) return null;
    return totalProbs(fair.total, line, side);
  }
  if (market === 'moneyline') {
    if (!isNum(fair.homeWin)) return null;
    const win = side === 'home' ? fair.homeWin : 1 - fair.homeWin;
    return { win, push: 0, lose: 1 - win };
  }
  return null;
}

/**
 * Closing-line value for one stored pick.
 * @param {object} pick  { market_type, selection_side, line_value, price_american }
 * @param {object} close { spread_home, total, fair_margin, fair_total, fair_home_win }
 * @returns {{ closingLine:number|null, clvPoints:number|null, clvEv:number|null }}
 */
export function closingLineValue(pick, close) {
  const empty = { closingLine: null, clvPoints: null, clvEv: null };
  if (!pick || !close) return empty;
  const market = pick.market_type, side = pick.selection_side;
  const line = pick.line_value == null ? null : Number(pick.line_value);
  const price = pick.price_american == null ? -110 : Number(pick.price_american);
  const fair = { margin: num(close.fair_margin), total: num(close.fair_total), homeWin: num(close.fair_home_win) };
  const probs = ticketProbs({ market, side, line, fair });
  const clvEv = probs ? r3(expectedValue(probs, price)) : null;

  let closingLine = null, clvPoints = null;
  if (market === 'runline' && isNum(num(close.spread_home)) && isNum(line)) {
    closingLine = side === 'home' ? num(close.spread_home) : -num(close.spread_home);
    clvPoints = r3(line - closingLine);                 // more points than the close is good
  } else if (market === 'total' && isNum(num(close.total)) && isNum(line)) {
    closingLine = num(close.total);
    clvPoints = r3(side === 'over' ? closingLine - line : line - closingLine);
  }
  return { closingLine, clvPoints, clvEv };
}

function num(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Lay stored locks over a freshly built board.
 *
 * @param {object} board   output of buildNflPicksV2()
 * @param {Array}  rows    `picks` rows with locked_at set and a stored `payload`
 * @param {object} [opts]
 * @param {object} [opts.maxPerTier]
 * @returns {object} a new board; the input is not mutated
 */
export function applyLocks(board, rows = [], { maxPerTier = { tier1: 3, tier2: 5, tier3: 6 }, maxPerGame = 2 } = {}) {
  const heroLocks = new Map();
  for (const r of rows) {
    if (!r?.locked_at || r.tier === 'tracking' || !r.payload) continue;
    const k = key(r.game_id, r.market_type);
    const prev = heroLocks.get(k);
    if (!prev || String(r.locked_at) < String(prev.locked_at)) heroLocks.set(k, r);
  }
  if (heroLocks.size === 0) return { ...board, meta: { ...board.meta, lockedPicks: 0 } };

  const games = new Map((board.byGame || []).map((g) => [String(g.gameId), g]));
  const sideLocked = new Set();
  const lockedPicks = [];
  for (const r of heroLocks.values()) {
    const g = games.get(String(r.game_id));
    if (!g) continue;                                   // already kicked off
    const fair = g.fair || {};
    const line = r.line_value == null ? null : Number(r.line_value);
    const price = r.price_american == null ? null : Number(r.price_american);
    const now = ticketProbs({ market: r.market_type, side: r.selection_side, line, fair });
    const evNow = now && isNum(price) ? r3(expectedValue(now, price)) : null;
    const winShare = now && now.win + now.lose > 0 ? now.win / (now.win + now.lose) : null;
    const pick = {
      ...r.payload,
      // Picks locked before the "why" line existed get one rebuilt from what was stored.
      ...storedWhy(r),
      tier: r.tier,
      pickRole: 'hero',
      isLowConviction: false,
      lowSignalReason: null,
      lock: {
        lockedAt: r.locked_at,
        line, price,
        book: r.book || r.payload?.book?.title || null,
        evAtLock: r.expected_value == null ? (r.payload?.ev ?? null) : Number(r.expected_value),
        evNow,
        fairPriceNow: probToAmerican(winShare),
      },
    };
    pick.rationale = {
      ...(r.payload.rationale || {}),
      pickRole: 'hero',
      bullets: [
        lockNote(pick.lock),
        ...((r.payload.rationale?.bullets || []).filter((b) => !String(b).startsWith('Locked '))),
      ],
    };
    lockedPicks.push(pick);
    if (isSide(r.market_type)) sideLocked.add(String(r.game_id));
  }
  if (lockedPicks.length === 0) return { ...board, meta: { ...board.meta, lockedPicks: 0 } };

  const lockedKeys = new Set(lockedPicks.map((p) => key(p.gameId, p.market.type)));
  const fresh = [];
  for (const p of board.fullSlatePicks || []) {
    const k = key(p.gameId, p.market.type);
    if (lockedKeys.has(k)) continue;                    // the lock replaces it
    if (p.pickRole === 'hero' && isSide(p.market.type) && sideLocked.has(String(p.gameId))) {
      fresh.push(demote(p, 'same_side'));               // one side bet per game
    } else fresh.push(p);
  }

  const tiers = { tier1: [], tier2: [], tier3: [] };
  const perGame = new Map();
  for (const p of lockedPicks) {
    (tiers[p.tier] || tiers.tier3).push(p);
    perGame.set(String(p.gameId), (perGame.get(String(p.gameId)) || 0) + 1);
  }
  const rest = [];
  for (const p of fresh.filter((x) => x.pickRole === 'hero').sort((a, b) => (b.ev ?? 0) - (a.ev ?? 0))) {
    const n = perGame.get(String(p.gameId)) || 0;
    if (tiers[p.tier].length < (maxPerTier[p.tier] ?? 99) && n < maxPerGame) {
      tiers[p.tier].push(p);
      perGame.set(String(p.gameId), n + 1);
    } else rest.push(demote(p, 'no_price_edge'));
  }
  const demoted = new Map(rest.map((p) => [p.id, p]));
  const others = fresh.filter((x) => x.pickRole !== 'hero' || demoted.has(x.id)).map((x) => demoted.get(x.id) || x);
  const published = [...tiers.tier1, ...tiers.tier2, ...tiers.tier3];
  const all = [...published, ...others];
  const byId = new Map(all.map((p) => [key(p.gameId, p.market.type), p]));

  const categories = { pickEms: [], ats: [], leans: [], totals: [] };
  for (const p of published) {
    if (p.market.type === 'total') categories.totals.push(p);
    else if (p.market.type === 'runline') categories.ats.push(p);
    else if (p.tier === 'tier3') categories.leans.push(p);
    else categories.pickEms.push(p);
  }

  return {
    ...board,
    topPick: tiers.tier1[0] || tiers.tier2[0] || tiers.tier3[0] || null,
    tiers,
    fullSlatePicks: all,
    heroPicks: published,
    trackingPicks: others,
    byGame: (board.byGame || []).map((g) => ({
      ...g,
      picks: {
        moneyline: byId.get(key(g.gameId, 'moneyline')) || null,
        runline: byId.get(key(g.gameId, 'runline')) || null,
        total: byId.get(key(g.gameId, 'total')) || null,
      },
    })),
    categories,
    legacy: { categories },
    meta: { ...board.meta, picksPublished: published.length, lockedPicks: lockedPicks.length },
  };
}

const fmtOdds = (v) => (isNum(v) ? (v > 0 ? `+${v}` : `${v}`) : '');
const WIND_UNDER_PCT = Math.round((SITUATION_RECORDS.windUnder.won / (SITUATION_RECORDS.windUnder.won + SITUATION_RECORDS.windUnder.lost)) * 100);

/**
 * The reason on a locked pick. New locks store it. A pick locked before the
 * field existed has it rebuilt from its stored price, book and fair price,
 * in the past tense: it describes the board when the pick was made.
 */
function storedWhy(r) {
  const p = r.payload || {};
  const why = p.why || p.rationale?.why;
  if (why) return { why, whyShort: p.whyShort || p.rationale?.whyShort || why };
  const headline = p.rationale?.headline || null;
  const book = r.book || p.book?.title;
  const price = fmtOdds(r.price_american == null ? p.market?.priceAmerican : Number(r.price_american));
  const fairPrice = fmtOdds(p.fair?.priceAmerican);
  const ev = r.expected_value == null ? p.ev : Number(r.expected_value);
  const what = p.market?.type === 'moneyline' && p.selection?.team ? `${p.selection.team} to win` : p.selection?.label;
  if (!book || !price || !what || !isNum(ev)) return { why: headline, whyShort: headline };
  const evText = `${ev >= 0 ? '+' : ''}${(ev * 100).toFixed(1)}% expected value`;
  const wind = p.modelSource === 'nfl_v2_wind' ? String(headline || '').match(/(\d+) mph wind/) : null;
  if (wind) {
    return {
      why: `${wind[1]} mph wind was forecast when this pick was locked, and unders have won ${WIND_UNDER_PCT}% of the time in wind that strong since ${SITUATION_RECORDS.windUnder.since}. ${book}’s ${price} on ${what} was ${evText}.`,
      whyShort: `${wind[1]} mph wind forecast at lock; unders win ${WIND_UNDER_PCT}% in wind that strong`,
    };
  }
  if (!fairPrice) return { why: headline, whyShort: headline };
  return {
    why: `${book} was paying ${price} on ${what} when this pick was locked; the market’s fair price was ${fairPrice}. That gap was ${evText}.`,
    whyShort: `${book} paid ${price}; the fair price was ${fairPrice}`,
  };
}

const DEMOTE_WHY = {
  same_side: 'Same opinion as the recommended side bet on this game, so it is tracked, not doubled up.',
  no_price_edge: 'Tracked only: the board already carries its limit of recommended picks at this level.',
};

function demote(p, reason) {
  const why = `${DEMOTE_WHY[reason] || 'Tracked, not recommended.'} ${p.why || ''}`.trim();
  const whyShort = `${reason === 'same_side' ? 'Tracked, same side as the pick' : 'Tracked, board is full'}. ${p.whyShort || ''}`.trim();
  return {
    ...p,
    why,
    whyShort,
    tier: 'tracking', pickRole: 'tracking', isLowConviction: true, lowSignalReason: reason,
    flags: { ...(p.flags || {}), tracking: true },
    rationale: { ...(p.rationale || {}), why, whyShort, pickRole: 'tracking' },
    conviction: { label: 'Lean', score: Math.min(49, p.conviction?.score ?? 49) },
    betScore: { ...(p.betScore || {}), total: Math.min(0.49, p.betScore?.total ?? 0.49) },
  };
}

function lockNote(lock) {
  let when = '';
  try {
    when = new Date(lock.lockedAt).toLocaleString('en-US', {
      weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York', timeZoneName: 'short',
    });
  } catch { /* leave blank */ }
  const fmt = (v) => (v > 0 ? `+${v}` : `${v}`);
  const base = `Locked ${when}${isNum(lock.price) ? ` at ${fmt(lock.price)}` : ''}${lock.book ? ` (${lock.book})` : ''}. This is the ticket that gets graded.`;
  if (!isNum(lock.evNow)) return base;
  const moved = lock.evNow >= (lock.evAtLock ?? 0) ? 'The market has moved toward it since' : 'The market has moved against it since';
  return `${base} ${moved}: at today’s fair number the same ticket is worth ${lock.evNow >= 0 ? '+' : ''}${(lock.evNow * 100).toFixed(1)}%.`;
}
