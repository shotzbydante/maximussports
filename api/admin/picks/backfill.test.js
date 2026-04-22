import { describe, it, expect } from 'vitest';
import { rangeDates, resolveDates } from './backfill.js';

describe('rangeDates', () => {
  it('returns the inclusive range', () => {
    expect(rangeDates('2026-04-18', '2026-04-21')).toEqual([
      '2026-04-18', '2026-04-19', '2026-04-20', '2026-04-21',
    ]);
  });
  it('handles single-day ranges', () => {
    expect(rangeDates('2026-04-18', '2026-04-18')).toEqual(['2026-04-18']);
  });
  it('returns empty for invalid input', () => {
    expect(rangeDates(null, '2026-04-21')).toEqual([]);
    expect(rangeDates('bad-date', '2026-04-21')).toEqual([]);
  });
  it('caps at 60 days', () => {
    const out = rangeDates('2026-01-01', '2026-06-30');
    expect(out.length).toBeLessThanOrEqual(60);
  });
});

describe('resolveDates', () => {
  it('resolves a single ?date=', () => {
    expect(resolveDates({ date: '2026-04-21' })).toEqual(['2026-04-21']);
  });
  it('resolves ?from/?to range', () => {
    expect(resolveDates({ from: '2026-04-18', to: '2026-04-20' })).toEqual([
      '2026-04-18', '2026-04-19', '2026-04-20',
    ]);
  });
  it('resolves ?dates=comma,list', () => {
    expect(resolveDates({ dates: '2026-04-18,2026-04-21' })).toEqual([
      '2026-04-18', '2026-04-21',
    ]);
  });
  it('filters out invalid entries in ?dates=', () => {
    expect(resolveDates({ dates: '2026-04-18,not-a-date,2026-04-21' })).toEqual([
      '2026-04-18', '2026-04-21',
    ]);
  });
  it('returns [] when no valid input', () => {
    expect(resolveDates({})).toEqual([]);
    expect(resolveDates({ date: 'banana' })).toEqual([]);
  });
  it('prefers ?dates= over ?from/to when both present', () => {
    expect(resolveDates({ dates: '2026-04-18', from: '2026-04-19', to: '2026-04-21' })).toEqual([
      '2026-04-18',
    ]);
  });
});
