import { describe, it, expect } from 'vitest';
import { scorecardTakeaway, trailingRecord } from './scorecardTakeaway.js';

const empty = { won: 0, lost: 0, push: 0, pending: 0 };

describe('scorecardTakeaway', () => {
  it('returns null text for missing summary', () => {
    expect(scorecardTakeaway(null).text).toBeNull();
  });

  it('says awaiting settlement when everything is pending', () => {
    const t = scorecardTakeaway({ overall: { ...empty, pending: 4 } });
    expect(t.text).toMatch(/Awaiting/i);
    expect(t.tone).toBe('neutral');
  });

  it('says no picks graded when there are no picks at all', () => {
    expect(scorecardTakeaway({ overall: empty }).text).toMatch(/No picks/i);
  });

  it('positive tone when Top Play hits', () => {
    const t = scorecardTakeaway({
      overall: { won: 3, lost: 1, push: 0, pending: 0 },
      byMarket: { moneyline: { won: 1, lost: 0 }, runline: { won: 1, lost: 1 }, total: { won: 1, lost: 0 } },
      topPlayResult: 'won',
    });
    expect(t.tone).toBe('positive');
    expect(t.text).toMatch(/Top Play cashed/);
  });

  it('negative tone when Top Play misses AND overall loses', () => {
    const t = scorecardTakeaway({
      overall: { won: 0, lost: 3, push: 0, pending: 0 },
      byMarket: {},
      topPlayResult: 'lost',
    });
    expect(t.tone).toBe('negative');
    expect(t.text).toMatch(/Top Play missed/);
  });

  it('flags market sweeps (Totals 3/3)', () => {
    const t = scorecardTakeaway({
      overall: { won: 3, lost: 0, push: 0, pending: 0 },
      byMarket: {
        moneyline: empty,
        runline:   empty,
        total:     { won: 3, lost: 0 },
      },
      topPlayResult: null,
    });
    expect(t.text).toMatch(/Game Totals swept/);
    expect(t.tone).toBe('positive');
  });

  it('flags spread sweeps', () => {
    const t = scorecardTakeaway({
      overall: { won: 2, lost: 0, push: 0, pending: 0 },
      byMarket: { moneyline: empty, runline: { won: 2, lost: 0 }, total: empty },
      topPlayResult: null,
    });
    expect(t.text).toMatch(/Spreads carried/);
  });

  it('flags long winning streaks', () => {
    const t = scorecardTakeaway({
      overall: { won: 2, lost: 1, push: 0, pending: 0 },
      byMarket: {},
      topPlayResult: null,
      streak: { type: 'won', count: 4 },
    });
    expect(t.text).toMatch(/4-day/);
    expect(t.tone).toBe('positive');
  });

  it('falls back to generic winning/tough/split framing', () => {
    expect(scorecardTakeaway({
      overall: { won: 3, lost: 1, push: 0, pending: 0 },
      byMarket: {},
      topPlayResult: null,
    }).text).toMatch(/Winning day/);

    expect(scorecardTakeaway({
      overall: { won: 1, lost: 3, push: 0, pending: 0 },
      byMarket: {},
      topPlayResult: null,
    }).text).toMatch(/Tough day/);

    expect(scorecardTakeaway({
      overall: { won: 2, lost: 2, push: 0, pending: 0 },
      byMarket: {},
      topPlayResult: null,
    }).text).toMatch(/Split/);
  });
});

describe('trailingRecord', () => {
  it('returns null when absent', () => {
    expect(trailingRecord({})).toBeNull();
    expect(trailingRecord(null)).toBeNull();
  });
  it('returns null when graded is 0', () => {
    expect(trailingRecord({ trailing3d: { won: 0, lost: 0, push: 0 } })).toBeNull();
  });
  it('formats 3d window correctly', () => {
    const r = trailingRecord({ trailing3d: { won: 8, lost: 4, push: 1 } });
    expect(r.label).toBe('Last 3 days');
    expect(r.record).toBe('8-4-1');
    expect(r.winRate).toBe(67);
  });
  it('handles 7d and 30d windows', () => {
    expect(trailingRecord({ trailing7d: { won: 10, lost: 5 } }, 'trailing7d').label).toBe('Last 7 days');
    expect(trailingRecord({ trailing30d: { won: 30, lost: 20 } }, 'trailing30d').label).toBe('Last 30 days');
  });
});
