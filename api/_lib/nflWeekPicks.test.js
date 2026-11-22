import { describe, it, expect } from 'vitest';
import { toWeekPicks } from './nflWeekPicks.js';

const game = (id, status, away, home, label = 'Q4 13:41') => ({
  gameId: id, status, startTime: '2026-11-22T18:00:00Z',
  teams: { away: { slug: 'saints', abbrev: 'NO', name: 'New Orleans Saints', score: away }, home: { slug: 'bears', abbrev: 'CHI', name: 'Chicago Bears', score: home } },
  gameState: { periodLabel: label },
});
const row = (o) => ({ id: 'r1', game_id: 'g1', market_type: 'total', selection_side: 'under', line_value: '49', price_american: -110, tier: 'tier2', book: 'Circa Sports', locked_at: '2026-11-22T04:02:20Z', expected_value: '0.048', payload: { selection: { label: 'Under 49' }, why: 'Wind.' }, ...o });

describe('toWeekPicks', () => {
  it('pairs a locked recommended pick with the live score', () => {
    const [p] = toWeekPicks({ games: [game('g1', 'live', 10, 19)], rows: [row()] });
    expect(p).toMatchObject({
      label: 'Under 49', price: -110, book: 'Circa Sports', evAtLock: 0.048, gameStatus: 'live', clock: 'Q4 13:41',
      status: { state: 'live', verdict: 'ahead', text: '29 points at Q4 13:41. Stays under 49 with 19 or fewer more.' },
    });
    expect(p.away).toMatchObject({ abbrev: 'NO', score: 10 });
  });

  it('leaves out tracking leans and games that have not started', () => {
    expect(toWeekPicks({ games: [game('g1', 'live', 10, 19)], rows: [row({ tier: 'tracking' })] })).toEqual([]);
    expect(toWeekPicks({ games: [game('g1', 'upcoming', null, null)], rows: [row()] })).toEqual([]);
  });

  it('adds closing-line value when the close is known', () => {
    const closes = new Map([['g1', { spread_home: -11.5, total: 48, fair_margin: 12, fair_total: 48, fair_home_win: 0.85 }]]);
    const [p] = toWeekPicks({ games: [game('g1', 'final', 10, 19)], rows: [row()], closes });
    expect(p.closingLine).toBe(48);
    expect(p.clvPoints).toBe(1);          // took Under 49, closed 48: a point better
    expect(p.status).toMatchObject({ state: 'final', verdict: 'won' });
  });

  it('builds a label when the stored pick has none, and lists live games before finals', () => {
    const games = [game('g1', 'final', 10, 19), { ...game('g2', 'live', 3, 7), gameId: 'g2' }];
    const rows = [row({ payload: {} }), row({ id: 'r2', game_id: 'g2', market_type: 'runline', selection_side: 'away', line_value: 3.5, payload: {} })];
    const out = toWeekPicks({ games, rows });
    expect(out.map((p) => p.label)).toEqual(['NO +3.5', 'Under 49']);
  });
});
