/**
 * Regression: an 8 PM ET Saturday tip is stored as Sunday 01:00 UTC. Slicing
 * the UTC string made team summaries say "Sunday" for a Saturday night game.
 */

import { describe, it, expect } from 'vitest';
import { formatGameDay } from './teamSummary.js';

describe('formatGameDay', () => {
  it('uses the US Eastern calendar day for an evening tip', () => {
    expect(formatGameDay('2026-11-22T01:00Z')).toBe('Saturday, Nov 21');
    expect(formatGameDay('2026-11-22T00:00:00.000Z')).toBe('Saturday, Nov 21');
  });

  it('keeps an afternoon game on its own day', () => {
    expect(formatGameDay('2026-11-22T18:00Z')).toBe('Sunday, Nov 22');
  });

  it('returns null for a missing or unreadable date', () => {
    expect(formatGameDay(null)).toBeNull();
    expect(formatGameDay('')).toBeNull();
    expect(formatGameDay('not a date')).toBeNull();
  });
});
