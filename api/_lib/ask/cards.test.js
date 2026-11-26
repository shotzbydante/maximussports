import { describe, it, expect } from 'vitest';
import {
  pickCard, inPlayPickCard, gameCard, recordCard, lockedCard, upgradeCard, chipsCard, pricesCard, bestPrices, teamCard, newsCard,
  asPlainText, asTexts, cardLine, fmtOdds, fmtLine, fmtPct, pct, kickoffET,
} from './cards.js';
import { sampleWeek, liveGame, inPlayRow, scorecard, NOW } from './fixtures.js';

const { board, games } = sampleWeek();
const hero = board.heroPicks[0];

describe('formatting', () => {
  it('writes prices, lines and percentages the way a book does', () => {
    expect(fmtOdds(140)).toBe('+140');
    expect(fmtOdds(-110)).toBe('-110');
    expect(fmtOdds(null)).toBe('');
    expect(fmtLine(3.5)).toBe('+3.5');
    expect(fmtLine(0)).toBe('PK');
    expect(fmtLine(-7)).toBe('-7');
    expect(fmtPct(0.035)).toBe('+3.5%');
    expect(fmtPct(-0.012)).toBe('-1.2%');
    expect(pct(0.987)).toBe('99%');
    expect(pct(null)).toBe('');
  });

  it('gives kickoff in Eastern time and nothing for a bad date', () => {
    expect(kickoffET('2026-11-22T18:00:00Z')).toBe('Sun 1:00 PM ET');
    expect(kickoffET('')).toBe('');
  });
});

describe('pickCard', () => {
  it('copies every fact from the pick, with the nickname for display', () => {
    const card = pickCard(hero, { asOf: NOW.getTime() });
    expect(card).toMatchObject({
      type: 'pick', id: hero.id, gameId: 'g1', market: 'runline', label: 'LV +3.5',
      price: -110, book: 'betmgm', recommended: true, conviction: 78, ev: '+3.5%',
      away: { slug: 'raiders', abbrev: 'LV', name: 'Raiders' },
      home: { slug: 'chiefs', abbrev: 'KC', name: 'Chiefs' },
      asOf: NOW.getTime(), stale: false,
    });
    expect(card.why).toContain('+3.5');
  });

  it('shows a locked pick at the ticket it was locked at, not the current price', () => {
    const locked = { ...hero, lock: { lockedAt: '2026-11-21T20:00:00Z', line: 4, price: -105, book: 'FanDuel', evAtLock: 0.05 } };
    expect(pickCard(locked)).toMatchObject({ line: 4, price: -105, book: 'FanDuel', ev: '+5.0%', lockedAt: '2026-11-21T20:00:00Z' });
  });

  it('marks a lean as not recommended', () => {
    expect(pickCard(board.trackingPicks[0]).recommended).toBe(false);
  });
});

describe('inPlayPickCard and gameCard', () => {
  it('carries the score and where the pick stands', () => {
    const card = inPlayPickCard(inPlayRow(), { asOf: 1 });
    expect(card).toMatchObject({
      id: 'live-row-1', label: 'KC +2.5', price: -108, book: 'FanDuel',
      away: { abbrev: 'KC', score: 14 }, home: { abbrev: 'SF', score: 10 },
      game: { status: 'live', clock: 'Q3 8:12' }, standing: { verdict: 'ahead' },
    });
  });

  it('builds a game card from the slate, live or upcoming', () => {
    expect(gameCard(liveGame(), { asOf: 1 })).toMatchObject({
      type: 'game', id: 'game-g9', status: 'live', clock: 'Q3 8:12',
      away: { abbrev: 'KC', score: 14 }, home: { abbrev: 'SF', score: 10 },
      spreadHome: -2.5, total: 47.5, moneyline: { home: -140, away: 120 }, books: 6,
    });
    expect(gameCard(games[0])).toMatchObject({ status: 'upcoming', spreadHome: -3, total: 44.5 });
  });

  it('leaves a missing line empty rather than inventing one', () => {
    const bare = { ...games[0], market: {} };
    expect(gameCard(bare)).toMatchObject({ spreadHome: null, total: null, moneyline: null, books: null });
  });
});

describe('recordCard', () => {
  it('shows the recommended record for the season and the recent window', () => {
    const card = recordCard(scorecard(), { asOf: 1 });
    expect(card.rows).toEqual([
      { label: 'Season', won: 13, lost: 9, push: 0, units: 3.41, roiPct: 15.5, beatClosePct: 61.5 },
      { label: 'Last 9 days', won: 2, lost: 1, push: 0, units: 0.82, roiPct: 27.3, beatClosePct: 61.5 },
    ]);
    expect(card.lastGraded).toBe('2026-11-17');
  });

  it('is null when nothing has been graded', () => {
    expect(recordCard(null)).toBeNull();
    expect(recordCard({ season: null, byPickRole: { hero: { won: 0, lost: 0, push: 0 } } })).toBeNull();
  });
});

