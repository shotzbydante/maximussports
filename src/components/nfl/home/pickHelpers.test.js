import { describe, it, expect } from 'vitest';
import { rankMarket, bestPerGame, oneLiner, rankMoneylineValue, closestMoneyline, moneylineHasValue, evText } from './pickHelpers.js';
import { splitTeamMentions } from './format.js';

const pick = (gameId, type, label, conviction, extra = {}) => ({
  id: `${gameId}-${type}`, gameId, market: { type }, selection: { label }, conviction: { score: conviction }, pickRole: 'tracking', ...extra,
});
const board = [
  pick('g1', 'runline', 'ARI +15.5', 47),
  pick('g1', 'moneyline', 'ARI +980', 47),
  pick('g1', 'total', 'Under 40.5', 79, { pickRole: 'hero', ev: 0.047 }),
  pick('g2', 'runline', 'MIA +16.5', 36),
  pick('g2', 'moneyline', 'MIA +950', 36),
  pick('g2', 'total', 'Over 44.5', 28),
  pick('g3', 'runline', 'DAL -7.5', 52),
  pick('g3', 'moneyline', 'DAL -370', 81),
  pick('g3', 'total', 'Over 55', 60, { pickRole: 'hero', ev: 0.02 }),
];

describe('rankMarket', () => {
  it('gives one decision per game in a market, strongest first', () => {
    expect(rankMarket(board, 'runline').map((p) => p.selection.label)).toEqual(['DAL -7.5', 'ARI +15.5', 'MIA +16.5']);
    expect(rankMarket(board, 'total').map((p) => p.selection.label)).toEqual(['Under 40.5', 'Over 55', 'Over 44.5']);
  });
});

describe('bestPerGame', () => {
  it('picks one decision per game', () => {
    expect(bestPerGame(board)).toHaveLength(3);
  });

  it('lets a recommended pick represent its game even when a lean scores higher', () => {
    const g3 = bestPerGame(board).find((p) => p.gameId === 'g3');
    expect(g3.selection.label).toBe('Over 55');
  });

  it('ranks recommended picks first, then by conviction', () => {
    expect(bestPerGame(board).map((p) => p.selection.label)).toEqual(['Under 40.5', 'Over 55', 'MIA +16.5']);
  });

  it('on a tie inside a game, prefers a call that is not held back, then the spread', () => {
    const tied = [
      pick('g9', 'moneyline', 'MIA +950', 36, { lowSignalReason: 'price_guard' }),
      pick('g9', 'total', 'Over 44.5', 36, { lowSignalReason: 'no_price_edge' }),
      pick('g9', 'runline', 'MIA +16.5', 36, { lowSignalReason: 'no_price_edge' }),
    ];
    expect(bestPerGame(tied).map((p) => p.selection.label)).toEqual(['MIA +16.5']);
    expect(bestPerGame([...tied].reverse()).map((p) => p.selection.label)).toEqual(['MIA +16.5']);
  });
});

describe('bestPerGame with a held call', () => {
  it('passes over a call held for its price when the game has a playable one', () => {
    const g = [
      pick('g5', 'moneyline', 'BUF -1600', 49, { lowSignalReason: 'price_guard', ev: 0.03 }),
      pick('g5', 'runline', 'MIA +16.5', 36, { lowSignalReason: 'no_price_edge' }),
      pick('g5', 'total', 'Over 44.5', 28, { lowSignalReason: 'no_price_edge' }),
    ];
    expect(bestPerGame(g).map((p) => p.selection.label)).toEqual(['MIA +16.5']);
  });

  it('still uses the strongest call when the whole game is held', () => {
    const g = [
      pick('g6', 'moneyline', 'DET -200', 35, { lowSignalReason: 'qb_uncertain' }),
      pick('g6', 'runline', 'DET -3.5', 47, { lowSignalReason: 'qb_uncertain' }),
    ];
    expect(bestPerGame(g).map((p) => p.selection.label)).toEqual(['DET -3.5']);
  });
});

