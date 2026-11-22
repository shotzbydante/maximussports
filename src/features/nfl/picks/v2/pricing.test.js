import { describe, it, expect } from 'vitest';
import {
  impliedProb, payout, devig, probToAmerican, spreadProbs, totalProbs, homeWinProb,
  fairMarginFromSpread, fairTotalFromLine, fairMarginFromMoneyline, expectedValue, unitsFor,
} from './distribution.js';
import { buildConsensus, priceOffers, bestOffer } from './market.js';
import { books, book } from './fixtures.js';

describe('odds helpers', () => {
  it('converts American prices to probability and payout', () => {
    expect(impliedProb(-110)).toBeCloseTo(0.5238, 4);
    expect(impliedProb(150)).toBeCloseTo(0.4, 4);
    expect(payout(-110)).toBeCloseTo(0.9091, 4);
    expect(payout(150)).toBe(1.5);
    expect(impliedProb(0)).toBeNull();
  });
  it('removes the vig from a two-way market', () => {
    const f = devig(-110, -110);
    expect(f.a).toBeCloseTo(0.5, 6);
    expect(f.hold).toBeCloseTo(0.0476, 4);
    expect(devig(-150, 130).a).toBeCloseTo(0.58, 2);
    expect(devig(null, -110)).toBeNull();
  });
  it('round-trips probability to a price', () => {
    expect(probToAmerican(0.6)).toBe(-150);
    expect(probToAmerican(0.4)).toBe(150);
    expect(probToAmerican(1)).toBeNull();
  });
});

describe('spread and total probabilities', () => {
  it('always sums to one and mirrors between the two sides', () => {
    const home = spreadProbs(3.3, -3, 'home');
    const away = spreadProbs(3.3, -3, 'away');
    expect(home.win + home.push + home.lose).toBeCloseTo(1, 9);
    expect(home.win).toBeCloseTo(away.lose, 9);
    expect(home.push).toBeCloseTo(away.push, 9);
  });
  it('gives a whole-number line a push and a half-point line none', () => {
    expect(spreadProbs(3, -3, 'home').push).toBeGreaterThan(0.07);
    expect(spreadProbs(3, -3.5, 'home').push).toBe(0);
    expect(totalProbs(44, 44, 'over').push).toBeGreaterThan(0.02);
    expect(totalProbs(44, 44.5, 'over').push).toBe(0);
  });
  it('makes 3 and 7 far more likely than their neighbours', () => {
    const at = (k) => spreadProbs(k, -k, 'home').push;
    expect(at(3)).toBeGreaterThan(at(2) * 2.5);
    expect(at(7)).toBeGreaterThan(at(5) * 1.8);
    // Push rate on a spread of 3 since 2015 is 10.2%; the curve should be close.
    expect(at(3)).toBeGreaterThan(0.075);
    expect(at(3)).toBeLessThan(0.12);
  });
  it('prices the hook through 3 as worth real money', () => {
    const fair = fairMarginFromSpread({ line: -3, homePrice: -110, awayPrice: -110 });
    const at3 = expectedValue(spreadProbs(fair, -3, 'away'), -110);
    const at35 = expectedValue(spreadProbs(fair, -3.5, 'away'), -110);
    expect(at3).toBeLessThan(0);                 // the consensus price always costs the vig
    expect(at35).toBeGreaterThan(0.025);         // +3.5 at -110 beats it
    expect(expectedValue(spreadProbs(fair, -3.5, 'away'), -125)).toBeLessThan(0);
  });
  it('gives a 3-point favourite about a 59% chance to win', () => {
    expect(homeWinProb(3)).toBeGreaterThan(0.57);
    expect(homeWinProb(3)).toBeLessThan(0.61);
    expect(homeWinProb(0)).toBeCloseTo(0.5, 6);
    expect(homeWinProb(-3)).toBeCloseTo(1 - homeWinProb(3), 6);
  });
});

describe('implied fair numbers', () => {
  it('reads more than the posted number when the favourite is juiced', () => {
    const flat = fairMarginFromSpread({ line: -3, homePrice: -110, awayPrice: -110 });
    const juiced = fairMarginFromSpread({ line: -3, homePrice: -120, awayPrice: 100 });
    expect(juiced).toBeGreaterThan(flat + 0.3);
    expect(fairMarginFromSpread({ line: null })).toBeNull();
  });
  it('treats missing prices as an even market', () => {
    expect(fairMarginFromSpread({ line: -6.5 })).toBeCloseTo(fairMarginFromSpread({ line: -6.5, homePrice: -110, awayPrice: -110 }), 6);
  });
  it('recovers a total and a moneyline margin', () => {
    expect(fairTotalFromLine({ line: 44.5, overPrice: -110, underPrice: -110 })).toBeCloseTo(44.5, 0);
    expect(fairTotalFromLine({ line: 44.5, overPrice: -125, underPrice: 105 })).toBeGreaterThan(44.8);
    const m = fairMarginFromMoneyline({ homePrice: -150, awayPrice: 130 });
    expect(homeWinProb(m)).toBeCloseTo(devig(-150, 130).a, 3);
  });
});