describe('pricesCard', () => {
  const card = pricesCard(games[0], { asOf: 1 });

  it('lists every book and marks the best number on each side', () => {
    expect(card.rows).toHaveLength(6);
    expect(card.rows.find((r) => r.book === 'betmgm').spread).toEqual({ home: -3.5, homePrice: -110, awayPrice: -110 });
    expect(card.best.spreadAway).toEqual({ book: 'betmgm', line: 3.5, price: -110 });
    expect(card.best.spreadHome).toMatchObject({ line: -3, price: -110 });
    expect(card.best.moneylineAway).toMatchObject({ price: 140 });
  });

  it('takes the better line first, then the better price at that line', () => {
    const rows = [
      { book: 'A', spread: { home: -3, homePrice: -105, awayPrice: -115 }, total: { line: 44.5, overPrice: -110, underPrice: -110 }, moneyline: { home: -150, away: 130 } },
      { book: 'B', spread: { home: -3, homePrice: -112, awayPrice: -108 }, total: { line: 45, overPrice: -105, underPrice: -115 }, moneyline: { home: -165, away: 145 } },
      { book: 'C', spread: { home: -2.5, homePrice: -125, awayPrice: 105 }, total: null, moneyline: null },
    ];
    expect(bestPrices(rows)).toEqual({
      spreadHome: { book: 'C', line: -2.5, price: -125 },
      spreadAway: { book: 'B', line: 3, price: -108 },
      over: { book: 'A', line: 44.5, price: -110 },
      under: { book: 'B', line: 45, price: -115 },
      moneylineHome: { book: 'A', price: -150 },
      moneylineAway: { book: 'B', price: 145 },
    });
  });

  it('is null when no book has posted', () => {
    expect(pricesCard({ ...games[0], market: {} })).toBeNull();
  });

  it('reads as one line of text', () => {
    expect(cardLine(card)).toMatch(/^Prices at 6 books for LV at KC, best KC -3 -110 at .+, best LV \+3\.5 -110 at betmgm$/);
  });
});

describe('teamCard, newsCard, upgradeCard', () => {
  it('carries a team\'s season numbers as given', () => {
    const card = teamCard({ slug: 'chiefs', abbrev: 'KC', nickname: 'Chiefs', conference: 'AFC', division: 'West', record: '9-2', divisionRank: 1, powerRank: 2, projectedWins: 13.4, playoffPct: 0.987, titleOdds: 450 });
    expect(card).toMatchObject({ type: 'team', id: 'team-chiefs', team: { name: 'Chiefs' }, record: '9-2', division: 'AFC West', powerRank: 2, projectedWins: 13.4, playoffPct: 0.987, titleOdds: 450 });
    expect(cardLine(card)).toBe('Chiefs 9-2, power rank 2, playoffs 99%');
    expect(teamCard(null)).toBeNull();
  });

  it('links headlines to their outlet and drops anything without a real link', () => {
    const card = newsCard([
      { title: 'A', source: 'ESPN', time: '1h ago', url: 'https://example.com/a' },
      { title: 'B', source: 'X', url: 'javascript:alert(1)' },
      { title: '', url: 'https://example.com/c' },
    ]);
    expect(card.items).toEqual([{ title: 'A', source: 'ESPN', time: '1h ago', url: 'https://example.com/a' }]);
    expect(newsCard([])).toBeNull();
  });

  it('records that Pro was offered without saying what was withheld', () => {
    expect(cardLine(upgradeCard('shop_prices'))).toBe('Offered Pro');
  });
});

describe('chipsCard', () => {
  it('keeps at most three short, distinct suggestions', () => {
    expect(chipsCard(['Why LV?', ' Why LV? ', 'How is the record?', 'x'.repeat(60), 'Any totals?', 'One more'])).toEqual({
      type: 'chips', id: 'chips', items: ['Why LV?', 'How is the record?', 'Any totals?'],
    });
    expect(chipsCard([])).toBeNull();
  });
});

describe('text renderers', () => {
  const message = {
    text: 'Two spreads beat the market this week.',
    cards: [pickCard(hero), inPlayPickCard(inPlayRow()), lockedCard(2, { games: 2 }), chipsCard(['Why LV?'])],
  };

  it('writes a pick as one line with its price and book', () => {
    expect(cardLine(pickCard(hero))).toBe('LV +3.5 (-110 at betmgm), LV at KC, Mon 7:00 AM ET, conviction 78, +3.5% expected value');
  });

  it('writes a live pick with the score and its standing', () => {
    expect(cardLine(inPlayPickCard(inPlayRow()))).toContain('Live: KC 14, SF 10. KC up 4 at Q3 8:12');
  });

  it('gives the model its words plus what was shown, tagged by id, without the chips', () => {
    const text = asPlainText(message);
    expect(text.startsWith('Two spreads beat the market this week.')).toBe(true);
    expect(text).toContain(`- [${hero.id}] LV +3.5 (-110 at betmgm)`);
    expect(text).toContain('- [locked] 2 more calls are open with a free account');
    expect(text).toMatch(/Prices and scores may have moved since/);
    expect(text).not.toContain('Why LV?');
  });

  it('returns only the words when there are no cards', () => {
    expect(asPlainText({ text: 'No bet. The price is fair.', cards: [] })).toBe('No bet. The price is fair.');
  });

  it('lays an answer out as two phone bubbles with a link back to the thread', () => {
    const [words, options] = asTexts(message, { link: 'https://maximussports.ai/nfl/ask' });
    expect(words).toBe('Two spreads beat the market this week.');
    expect(options.split('\n')[0]).toMatch(/^1\. LV \+3\.5/);
    expect(options).toMatch(/Full breakdown: https:\/\/maximussports\.ai\/nfl\/ask$/);
    expect(`${words}${options}`).not.toMatch(/[*_#`]/);
  });
});
