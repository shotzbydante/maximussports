/**
 * Tests for performance + audit shaping helpers.
 *
 * The invariants we guard:
 *   1. No fake stats — sparsity returns empty, not zero-filled.
 *   2. Minimum-sample guards must prevent "strong insight" claims when
 *      there aren't enough graded picks.
 *   3. Delta guards prevent calling out a market or tier as "strongest"
 *      unless it meaningfully leads the next.
 *   4. Top-play hit rate only surfaces after ≥ 7 graded top plays.
 */

import { describe, it, expect } from 'vitest';
import {
  aggregateScorecards,
  shapeWindow,
  strongestMarket,
  strongestTier,
  summarizeInsights,
  summarizeAuditInsights,
  PERF_CONSTANTS,
} from './performanceInsights.js';

function day({ date = '2026-04-17', ml, rl, tot, tier1, tier2, tier3, top = null }) {
  return {
    slate_date: date,
    record: sumAll([ml, rl, tot]),
    by_market: {
      moneyline: ml || empty(),
      runline: rl || empty(),
      total: tot || empty(),
    },
    by_tier: {
      tier1: tier1 || empty(),
      tier2: tier2 || empty(),
      tier3: tier3 || empty(),
    },
    top_play_result: top,
  };
}
function rec(won, lost, push = 0, pending = 0) {
  return { won, lost, push, pending };
}
function empty() { return { won: 0, lost: 0, push: 0, pending: 0 }; }
function sumAll(arr) {
  const o = empty();
  for (const r of arr) { if (!r) continue; o.won += r.won; o.lost += r.lost; o.push += r.push; }
  return o;
}

describe('aggregateScorecards', () => {
  it('returns zeroed aggregate for empty input', () => {
    const a = aggregateScorecards([]);
    expect(a.sampleDays).toBe(0);
    expect(a.overall).toEqual(empty());
    expect(a.sparse).toBe(true);
  });

  it('sums across days', () => {
    const a = aggregateScorecards([
      day({ ml: rec(1, 0), rl: rec(1, 1), tot: rec(1, 0), top: 'won' }),
      day({ ml: rec(0, 1), rl: rec(2, 0), tot: rec(0, 1), top: 'lost' }),
      day({ ml: rec(1, 0), rl: rec(0, 0), tot: rec(1, 1), top: 'won' }),
    ]);
    expect(a.sampleDays).toBe(3);
    expect(a.byMarket.moneyline).toEqual({ won: 2, lost: 1, push: 0, pending: 0 });
    expect(a.byMarket.runline).toEqual({ won: 3, lost: 1, push: 0, pending: 0 });
    expect(a.topPlay.graded).toBe(3);
    expect(a.topPlay.won).toBe(2);
    expect(a.topPlay.hitRate).toBeCloseTo(0.667, 2);
  });

  it('flags sparse when graded < MIN_WINDOW_SAMPLE', () => {
    const a = aggregateScorecards([day({ ml: rec(1, 0) })]);
    expect(a.sparse).toBe(true);
  });
});

describe('strongestMarket', () => {
  it('returns null when below sample', () => {
    const a = { byMarket: { moneyline: rec(1, 0), runline: rec(1, 0), total: rec(1, 0) } };
    expect(strongestMarket(a)).toBeNull();
  });
  it('returns null when delta under threshold', () => {
    const a = { byMarket: {
      moneyline: rec(6, 4),  // 60%
      runline:   rec(7, 5),  // 58%
      total:     rec(5, 4),  // 55%
    } };
    expect(strongestMarket(a)).toBeNull();
  });
  it('returns top when sample + delta pass', () => {
    const a = { byMarket: {
      moneyline: rec(8, 2),  // 80%
      runline:   rec(3, 5),  // 37%
      total:     rec(5, 5),  // 50%
    } };
    const s = strongestMarket(a);
    expect(s).not.toBeNull();
    expect(s.key).toBe('moneyline');
    expect(s.winRate).toBe(80);
  });
});

describe('strongestTier', () => {
  it('only returns when tier sample + delta pass', () => {
    // 57% vs 55% vs 50% → deltas all under 8 pts
    const tight = { byTier: { tier1: rec(8, 6), tier2: rec(11, 9), tier3: rec(5, 5) } };
    expect(strongestTier(tight)).toBeNull();

    const decisive = { byTier: { tier1: rec(8, 2), tier2: rec(4, 6), tier3: rec(3, 4) } };
    const s = strongestTier(decisive);
    expect(s?.key).toBe('tier1');
    expect(s?.winRate).toBe(80);
  });
});

