/**
 * v13 — performanceInsights aggregates `by_pick_role` across the rolling
 * window so the UI can lead with Recommended vs Tracking.
 */

import { describe, it, expect } from 'vitest';
import { aggregateScorecards, shapeWindow } from './performanceInsights.js';

function mkRow({ date, overall = {}, byMarket = {}, byPickRole = null }) {
  return {
    slate_date: date,
    record: { won: 0, lost: 0, push: 0, pending: 0, ...overall },
    by_market: byMarket,
    by_tier:   {},
    by_pick_role: byPickRole,
    top_play_result: null,
  };
}

describe('v13 — aggregateScorecards rolls byPickRole', () => {
  it('sums hero + tracking across rows', () => {
    const rows = [
      mkRow({ date: '2026-05-09', overall: { won: 0, lost: 2 },
        byPickRole: { hero: { won: 0, lost: 1 }, tracking: { won: 0, lost: 1 } } }),
      mkRow({ date: '2026-05-08', overall: { won: 1, lost: 1 },
        byPickRole: { hero: { won: 1, lost: 0 }, tracking: { won: 0, lost: 1 } } }),
    ];
    const agg = aggregateScorecards(rows);
    expect(agg.byPickRole.hero.won).toBe(1);
    expect(agg.byPickRole.hero.lost).toBe(1);
    expect(agg.byPickRole.tracking.won).toBe(0);
    expect(agg.byPickRole.tracking.lost).toBe(2);
  });

  it('legacy rows (no by_pick_role) contribute zero', () => {
    const rows = [
      mkRow({ date: '2026-05-05', overall: { won: 0, lost: 2 } }), // no byPickRole
    ];
    const agg = aggregateScorecards(rows);
    expect(agg.byPickRole.hero.won).toBe(0);
    expect(agg.byPickRole.hero.lost).toBe(0);
    expect(agg.byPickRole.tracking.won).toBe(0);
    expect(agg.byPickRole.tracking.lost).toBe(0);
  });
});

describe('v13 — shapeWindow exposes byPickRole', () => {
  it('returns formatted records for hero and tracking', () => {
    const rows = [
      mkRow({ date: '2026-05-09', overall: { won: 1, lost: 1 },
        byPickRole: { hero: { won: 1, lost: 0 }, tracking: { won: 0, lost: 1 } } }),
    ];
    const w = shapeWindow(rows, 'Last 7 days');
    expect(w.byPickRole).toBeTruthy();
    expect(w.byPickRole.hero.record).toBe('1–0');
    expect(w.byPickRole.hero.winRate).toBe(100);
    expect(w.byPickRole.tracking.record).toBe('0–1');
    expect(w.byPickRole.tracking.winRate).toBe(0);
  });

  it('emits null records when no graded picks of that role', () => {
    const rows = [
      mkRow({ date: '2026-05-09', overall: { won: 0, lost: 0, pending: 2 },
        byPickRole: { hero: { pending: 1 }, tracking: { pending: 1 } } }),
    ];
    const w = shapeWindow(rows, 'Last 7 days');
    expect(w.byPickRole.hero.record).toBeNull();
    expect(w.byPickRole.tracking.record).toBeNull();
  });
});
