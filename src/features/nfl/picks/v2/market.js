/**
 * Market consensus and best available price. Pure.
 *
 * Fourteen seasons of backtesting (scripts/nfl/backtest.mjs) say the
 * closing consensus is a better forecast than any rating the app can
 * build. So the fair number for a game is the market's own: each book's
 * line and prices are converted to the margin or total they imply, and the
 * median across books is the consensus.
 *
 * A bet has value when one book's posted line and price beat that
 * consensus by more than the vig. This module finds the best such offer on
 * each side of each market.
 */

import {
  fairMarginFromSpread, fairTotalFromLine, devig, spreadProbs, totalProbs,
  expectedValue, impliedProb,
} from './distribution.js';

export const MARKET_PARAMS = Object.freeze({
  /** Books needed before a consensus is trusted. */
  minBooks: 5,
  /** Offshore books in the feed: counted in the consensus, never recommended as the place to bet. */
  notBettable: Object.freeze(['bovada', 'betonlineag', 'mybookieag', 'lowvig', 'betus', 'betanysports']),
  /** A spread or total this far from the consensus line is an alternate or stale number. */
  maxLineGap: 1.5,
  /** An apparent edge above this is far more likely a stale price than a gift. */
  maxPlausibleEv: 0.09,
  /** Minutes behind the freshest book before an offer is treated as stale. */
  staleMinutes: 45,
});

function isNum(v) { return typeof v === 'number' && Number.isFinite(v); }
function median(a) {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function roundHalf(v) { return isNum(v) ? Math.round(v * 2) / 2 : null; }

/**
 * @param {Array<object>} books  per-book offers:
 *   { key, title, lastUpdate, spread:{homeLine,homePrice,awayPrice}, total:{line,overPrice,underPrice}, h2h:{home,away} }
 * @returns {object} consensus fair numbers plus the inputs behind them
 */
export function buildConsensus(books = [], params = MARKET_PARAMS) {
  const p = { ...MARKET_PARAMS, ...params };
  const margins = [], totals = [], homeWins = [], spreadLines = [], totalLines = [];
  for (const b of books) {
    if (b?.spread && isNum(b.spread.homeLine)) {
      const m = fairMarginFromSpread({ line: b.spread.homeLine, homePrice: b.spread.homePrice, awayPrice: b.spread.awayPrice });
      if (isNum(m)) { margins.push(m); spreadLines.push(b.spread.homeLine); }
    }
    if (b?.total && isNum(b.total.line)) {
      const t = fairTotalFromLine({ line: b.total.line, overPrice: b.total.overPrice, underPrice: b.total.underPrice });
      if (isNum(t)) { totals.push(t); totalLines.push(b.total.line); }
    }
    if (b?.h2h) {
      const f = devig(b.h2h.home, b.h2h.away);
      if (f) homeWins.push(f.a);
    }
  }
  const r2 = (v) => (isNum(v) ? Math.round(v * 100) / 100 : null);
  const centre = margins.length >= p.minBooks ? median(margins) : null;
  return {
    books: books.length,
    // `fairMargin` is the centre of the margin curve the books imply: the
    // number spread bets are priced against. It is not a forecast of the
    // final margin (with extra weight on 3 and 7 it sits above the posted
    // line for most favourites). Compare projections with `spreadHome`.
    fairMargin: r2(centre),
    fairTotal: totals.length >= p.minBooks ? r2(median(totals)) : null,
    fairHomeWin: homeWins.length >= p.minBooks ? Math.round(median(homeWins) * 1000) / 1000 : null,
    spreadHome: roundHalf(median(spreadLines)),
    total: roundHalf(median(totalLines)),
    counts: { spread: margins.length, total: totals.length, moneyline: homeWins.length },
  };
}

function freshest(books, market) {
  let t = 0;
  for (const b of books) {
    const u = Date.parse(b?.[market]?.lastUpdate || b?.lastUpdate || '');
    if (Number.isFinite(u) && u > t) t = u;
  }
  return t;
}

/**
 * Every bettable offer on one side of one market, priced against the fair
 * number, best first.
 *
 * @param {object} args
 * @param {'spread'|'total'|'moneyline'} args.market
 * @param {'home'|'away'|'over'|'under'} args.side
 * @param {Array}  args.books
 * @param {object} args.fair   { margin, total, homeWin } after any adjustment
 * @param {object} args.consensus  output of buildConsensus()
 * @returns {Array<{book,title,line,price,probs,ev,implied,flags}>}
 */
export function priceOffers({ market, side, books = [], fair, consensus, params = MARKET_PARAMS }) {
  const p = { ...MARKET_PARAMS, ...params };
  const key = market === 'moneyline' ? 'h2h' : market;
  const newest = freshest(books, key);
  const out = [];
  for (const b of books) {
    if (!b || p.notBettable.includes(b.key)) continue;
    let line = null, price = null, probs = null;
    if (market === 'spread') {
      if (!b.spread || !isNum(b.spread.homeLine) || !isNum(fair.margin)) continue;
      line = side === 'home' ? b.spread.homeLine : -b.spread.homeLine;
      price = side === 'home' ? b.spread.homePrice : b.spread.awayPrice;
      if (isNum(consensus?.spreadHome) && Math.abs(b.spread.homeLine - consensus.spreadHome) > p.maxLineGap) continue;
      probs = spreadProbs(fair.margin, b.spread.homeLine, side);
    } else if (market === 'total') {
      if (!b.total || !isNum(b.total.line) || !isNum(fair.total)) continue;
      line = b.total.line;
      price = side === 'over' ? b.total.overPrice : b.total.underPrice;
      if (isNum(consensus?.total) && Math.abs(b.total.line - consensus.total) > p.maxLineGap) continue;
      probs = totalProbs(fair.total, b.total.line, side);
    } else {
      if (!b.h2h || !isNum(fair.homeWin)) continue;
      price = side === 'home' ? b.h2h.home : b.h2h.away;
      const win = side === 'home' ? fair.homeWin : 1 - fair.homeWin;
      probs = { win, push: 0, lose: 1 - win };
    }
    if (!isNum(price)) continue;
    const ev = expectedValue(probs, price);
    if (!isNum(ev)) continue;
    const updated = Date.parse(b[key]?.lastUpdate || b.lastUpdate || '');
    const stale = Number.isFinite(updated) && newest > 0 && newest - updated > p.staleMinutes * 60_000;
    out.push({
      book: b.key, title: b.title || b.key, line, price, probs, ev,
      implied: impliedProb(price),
      flags: { stale, implausible: ev > p.maxPlausibleEv },
    });
  }
  return out.sort((a, b) => b.ev - a.ev);
}

/** The best offer that is neither stale nor implausibly good, or null. */
export function bestOffer(offers = []) {
  return offers.find((o) => !o.flags.stale && !o.flags.implausible) || null;
}
