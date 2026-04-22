/**
 * shapeWindow state machine tests — ensures the UI can tell apart:
 *   'full'    — enough graded data to confidently display
 *   'partial' — some graded picks, below full-window threshold
 *   'pending' — scorecards exist but nothing graded yet
 *   'none'    — no scorecards in the window at all
 *
 * The previous UI collapsed these into "Building", which hid real
 * operational state from users and operators alike.
 */

import { describe, it, expect } from 'vitest';
import { shapeWindow, classifyWindow, aggregateScorecards, PERF_CONSTANTS } from './performanceInsights.js';

function sc(overrides) {
  return {
    slate_date: overrides.slate_date || '2026-04-20',
    record: overrides.record || { won: 0, lost: 0, push: 0, pending: 0 },
    by_market: {}, by_tier: {},
    top_play_result: overrides.top_play_result || null,
  };
}

describe('window state machine', () => {
  it("returns 'none' when no scorecards at all", () => {
    const w = shapeWindow([], 'Last 7 days');
    expect(w.state).toBe('none');
    expect(w.record).toBeNull();
  });

  it("returns 'pending' when scorecards exist but nothing graded yet", () => {
    const w = shapeWindow(
      [sc({ slate_date: '2026-04-20', record: { won: 0, lost: 0, push: 0, pending: 5 } })],
      'Last 7 days',
    );
    expect(w.state).toBe('pending');
    expect(w.pending).toBe(5);
    expect(w.record).toBeNull();
  });

  it("returns 'partial' when some graded but below full window", () => {
    const w = shapeWindow(
      [
        sc({ slate_date: '2026-04-20', record: { won: 3, lost: 1, push: 0, pending: 1 } }),
        sc({ slate_date: '2026-04-19', record: { won: 2, lost: 2, push: 0, pending: 0 } }),
      ],
      'Last 7 days',
    );
    expect(w.state).toBe('partial');
    expect(w.record).toBe('5–3');
    expect(w.winRate).toBe(63);
    expect(w.sample).toBe(8);
  });

  it("returns 'full' when graded meets the window threshold", () => {
    const cards = [];
    for (let i = 0; i < 5; i++) {
      cards.push(sc({ slate_date: `2026-04-${20 - i}`, record: { won: 3, lost: 2, push: 0, pending: 0 } }));
    }
    // 5 × 5 = 25 graded → meets MIN_WINDOW_SAMPLE=14
    const w = shapeWindow(cards, 'Last 7 days');
    expect(w.state).toBe('full');
    expect(w.sample).toBeGreaterThanOrEqual(PERF_CONSTANTS.MIN_WINDOW_SAMPLE);
  });

  it("classifyWindow returns 'full' once agg.overall graded >= MIN_WINDOW_SAMPLE", () => {
    const agg = aggregateScorecards(
      Array.from({ length: 4 }, (_, i) =>
        sc({ slate_date: `2026-04-${20 - i}`, record: { won: 4, lost: 0, push: 0, pending: 0 } }),
      ),
    );
    expect(classifyWindow(agg)).toBe('full'); // 16 graded ≥ 14
  });

  it("classifyWindow returns 'pending' when days present but zero graded", () => {
    const agg = aggregateScorecards([
      sc({ slate_date: '2026-04-20', record: { won: 0, lost: 0, push: 0, pending: 6 } }),
    ]);
    expect(classifyWindow(agg)).toBe('pending');
  });

  it("classifyWindow returns 'none' when no days at all", () => {
    const agg = aggregateScorecards([]);
    expect(classifyWindow(agg)).toBe('none');
  });
});
