import { describe, it, expect, afterEach } from 'vitest';
import { canAsk, limitsFor, openPickIds, rankPicks, isFresh, isPaused, MAX_MESSAGE_CHARS, LINE_FRESH_MS } from './policy.js';
import { sampleWeek } from './fixtures.js';

const ENV = ['ASK_PAUSED', 'ASK_FREE_DAILY', 'ASK_PRO_DAILY', 'ASK_FREE_PICKS'];
afterEach(() => { for (const k of ENV) delete process.env[k]; });

describe('limitsFor', () => {
  it('gives the free plan a small daily cap and three picks, and Pro far more', () => {
    expect(limitsFor('free')).toEqual({ tier: 'free', dailyMessages: 5, picksPerAnswer: 3 });
    expect(limitsFor('pro')).toEqual({ tier: 'pro', dailyMessages: 150, picksPerAnswer: 8 });
  });

  it('treats anything that is not Pro as free', () => {
    for (const tier of [undefined, null, '', 'admin', 'PRO']) expect(limitsFor(tier).tier).toBe('free');
  });

  it('reads caps from env and ignores values that are not numbers', () => {
    process.env.ASK_FREE_DAILY = '2';
    process.env.ASK_PRO_DAILY = 'lots';
    process.env.ASK_FREE_PICKS = '1';
    expect(limitsFor('free')).toMatchObject({ dailyMessages: 2, picksPerAnswer: 1 });
    expect(limitsFor('pro').dailyMessages).toBe(150);
  });
});

describe('canAsk', () => {
  it('accepts a normal message and tidies whitespace', () => {
    expect(canAsk('  who do you\n like   this week? ')).toEqual({ ok: true, text: 'who do you like this week?' });
  });

  it('refuses empty and oversized messages', () => {
    expect(canAsk('   ')).toEqual({ ok: false, code: 'empty' });
    expect(canAsk(null)).toEqual({ ok: false, code: 'empty' });
    expect(canAsk('x'.repeat(MAX_MESSAGE_CHARS + 1))).toEqual({ ok: false, code: 'too_long' });
    expect(canAsk('x'.repeat(MAX_MESSAGE_CHARS)).ok).toBe(true);
  });

  it('refuses everything while the kill switch is on', () => {
    process.env.ASK_PAUSED = '1';
    expect(isPaused()).toBe(true);
    expect(canAsk('who do you like?')).toEqual({ ok: false, code: 'paused' });
  });
});

describe('openPickIds', () => {
  const { board } = sampleWeek();
  const heroIds = board.heroPicks.map((p) => p.id);

  it('opens every pick and lean to Pro', () => {
    const { open, lockedCount } = openPickIds(board, limitsFor('pro'));
    expect(lockedCount).toBe(0);
    for (const p of board.fullSlatePicks) expect(open.has(p.id)).toBe(true);
  });

  it('opens only the top recommended picks to free, and no leans', () => {
    const limits = { ...limitsFor('free'), picksPerAnswer: 1 };
    const { open, lockedCount } = openPickIds(board, limits);
    expect([...open]).toEqual([rankPicks(board.heroPicks)[0].id]);
    expect(lockedCount).toBe(heroIds.length - 1);
    for (const p of board.trackingPicks) expect(open.has(p.id)).toBe(false);
  });

  it('makes the same cut every time, so asking again reveals nothing new', () => {
    const limits = { ...limitsFor('free'), picksPerAnswer: 1 };
    const first = [...openPickIds(board, limits).open];
    const shuffled = { ...board, heroPicks: [...board.heroPicks].reverse() };
    expect([...openPickIds(shuffled, limits).open]).toEqual(first);
  });

  it('copes with a missing board', () => {
    expect(openPickIds(null, limitsFor('free'))).toEqual({ open: new Set(), lockedCount: 0 });
    expect(openPickIds(null, limitsFor('pro')).open.size).toBe(0);
  });
});

describe('isFresh', () => {
  it('is true inside the window and false outside it or without a time', () => {
    const now = 1_000_000_000;
    expect(isFresh(now - LINE_FRESH_MS, { now })).toBe(true);
    expect(isFresh(now - LINE_FRESH_MS - 1, { now })).toBe(false);
    expect(isFresh(null, { now })).toBe(false);
  });
});
