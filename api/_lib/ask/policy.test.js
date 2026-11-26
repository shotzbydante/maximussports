import { describe, it, expect, afterEach } from 'vitest';
import {
  canAsk, canUse, rolloutMode, limitsFor, guestCeilings, openPickIds, rankPicks, splitBoard, isFresh,
  MAX_MESSAGE_CHARS, LINE_FRESH_MS, GUEST_FREE_CALLS,
} from './policy.js';
import { freeLeans } from '../../../src/components/nfl/home/pickHelpers.js';
import { sampleWeek } from './fixtures.js';

const ENV = ['ASK_PAUSED', 'ASK_ROLLOUT', 'ASK_GUEST_DAILY', 'ASK_GUEST_PASS_DAILY', 'ASK_GUEST_IP_DAILY', 'ASK_GUEST_BUDGET', 'ASK_FREE_DAILY', 'ASK_PRO_DAILY'];
afterEach(() => { for (const k of ENV) delete process.env[k]; });

describe('rollout', () => {
  it('shows chat to the owner only until it is opened up', () => {
    expect(rolloutMode()).toBe('admin');
    expect(canUse({ isAdmin: true })).toBe(true);
    expect(canUse({ isAdmin: false })).toBe(false);
    expect(canUse()).toBe(false);
  });

  it('opens to everyone with ASK_ROLLOUT=all and to no one with off', () => {
    process.env.ASK_ROLLOUT = 'all';
    expect(canUse()).toBe(true);
    process.env.ASK_ROLLOUT = 'off';
    expect(canUse({ isAdmin: true })).toBe(false);
  });

  it('reads a typo as the cautious setting, and the kill switch beats everything', () => {
    process.env.ASK_ROLLOUT = 'everyone';
    expect(rolloutMode()).toBe('admin');
    process.env.ASK_ROLLOUT = 'all';
    process.env.ASK_PAUSED = '1';
    expect(rolloutMode()).toBe('off');
  });
});

describe('limitsFor', () => {
  it('gives each tier its own cap, saved thread and extras', () => {
    expect(limitsFor('guest')).toEqual({ tier: 'guest', dailyMessages: 3, picks: 'preview', saved: false, shopPrices: false, deepAnswers: false });
    expect(limitsFor('free')).toEqual({ tier: 'free', dailyMessages: 10, picks: 'all', saved: true, shopPrices: false, deepAnswers: false });
    expect(limitsFor('pro')).toEqual({ tier: 'pro', dailyMessages: 150, picks: 'all', saved: true, shopPrices: true, deepAnswers: true });
  });

  it('gives a guest who has left an email a few more questions, and nobody else', () => {
    expect(limitsFor('guest', { guestPass: true }).dailyMessages).toBe(6);
    expect(limitsFor('free', { guestPass: true }).dailyMessages).toBe(10);
  });

  it('treats an unknown tier as a guest, the least trusted', () => {
    for (const tier of [undefined, null, '', 'admin', 'PRO']) expect(limitsFor(tier).tier).toBe('guest');
  });

  it('reads caps from env and ignores values that are not numbers', () => {
    process.env.ASK_GUEST_DAILY = '1';
    process.env.ASK_FREE_DAILY = '4';
    process.env.ASK_PRO_DAILY = 'lots';
    process.env.ASK_GUEST_BUDGET = '50';
    expect(limitsFor('guest').dailyMessages).toBe(1);
    expect(limitsFor('free').dailyMessages).toBe(4);
    expect(limitsFor('pro').dailyMessages).toBe(150);
    expect(guestCeilings()).toEqual({ perIp: 15, all: 50 });
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
});

describe('openPickIds', () => {
  const { board } = sampleWeek();
  const { recommended, leans } = splitBoard(board);

  it('opens every call to a free account and to Pro, as the picks page does', () => {
    for (const tier of ['free', 'pro']) {
      const { open, lockedCount, games } = openPickIds(board, limitsFor(tier));
      expect(lockedCount).toBe(0);
      expect(games).toBe(3);
      for (const p of [...recommended, ...leans]) expect(open.has(p.id)).toBe(true);
    }
  });

  it('opens to a guest exactly what the signed-out picks page shows', () => {
    const { open, lockedCount } = openPickIds(board, limitsFor('guest'));
    const page = [...recommended, ...freeLeans(leans, recommended, GUEST_FREE_CALLS)].map((p) => p.id);
    expect([...open]).toEqual(page);
    expect(open.size).toBe(3);
    expect(lockedCount).toBe(recommended.length + leans.length - 3);
  });

  it('makes the same cut every time, so asking again reveals nothing new', () => {
    const first = [...openPickIds(board, limitsFor('guest')).open];
    const shuffled = { ...board, heroPicks: [...board.heroPicks].reverse(), fullSlatePicks: [...board.fullSlatePicks].reverse() };
    expect([...openPickIds(shuffled, limitsFor('guest')).open]).toEqual(first);
    expect(rankPicks([...recommended].reverse())).toEqual(recommended);
  });

  it('copes with a missing board', () => {
    expect(openPickIds(null, limitsFor('guest'))).toEqual({ open: new Set(), lockedCount: 0, games: 0 });
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