describe('expected value and units', () => {
  it('returns the stake on a push', () => {
    expect(expectedValue({ win: 0.5, push: 0.1, lose: 0.4 }, -110)).toBeCloseTo(0.5 * 0.9091 - 0.4, 4);
    expect(expectedValue({ win: 0.5, push: 0, lose: 0.5 }, null)).toBeNull();
  });
  it('grades units at the stored price and falls back to -110', () => {
    expect(unitsFor('won', 150)).toBe(1.5);
    expect(unitsFor('won', -200)).toBe(0.5);
    expect(unitsFor('won', null)).toBeCloseTo(0.9091, 4);
    expect(unitsFor('lost', 150)).toBe(-1);
    expect(unitsFor('push', -110)).toBe(0);
    expect(unitsFor('pending', -110)).toBeNull();
  });
});

describe('buildConsensus', () => {
  it('takes the middle of what the books imply', () => {
    const c = buildConsensus(books({ fanduel: { spread: -3.5 } }));
    expect(c.books).toBe(6);
    expect(c.spreadHome).toBe(-3);
    expect(c.fairMargin).toBeGreaterThan(3);
    expect(c.fairMargin).toBeLessThan(3.6);
    expect(c.fairTotal).toBeCloseTo(44.5, 0);
    expect(c.fairHomeWin).toBeCloseTo(devig(-160, 140).a, 3);
  });
  it('refuses to call four books a consensus', () => {
    const c = buildConsensus(books().slice(0, 4));
    expect(c.fairMargin).toBeNull();
    expect(c.fairTotal).toBeNull();
    expect(c.fairHomeWin).toBeNull();
  });
});

describe('priceOffers', () => {
  const fairOf = (list) => { const c = buildConsensus(list); return { c, fair: { margin: c.fairMargin, total: c.fairTotal, homeWin: c.fairHomeWin } }; };

  it('finds the one book hanging a better number', () => {
    const list = books({ betmgm: { spread: -3.5 } });
    const { c, fair } = fairOf(list);
    const offers = priceOffers({ market: 'spread', side: 'away', books: list, fair, consensus: c });
    expect(offers[0]).toMatchObject({ book: 'betmgm', line: 3.5, price: -110 });
    expect(offers[0].ev).toBeGreaterThan(0.02);
    expect(offers[1].ev).toBeLessThan(0);
    expect(bestOffer(offers).book).toBe('betmgm');
  });
  it('prices every consensus offer below zero: the vig is never free', () => {
    const list = books();
    const { c, fair } = fairOf(list);
    for (const [market, side] of [['spread', 'home'], ['spread', 'away'], ['total', 'over'], ['total', 'under'], ['moneyline', 'home'], ['moneyline', 'away']]) {
      const offers = priceOffers({ market, side, books: list, fair, consensus: c });
      expect(offers.length).toBe(6);
      expect(offers[0].ev).toBeLessThan(0);
    }
  });
  it('never recommends an offshore book as the place to bet, but counts it in the consensus', () => {
    const list = [...books(), book('bovada', { ml: [-160, 190] })];
    const { c, fair } = fairOf(list);
    expect(c.books).toBe(7);
    const offers = priceOffers({ market: 'moneyline', side: 'away', books: list, fair, consensus: c });
    expect(offers.some((o) => o.book === 'bovada')).toBe(false);
  });
  it('drops alternate lines and flags stale or implausible prices', () => {
    const list = books({
      betmgm: { spread: -6 },                                    // an alternate line, not the main market
      fanatics: { ml: [-160, 260] },                             // too good to be true
      betrivers: { ml: [-160, 150], lastUpdate: '2026-11-22T09:00:00Z' },   // three hours behind
    });
    const { c, fair } = fairOf(list);
    const spread = priceOffers({ market: 'spread', side: 'home', books: list, fair, consensus: c });
    expect(spread.some((o) => o.book === 'betmgm')).toBe(false);
    const ml = priceOffers({ market: 'moneyline', side: 'away', books: list, fair, consensus: c });
    expect(ml.find((o) => o.book === 'fanatics').flags.implausible).toBe(true);
    expect(ml.find((o) => o.book === 'betrivers').flags.stale).toBe(true);
    expect(['fanatics', 'betrivers']).not.toContain(bestOffer(ml).book);
  });
});
