import { describe, it, expect } from 'vitest';
import {
  recentScoringTrend,
  closingTotalDeviationTrend,
  adjustFairTotal,
} from './nbaTotalsHistory.js';

function mkFinal({ away, awayScore, home, homeScore, startTime = '2026-04-25T22:00:00Z' }) {
  return {
    teams: {
      away: { slug: away, score: awayScore },
      home: { slug: home, score: homeScore },
    },
    gameState: { isFinal: true },
    status: 'final',
    startTime,
  };
}

describe('recentScoringTrend', () => {
  it('uses ESPN-style finals from windowGames', () => {
    const w = [
      mkFinal({ away: 'bos', awayScore: 110, home: 'mil', homeScore: 105, startTime: '2026-04-29' }),
      mkFinal({ away: 'mil', awayScore: 112, home: 'bos', homeScore: 119, startTime: '2026-04-27' }),
      mkFinal({ away: 'bos', awayScore: 100, home: 'cle', homeScore: 95,  startTime: '2026-04-21' }),
    ];
    const r = recentScoringTrend({ awaySlug: 'bos', homeSlug: 'mil', windowGames: w });
    expect(r.combinedAvg).not.toBeNull();
    expect(r.sample).toBeGreaterThan(0);
    expect(r.confidence).toBeGreaterThan(0);
  });
  it('returns nulls when no priors', () => {
    const r = recentScoringTrend({ awaySlug: 'bos', homeSlug: 'mil', windowGames: [] });
    expect(r.combinedAvg).toBeNull();
    expect(r.sample).toBe(0);
  });
  it('low sample → low confidence', () => {
    const w = [mkFinal({ away: 'bos', awayScore: 110, home: 'mia', homeScore: 105 })];
    const r = recentScoringTrend({ awaySlug: 'bos', homeSlug: 'mia', windowGames: w });
    expect(r.confidence).toBeLessThan(0.5);
  });
});

describe('closingTotalDeviationTrend', () => {
  it('detects over-tendency from historical closing totals', () => {
    const history = [
      { teamSlug: 'bos', closingTotal: 220, finalCombined: 230 },
      { teamSlug: 'bos', closingTotal: 215, finalCombined: 222 },
      { teamSlug: 'mil', closingTotal: 224, finalCombined: 228 },
    ];
    const r = closingTotalDeviationTrend({ awaySlug: 'bos', homeSlug: 'mil', history });
    expect(r.blendedDeviation).toBeGreaterThan(0);
    expect(r.awayOverRate).toBeCloseTo(1.0, 2);
    expect(r.sample).toBe(3);
  });
  it('detects under-tendency', () => {
    const history = [
      { teamSlug: 'bos', closingTotal: 220, finalCombined: 200 },
      { teamSlug: 'mil', closingTotal: 224, finalCombined: 210 },
    ];
    const r = closingTotalDeviationTrend({ awaySlug: 'bos', homeSlug: 'mil', history });
    expect(r.blendedDeviation).toBeLessThan(0);
  });
  it('empty history → nulls', () => {
    const r = closingTotalDeviationTrend({ awaySlug: 'bos', homeSlug: 'mil', history: [] });
    expect(r.blendedDeviation).toBeNull();
  });
});

describe('adjustFairTotal — composed', () => {
  it('series prior of 220 + recent over-trend → fairTotal nudges up, capped', () => {
    const w = [
      mkFinal({ away: 'bos', awayScore: 120, home: 'mil', homeScore: 115 }),
      mkFinal({ away: 'mil', awayScore: 122, home: 'bos', homeScore: 118 }),
      mkFinal({ away: 'bos', awayScore: 118, home: 'mil', homeScore: 122 }),
      mkFinal({ away: 'mil', awayScore: 116, home: 'bos', homeScore: 120 }),
    ];
    const out = adjustFairTotal({
      baseFairTotal: 220,
      baseSource: 'series_pace_v1',
      baseConfidence: 0.5,
      awaySlug: 'bos',
      homeSlug: 'mil',
      windowGames: w,
    });
    expect(out.fairTotal).toBeGreaterThan(220);
    expect(Math.abs(out.adjustment)).toBeLessThanOrEqual(3.0);
    expect(out.source).toBe('series_pace_v1+trend_v1');
  });

  it('series prior of 240 with recent under-trend → fairTotal nudges DOWN', () => {
    const w = [
      mkFinal({ away: 'bos', awayScore: 100, home: 'mil', homeScore: 95 }),
      mkFinal({ away: 'mil', awayScore: 98,  home: 'bos', homeScore: 102 }),
    ];
    const out = adjustFairTotal({
      baseFairTotal: 240,
      baseSource: 'team_recent_v1',
      baseConfidence: 0.4,
      awaySlug: 'bos',
      homeSlug: 'mil',
      windowGames: w,
    });
    expect(out.fairTotal).toBeLessThan(240);
  });

  it('low sample produces tracking-quality output', () => {
    const w = [];
    const out = adjustFairTotal({
      baseFairTotal: 220,
      baseSource: 'slate_baseline_v1',
      baseConfidence: 0.2,
      awaySlug: 'bos',
      homeSlug: 'mil',
      windowGames: w,
    });
    expect(out.fairTotal).toBe(220);
    expect(out.adjustment).toBe(0);
  });

  it('closing-total history exposes per-team over hit rate', () => {
    const closingHistory = [
      { teamSlug: 'bos', closingTotal: 218, finalCombined: 230 },
      { teamSlug: 'bos', closingTotal: 222, finalCombined: 232 },
      { teamSlug: 'mil', closingTotal: 220, finalCombined: 228 },
    ];
    const out = adjustFairTotal({
      baseFairTotal: 222,
      baseSource: 'series_pace_v1',
      baseConfidence: 0.5,
      awaySlug: 'bos',
      homeSlug: 'mil',
      windowGames: [],
      closingHistory,
    });
    expect(out.fairTotal).toBeGreaterThan(222);
    expect(out.components.closing).not.toBeNull();
    expect(out.components.closing.sample).toBe(3);
  });
});
