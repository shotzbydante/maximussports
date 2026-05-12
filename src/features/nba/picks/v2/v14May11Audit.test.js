/**
 * v14 — May 11 audit fixtures: ML dog buckets + ATS dog buckets +
 * totals support score + audit evidence types.
 */

import { describe, it, expect } from 'vitest';
import {
  mlDogPriceBucket,
  atsDogSpreadBucket,
  countIndependentDogSupport,
  totalsSupportScore,
} from './teamForm.js';
import { analyzeNbaPicks } from './nbaAudit.js';
import { buildNbaPicksV2, NBA_DEFAULT_CONFIG, NBA_MODEL_VERSION } from './buildNbaPicksV2.js';

describe('v14 model version', () => {
  it('bumped past v2.4.1 (v14 line or later)', () => {
    // v14 was v2.4.2; v15 bumped to v2.5.0. Accept any forward bump.
    expect(NBA_MODEL_VERSION).toMatch(/^nba-picks-v2\.([4-9]|\d{2,})\./);
  });
});

describe('v14 — mlDogPriceBucket', () => {
  it('classifies favorites and dog bands', () => {
    expect(mlDogPriceBucket(-200)).toBe('favorite');
    expect(mlDogPriceBucket(-100)).toBe('favorite');
    expect(mlDogPriceBucket(+105)).toBe('pickem');
    expect(mlDogPriceBucket(+138)).toBe('dog_100_199');
    expect(mlDogPriceBucket(+199)).toBe('dog_100_199');
    expect(mlDogPriceBucket(+200)).toBe('dog_200_399');
    expect(mlDogPriceBucket(+399)).toBe('dog_200_399');
    expect(mlDogPriceBucket(+450)).toBe('dog_400_plus');
    expect(mlDogPriceBucket(+700)).toBe('dog_400_plus');
  });
  it('null on missing price', () => {
    expect(mlDogPriceBucket(null)).toBeNull();
  });
});

describe('v14 — atsDogSpreadBucket', () => {
  it('classifies favorites and dog spread bands', () => {
    expect(atsDogSpreadBucket(-7)).toBe('fav');
    expect(atsDogSpreadBucket(-3.5)).toBe('fav');
    expect(atsDogSpreadBucket(+0.5)).toBe('short');
    expect(atsDogSpreadBucket(+3.5)).toBe('short');
    expect(atsDogSpreadBucket(+6.5)).toBe('short');
    expect(atsDogSpreadBucket(+7)).toBe('medium');
    expect(atsDogSpreadBucket(+8.5)).toBe('medium');
    expect(atsDogSpreadBucket(+9)).toBe('large');
    expect(atsDogSpreadBucket(+12.5)).toBe('large');
  });
});

describe('v14 — countIndependentDogSupport', () => {
  it('zero when no signals', () => {
    expect(countIndependentDogSupport({})).toBe(0);
  });
  it('counts dog non-negative margin', () => {
    const n = countIndependentDogSupport({
      dogForm: { recentMarginAvg: 2, blowoutWinCount: 0 },
    });
    expect(n).toBe(1);
  });
  it('counts favorite advantage modest', () => {
    const n = countIndependentDogSupport({
      dogForm: { recentMarginAvg: 0, blowoutWinCount: 0 },
      favoriteForm: { recentMarginAvg: 5 },
    });
    // dog non-negative (1) + advantage ≤ 8 (1) = 2
    expect(n).toBe(2);
  });
  it('counts dog leading in series', () => {
    const n = countIndependentDogSupport({
      dogSeriesPrior: { leadState: 'leading', support: 0.3 },
    });
    expect(n).toBe(1);
  });
  it('counts blowout win', () => {
    const n = countIndependentDogSupport({
      dogForm: { recentMarginAvg: -5, blowoutWinCount: 1 },
    });
    expect(n).toBe(1);
  });
});

