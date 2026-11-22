import { describe, it, expect } from 'vitest';
import { closingValueDue } from './nflSettle.js';

describe('closingValueDue', () => {
  const now = Date.parse('2026-11-22T23:07:00Z');
  const pick = (over = {}) => ({ locked_at: '2026-11-22T04:02:00Z', start_time: '2026-11-22T18:00:00Z', clv_ev: null, ...over });

  it('is due once the game has kicked off', () => {
    expect(closingValueDue(pick(), now)).toBe(true);
  });
  it('waits for a game later on the same slate: its closing line does not exist yet', () => {
    // Sunday night kicks off at 01:20 UTC; the early games are graded at 23:07.
    expect(closingValueDue(pick({ start_time: '2026-11-23T01:20:00Z' }), now)).toBe(false);
  });
  it('skips picks that are not locked, already have a value, or have no kickoff time', () => {
    expect(closingValueDue(pick({ locked_at: null }), now)).toBe(false);
    expect(closingValueDue(pick({ clv_ev: -0.02 }), now)).toBe(false);
    expect(closingValueDue(pick({ start_time: null }), now)).toBe(false);
  });
});
