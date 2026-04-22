/**
 * Tests for the ET-aware date helpers.
 *
 * Locks the invariant: every call resolving "yesterday" for the picks
 * pipeline must produce the ET calendar date, not UTC. Prior to this
 * helper, the mlbPicksBuilder used `toISOString().slice(0,10)` which
 * silently drifted by one day whenever UTC was ahead of ET.
 */

import { describe, it, expect } from 'vitest';
import { todayET, yesterdayET, daysAgoFromYesterdayET, etDateCompact } from './dateWindows.js';

describe('ET date helpers', () => {
  it('formats today as YYYY-MM-DD in ET', () => {
    expect(todayET()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('yesterdayET is distinct from todayET on a normal day', () => {
    const today = todayET();
    const yd = yesterdayET();
    expect(yd).not.toBe(today);
    expect(yd).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('daysAgoFromYesterdayET(0) equals yesterdayET', () => {
    expect(daysAgoFromYesterdayET(0)).toBe(yesterdayET());
  });

  it('daysAgoFromYesterdayET(7) is an earlier date', () => {
    const y = yesterdayET();
    const minus7 = daysAgoFromYesterdayET(7);
    expect(minus7 < y).toBe(true);
  });

  it('ET yesterday at 00:30 UTC matches ET calendar yesterday (NOT UTC yesterday)', () => {
    // Fri 2026-04-24 00:30 UTC = Thu 2026-04-23 20:30 ET
    // UTC "yesterday" would be 2026-04-23; but ET-yesterday is 2026-04-22.
    const now = new Date('2026-04-24T00:30:00Z');
    // ET "today" at that instant is Thu 2026-04-23 → ET-yesterday is Wed 2026-04-22
    expect(yesterdayET(now)).toBe('2026-04-22');
    // And today in ET is Apr 23:
    expect(todayET(now)).toBe('2026-04-23');
  });

  it('ET yesterday at 03:00 UTC matches ET calendar yesterday', () => {
    // 2026-04-24 03:00 UTC = 2026-04-23 23:00 ET → today ET = 04-23
    const now = new Date('2026-04-24T03:00:00Z');
    expect(todayET(now)).toBe('2026-04-23');
    expect(yesterdayET(now)).toBe('2026-04-22');
  });

  it('ET yesterday at 14:00 UTC matches ET calendar yesterday', () => {
    // 2026-04-24 14:00 UTC = 2026-04-24 10:00 ET → today ET = 04-24
    const now = new Date('2026-04-24T14:00:00Z');
    expect(todayET(now)).toBe('2026-04-24');
    expect(yesterdayET(now)).toBe('2026-04-23');
  });

  it('daysAgoFromYesterdayET(7) at a specific ET anchor', () => {
    // 2026-04-24 14:00 UTC = ET today 2026-04-24 → ET yesterday 2026-04-23
    // → 7 days prior to yesterday: 2026-04-16
    const now = new Date('2026-04-24T14:00:00Z');
    expect(daysAgoFromYesterdayET(7, now)).toBe('2026-04-16');
  });

  it('etDateCompact strips dashes', () => {
    expect(etDateCompact('2026-04-21')).toBe('20260421');
    expect(etDateCompact('')).toBe('');
  });
});