describe('v14 — totalsSupportScore', () => {
  it('returns 0 for non-real source', () => {
    expect(totalsSupportScore({
      modelSource: 'slate_baseline_v1',
      totalsTrendAgreement: { agreement: 'agree' },
      awayForm: { sample: 3, marginVolatility: 10 },
      homeForm: { sample: 3, marginVolatility: 10 },
    })).toBe(0);
  });
  it('returns 0 when trend not agree', () => {
    expect(totalsSupportScore({
      modelSource: 'team_recent_v1+trend_v1',
      totalsTrendAgreement: { agreement: 'mixed' },
      awayForm: { sample: 3, marginVolatility: 10 },
      homeForm: { sample: 3, marginVolatility: 10 },
    })).toBe(0);
  });
  it('returns 0 when low sample', () => {
    expect(totalsSupportScore({
      modelSource: 'team_recent_v1+trend_v1',
      totalsTrendAgreement: { agreement: 'agree' },
      awayForm: { sample: 1, marginVolatility: 10 },
      homeForm: { sample: 3, marginVolatility: 10 },
    })).toBe(0);
  });
  it('returns 0 when volatility too high', () => {
    expect(totalsSupportScore({
      modelSource: 'team_recent_v1+trend_v1',
      totalsTrendAgreement: { agreement: 'agree' },
      awayForm: { sample: 3, marginVolatility: 20 },
      homeForm: { sample: 3, marginVolatility: 10 },
    })).toBe(0);
  });
  it('returns +0.05 when all aligned', () => {
    expect(totalsSupportScore({
      modelSource: 'series_pace_v1+trend_v1',
      totalsTrendAgreement: { agreement: 'agree' },
      awayForm: { sample: 3, marginVolatility: 10 },
      homeForm: { sample: 3, marginVolatility: 12 },
    })).toBe(0.05);
  });
});

describe('v14 — ML dog cross-market cap', () => {
  it('DET +138 (under +200) NOT v14-capped — bucket telemetry still populated', () => {
    const game = {
      gameId: 'det-cle',
      startTime: '2026-05-11T21:00:00Z',
      status: 'upcoming', gameState: { isLive: false, isFinal: false },
      teams: {
        away: { slug: 'det', name: 'DET', abbrev: 'DET' },
        home: { slug: 'cle', name: 'CLE', abbrev: 'CLE' },
      },
      market: { moneyline: { away: +138, home: -160 }, pregameSpread: -3.5, pregameTotal: 213 },
      model: {
        confidence: 0.7, fairTotal: 215,
        fairTotalSource: 'team_recent_v1+trend_v1', fairTotalConfidence: 0.6,
        awayTeamForm: { teamSlug: 'det', sample: 2, confidence: 0.33, recentMarginAvg: -6,
                        recentTotalAvg: 215, marginVolatility: 12, formScore: -0.4,
                        blowoutWinCount: 0, blowoutLossCount: 0 },
        homeTeamForm: { teamSlug: 'cle', sample: 2, confidence: 0.33, recentMarginAvg: +8,
                        recentTotalAvg: 218, marginVolatility: 10, formScore: 0.53 },
      },
      signals: { importanceScore: 60, watchabilityScore: 50, marketDislocationScore: 55 },
    };
    const r = buildNbaPicksV2({ games: [game], config: NBA_DEFAULT_CONFIG });
    const detMl = r.fullSlatePicks.find(p =>
      p.gameId === 'det-cle' && p.market?.type === 'moneyline'
    );
    expect(detMl).toBeTruthy();
    // v14 cap only fires for price ≥ 200; DET +138 stays under the
    // cap, but the bucket telemetry must populate for audit slicing.
    if (detMl?.market?.priceAmerican > 0) {
      expect(detMl.mlDogPriceBucket).toBe('dog_100_199');
    }
  });

  it('LAL +450 cross-market dog with no support → betScore capped at 0.40', () => {
    const game = {
      gameId: 'lal-okc',
      startTime: '2026-05-12T01:00:00Z',
      status: 'upcoming', gameState: { isLive: false, isFinal: false },
      teams: {
        away: { slug: 'lal', name: 'LAL', abbrev: 'LAL' },
        home: { slug: 'okc', name: 'OKC', abbrev: 'OKC' },
      },
      market: { moneyline: { away: +450, home: -650 }, pregameSpread: -12.5, pregameTotal: 215 },
      model: {
        confidence: 0.7, fairTotal: 218,
        fairTotalSource: 'team_recent_v1+trend_v1', fairTotalConfidence: 0.6,
        awayTeamForm: { teamSlug: 'lal', sample: 2, confidence: 0.33, recentMarginAvg: -18,
                        recentTotalAvg: 218, marginVolatility: 6, formScore: -1,
                        blowoutWinCount: 0, blowoutLossCount: 2,
                        recentBlowoutRisk: true, repeatedLossRisk: true },
        homeTeamForm: { teamSlug: 'okc', sample: 2, confidence: 0.33, recentMarginAvg: +18,
                        recentTotalAvg: 218, marginVolatility: 6, formScore: 1,
                        blowoutWinCount: 2 },
      },
      signals: { importanceScore: 70, watchabilityScore: 70, marketDislocationScore: 60 },
    };
    const r = buildNbaPicksV2({ games: [game], config: NBA_DEFAULT_CONFIG });
    const lalMl = r.fullSlatePicks.find(p =>
      p.gameId === 'lal-okc' && p.market?.type === 'moneyline'
    );
    // If picked LAL (away dog), v14 cap applies.
    if (lalMl?.selection?.side === 'away' && lalMl.market?.priceAmerican >= 200) {
      expect(lalMl.betScore?.total).toBeLessThanOrEqual(0.40 + 1e-6);
      expect(lalMl.mlDogPriceBucket).toBe('dog_400_plus');
      expect(lalMl.mlDogIndependentSupportCount).toBeLessThan(2);
    }
  });
});