describe('moneyline value', () => {
  const ml = [
    pick('a', 'moneyline', 'KC -1250', 27, { ev: 0.001, lowSignalReason: 'price_guard' }),
    pick('b', 'moneyline', 'LV +153', 40, { ev: 0.009, lowSignalReason: 'thin_value' }),
    pick('c', 'moneyline', 'BAL +130', 25, { ev: -0.022, lowSignalReason: 'no_price_edge' }),
    pick('d', 'moneyline', 'MIN +160', 66, { ev: 0.021, pickRole: 'hero' }),
    pick('e', 'moneyline', 'DEN +420', 45, { ev: 0.03, lowSignalReason: 'price_guard' }),
    pick('d', 'total', 'Over 44', 30, { ev: 0.02 }),
  ];

  it('lists only moneylines whose price beats fair by the floor, best value first after recommended picks', () => {
    expect(rankMoneylineValue(ml).map((p) => p.selection.label)).toEqual(['MIN +160', 'DEN +420', 'LV +153']);
  });

  it('treats a rounding-sized edge and a negative one as no value', () => {
    expect(moneylineHasValue(ml[0])).toBe(false);
    expect(moneylineHasValue(ml[2])).toBe(false);
    expect(moneylineHasValue(ml[5])).toBe(false);      // not a moneyline
  });

  it('is empty when nothing has value, and can still name the closest price', () => {
    const none = [ml[0], ml[2]];
    expect(rankMoneylineValue(none)).toEqual([]);
    expect(closestMoneyline(none).selection.label).toBe('KC -1250');
    expect(evText(closestMoneyline(none).ev)).toBe('+0.1%');
  });

  it('keeps a moneyline with no value out of the overall call for its game', () => {
    const g = [
      pick('z', 'moneyline', 'BAL +130', 49, { ev: -0.022, lowSignalReason: 'no_price_edge' }),
      pick('z', 'runline', 'BAL +2.5', 31, { lowSignalReason: 'no_price_edge' }),
    ];
    expect(bestPerGame(g).map((p) => p.selection.label)).toEqual(['BAL +2.5']);
  });

  it('lets a thin-value moneyline represent its game when it is the strongest call', () => {
    const g = [
      pick('y', 'moneyline', 'LV +153', 40, { ev: 0.009, lowSignalReason: 'thin_value' }),
      pick('y', 'runline', 'LV +3', 31, { lowSignalReason: 'no_price_edge' }),
    ];
    expect(bestPerGame(g).map((p) => p.selection.label)).toEqual(['LV +153']);
  });
});

describe('oneLiner', () => {
  it('drops the "Thin value." opener the chip already says', () => {
    expect(oneLiner({ whyShort: 'Thin value. BetMGM pays +153 on LV; the fair price is +151, +0.9%' })).toBe('BetMGM pays +153 on LV; the fair price is +151, +0.9%.');
  });

  it('drops the "Lean:" opener the chip already says', () => {
    expect(oneLiner({ whyShort: 'Lean: ratings BUF -14.3, market BUF -16.5' })).toBe('Ratings BUF -14.3, market BUF -16.5.');
  });

  it('drops the "Tracked, ..." opener', () => {
    expect(oneLiner({ whyShort: 'Tracked, extreme price. Market gives MIA 7%; +950 needs 10%' })).toBe('Market gives MIA 7%; +950 needs 10%.');
  });

  it('drops the "Held, ..." opener', () => {
    expect(oneLiner({ whyShort: 'Held, quarterback in doubt. Circa Sports pays +100; the fair price is -104' })).toBe('Circa Sports pays +100; the fair price is -104.');
  });

  it('leaves a recommended pick\'s reason alone', () => {
    expect(oneLiner({ whyShort: 'BetRivers paid -107; the fair price was -112' })).toBe('BetRivers paid -107; the fair price was -112.');
  });
});

describe('splitTeamMentions with abbreviations', () => {
  it('tags abbreviations only when asked', () => {
    const text = 'Ratings BUF -14.3, market BUF -16.5.';
    expect(splitTeamMentions(text).some((p) => p.slug)).toBe(false);
    expect(splitTeamMentions(text, { abbrev: true }).filter((p) => p.slug).map((p) => p.slug)).toEqual(['bills', 'bills']);
  });

  it('does not match an abbreviation inside a longer word', () => {
    expect(splitTeamMentions('A NOTE on DENVER and NO.', { abbrev: true }).filter((p) => p.slug).map((p) => p.text)).toEqual(['NO']);
  });
});
