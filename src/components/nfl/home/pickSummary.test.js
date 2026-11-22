import { describe, it, expect } from 'vitest';
import { pickSummary, ticketSummary, firstSentence } from './pickSummary.js';
import { splitTeamMentions, teamsMentioned } from './format.js';

const game = {
  teams: { home: { abbrev: 'CHI' }, away: { abbrev: 'NO' } },
  venue: { city: 'Chicago' },
  market: { booksCount: 12 },
  engine: {
    env: { wind: 15, indoor: false },
    consensus: { books: 12, fairTotal: 48.5, fairMargin: 12.54 },
    fair: { total: 47.3, adjustments: [{ key: 'windUnder', market: 'total', points: -1.2 }] },
  },
};
const under = {
  market: { type: 'total', line: 49, priceAmerican: -110 },
  selection: { side: 'under', label: 'Under 49' },
  book: { title: 'Circa Sports' },
  fair: { priceAmerican: -124 },
};

describe('pickSummary', () => {
  it('explains a wind under from the engine numbers', () => {
    expect(pickSummary(under, game)).toBe(
      'A 15 mph wind is forecast in Chicago, which takes the fair total from 48.5 to 47.3; Circa Sports has Under 49 at -110, when the fair price is -124.',
    );
  });

  it('uses the locked ticket once a pick is locked', () => {
    const locked = { ...under, lock: { price: -110, book: 'Circa Sports', fairPriceNow: -122 } };
    expect(pickSummary(locked, game)).toContain('when the fair price is -122.');
  });

  it('explains a price-only total without mentioning wind', () => {
    const g = { ...game, engine: { ...game.engine, env: { wind: 4 }, consensus: { books: 12, fairTotal: 54.9 }, fair: { total: 54.9, adjustments: [] } } };
    const over = { market: { type: 'total', priceAmerican: -107 }, selection: { side: 'over', label: 'Over 54' }, book: { title: 'BetRivers' }, fair: { priceAmerican: -112 } };
    expect(pickSummary(over, g)).toBe('12 books put the fair total at 54.9, and BetRivers has Over 54 at -107, when the fair price is -112.');
  });

  it('explains a spread from the consensus margin', () => {
    const spread = { market: { type: 'runline', priceAmerican: -105 }, selection: { side: 'away', label: 'NO +13' }, book: { title: 'FanDuel' }, fair: { priceAmerican: -118 } };
    expect(pickSummary(spread, game)).toBe('12 books make CHI a 12.5-point favorite, and FanDuel has NO +13 at -105, when the fair price is -118.');
  });

  it('still says something true with no game data', () => {
    expect(pickSummary(under, null)).toBe('Circa Sports has Under 49 at -110, when the fair price is -124.');
  });
});

describe('splitTeamMentions', () => {
  it('finds full names and nicknames, longest first', () => {
    const parts = splitTeamMentions('Kansas City Chiefs host the Cardinals.');
    expect(parts.filter((p) => p.slug).map((p) => [p.text, p.slug])).toEqual([
      ['Kansas City Chiefs', 'chiefs'],
      ['Cardinals', 'cardinals'],
    ]);
    expect(parts.map((p) => p.text).join('')).toBe('Kansas City Chiefs host the Cardinals.');
  });

  it('is case-sensitive and respects word edges', () => {
    expect(teamsMentioned('He pays his bills and plays for the Bills, not the Billsmafia.')).toEqual(['bills']);
  });

  it('handles the 49ers', () => {
    expect(teamsMentioned('The 49ers are 8-1.')).toEqual(['49ers']);
  });
});

describe('ticketSummary', () => {
  const stored = '15 mph wind was forecast when this pick was locked, and unders have won 57% of the time in wind that strong since 2003. DraftKings’s -105 on Under 40.5 was +4.7% expected value.';

  it('leads with the first sentence of the reason stored with the pick', () => {
    expect(ticketSummary({ ...under, why: stored }, game)).toBe(
      '15 mph wind was forecast when this pick was locked, and unders have won 57% of the time in wind that strong since 2003.',
    );
  });

  it('does not cut a sentence at a decimal or a price', () => {
    expect(firstSentence('BetRivers was paying -107 on Over 54.5 when this pick was locked; the fair price was -112. That gap was +2.1%.')).toBe(
      'BetRivers was paying -107 on Over 54.5 when this pick was locked; the fair price was -112.',
    );
  });

  it('falls back to the live sentence when the stored reason is only the headline', () => {
    const p = { ...under, why: 'Under 49: 15 mph wind', rationale: { headline: 'Under 49: 15 mph wind' } };
    expect(ticketSummary(p, game)).toBe(pickSummary(p, game));
  });
});