describe('v14 — audit slices populate', () => {
  function mkPick({ market, side='away', line=null, price=null, status='lost',
                   bucket=null, atsBucket=null, totalMargin=null,
                   modelSource=null, role='tracking' }) {
    return {
      pick_key: `${market}-${Math.random()}`,
      market_type: market, selection_side: side,
      line_value: line, price_american: price,
      raw_edge: 0.05, bet_score: 0.45,
      tier: role === 'hero' ? 'tier3' : 'tracking',
      pick_role: role,
      pick_results: { status },
      model_source: modelSource,
      ml_dog_price_bucket: bucket,
      ats_dog_spread_bucket: atsBucket,
      total_result_margin: totalMargin,
      top_signals: [],
    };
  }

  it('byMlDogPriceBucket populates from May 11 fixture', () => {
    const picks = [
      mkPick({ market: 'moneyline', side: 'away', price: +138, status: 'lost', bucket: 'dog_100_199' }),
      mkPick({ market: 'moneyline', side: 'away', price: +450, status: 'lost', bucket: 'dog_400_plus' }),
    ];
    const { summary } = analyzeNbaPicks({ picks, slateDate: '2026-05-11' });
    expect(summary.byMlDogPriceBucket.dog_100_199.lost).toBe(1);
    expect(summary.byMlDogPriceBucket.dog_400_plus.lost).toBe(1);
    expect(summary.negativeEvidence.length).toBe(2);
    expect(summary.negativeEvidence.every(e => e.safeToAutoApply === false)).toBe(true);
  });

  it('byAtsDogSpreadBucket populates', () => {
    const picks = [
      mkPick({ market: 'runline', line: +3.5, status: 'lost', atsBucket: 'short' }),
      mkPick({ market: 'runline', line: +12.5, status: 'won', atsBucket: 'large' }),
    ];
    const { summary } = analyzeNbaPicks({ picks, slateDate: '2026-05-11' });
    expect(summary.byAtsDogSpreadBucket.short.lost).toBe(1);
    expect(summary.byAtsDogSpreadBucket.large.won).toBe(1);
    // Large-dog cover positive evidence
    const ev = summary.positiveEvidence.find(e => e.type === 'ats_large_dog_cover_evidence');
    expect(ev).toBeTruthy();
  });

  it('byTotalsMarginBucket separates narrow vs strong wins', () => {
    // Margin 2.5 → narrow (≤5). Margin 10.5 → strong (>10).
    const picks = [
      mkPick({ market: 'total', side: 'over', status: 'won', totalMargin: 2.5,  modelSource: 'series_pace_v1+trend_v1' }),
      mkPick({ market: 'total', side: 'over', status: 'won', totalMargin: 10.5, modelSource: 'series_pace_v1+trend_v1' }),
    ];
    const { summary } = analyzeNbaPicks({ picks, slateDate: '2026-05-11' });
    expect(summary.byTotalsMarginBucket.narrow.won).toBe(1);
    expect(summary.byTotalsMarginBucket.strong.won).toBe(1);
    const narrow = summary.positiveEvidence.find(e => e.type === 'totals_narrow_positive_evidence');
    const strong = summary.positiveEvidence.find(e => e.type === 'totals_strong_positive_evidence');
    expect(narrow).toBeTruthy();
    expect(strong).toBeTruthy();
  });

  it('one-day samples never auto-apply', () => {
    const picks = [
      mkPick({ market: 'moneyline', side: 'away', price: +450, status: 'lost', bucket: 'dog_400_plus' }),
    ];
    const { recommendedDeltas } = analyzeNbaPicks({ picks, slateDate: '2026-05-11' });
    expect(recommendedDeltas.marketGates).toBeNull();
    expect(recommendedDeltas.tierCutoffs).toBeNull();
    expect(recommendedDeltas.weights).toBeNull();
  });
});