describe('summarizeInsights', () => {
  it('returns empty when aggregate is sparse', () => {
    const small = { sparse: true, byMarket: {}, byTier: {}, topPlay: { graded: 0 } };
    expect(summarizeInsights(small)).toEqual([]);
  });

  it('surfaces market + tier + top-play when all qualify', () => {
    const agg = {
      sparse: false,
      byMarket: {
        moneyline: rec(10, 2),   // 83%
        runline:   rec(4, 6),
        total:     rec(5, 5),
      },
      byTier: {
        tier1: rec(8, 2),         // 80%
        tier2: rec(3, 5),
        tier3: rec(4, 4),
      },
      topPlay: { graded: 12, won: 7, lost: 4, push: 1, hitRate: 7 / 11 },
    };
    const ins = summarizeInsights(agg);
    expect(ins.length).toBeGreaterThanOrEqual(2);
    expect(ins.some(i => /Moneyline has been the strongest/.test(i.text))).toBe(true);
    expect(ins.some(i => /Tier 1/.test(i.text))).toBe(true);
  });

  it('suppresses top-play line when not enough graded top plays', () => {
    const agg = {
      sparse: false,
      byMarket: { moneyline: rec(8, 2), runline: rec(2, 4), total: rec(3, 5) },
      byTier:   { tier1: rec(3, 2), tier2: rec(1, 3), tier3: rec(0, 2) },
      topPlay:  { graded: 3, won: 2, lost: 1, push: 0, hitRate: 2/3 },
    };
    const ins = summarizeInsights(agg);
    expect(ins.some(i => i.key === 'top_play_rate')).toBe(false);
  });
});

describe('shapeWindow', () => {
  it('returns a sparse shape when no graded picks', () => {
    const w = shapeWindow([], 'Last 7 days');
    expect(w.record).toBeNull();
    expect(w.sparse).toBe(true);
    expect(w.insights).toEqual([]);
  });
  it('returns a populated shape when data qualifies', () => {
    const scorecards = [];
    for (let i = 0; i < 14; i++) {
      scorecards.push(day({ ml: rec(2, 1), rl: rec(1, 1), tot: rec(1, 0), top: i % 2 ? 'won' : 'lost' }));
    }
    const w = shapeWindow(scorecards, 'Last 14 days');
    expect(w.record).toMatch(/^\d+–\d+/);
    expect(w.winRate).not.toBeNull();
    expect(w.sparse).toBe(false);
  });
});

describe('summarizeAuditInsights', () => {
  it('returns empty when no artifacts', () => {
    expect(summarizeAuditInsights([])).toEqual([]);
  });

  it('returns empty when total sample too small', () => {
    const artifacts = [{ summary: { overall: rec(3, 2), byMarket: {} } }];
    expect(summarizeAuditInsights(artifacts)).toEqual([]);
  });

  it('surfaces strongest market from audit rollup', () => {
    const artifacts = [
      { summary: { overall: rec(10, 2), byMarket: { moneyline: rec(10, 2), runline: rec(2, 6), total: rec(1, 3) } }, signal_attribution: {} },
      { summary: { overall: rec(6, 4),  byMarket: { moneyline: rec(6, 2),  runline: rec(0, 4), total: rec(2, 3) } }, signal_attribution: {} },
    ];
    const ins = summarizeAuditInsights(artifacts);
    expect(ins.length).toBeGreaterThan(0);
    expect(ins[0].text).toMatch(/Moneyline signals/);
  });

  it('surfaces a reliable signal when attribution qualifies', () => {
    const artifacts = [
      {
        summary: { overall: rec(12, 6), byMarket: { moneyline: rec(12, 6), runline: empty(), total: empty() } },
        signal_attribution: { 'Rotation quality': rec(9, 3), 'Offense': rec(4, 4) },
      },
    ];
    const ins = summarizeAuditInsights(artifacts);
    expect(ins.some(i => /Rotation quality/.test(i.text))).toBe(true);
  });
});

describe('PERF_CONSTANTS', () => {
  it('exposes guardrails so callers and tests can reference them', () => {
    expect(PERF_CONSTANTS.MIN_MARKET_SAMPLE).toBe(5);
    expect(PERF_CONSTANTS.MIN_WINDOW_SAMPLE).toBe(14);
    expect(PERF_CONSTANTS.MIN_DELTA_PTS).toBe(8);
  });
});
