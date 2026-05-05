import { describe, it, expect } from 'vitest';
import { selectBriefingPicks } from './selectBriefingPicks.js';
import { buildNbaPicksV2, NBA_DEFAULT_CONFIG } from './buildNbaPicksV2.js';

function pick({ market='moneyline', side='home', line=null, price=null, role='hero',
                modelSource='spread', rawEdge=0.05, betScore=0.65,
                components={ modelConfidence: 0.5, situationalEdge: 0.65, marketQuality: 0.85 } } = {}) {
  return {
    id: `${market}-${side}-${Math.random()}`,
    market: { type: market, line, priceAmerican: price },
    selection: { side, label: `${side} ${price ?? line ?? ''}`.trim() },
    pickRole: role,
    modelSource,
    rawEdge,
    betScore: { total: betScore, components },
  };
}

describe('selectBriefingPicks — long-shot ML guardrail', () => {
  it('rejects +300 ML dog from cross-market source', () => {
    const p = pick({ market: 'moneyline', side: 'away', price: +400, modelSource: 'spread', rawEdge: 0.18 });
    const { briefingPicks, rejectedBriefingCandidates } = selectBriefingPicks([p]);
    expect(briefingPicks).toHaveLength(0);
    expect(rejectedBriefingCandidates[0].rejectReason).toBe('long_shot_ml_cross_market');
  });

  it('rejects +700 ML dog cross-market regardless of edge', () => {
    const p = pick({ market: 'moneyline', side: 'away', price: +700, modelSource: 'no_vig_blend', rawEdge: 0.20 });
    const { briefingPicks } = selectBriefingPicks([p]);
    expect(briefingPicks).toHaveLength(0);
  });

  it('accepts a moderate-favorite ML when source is non-cross-market', () => {
    const p = pick({ market: 'moneyline', side: 'home', price: -180, modelSource: 'devigged_real_model', rawEdge: 0.07 });
    const { briefingPicks } = selectBriefingPicks([p]);
    expect(briefingPicks).toHaveLength(1);
  });
});

describe('selectBriefingPicks — large ATS dog guardrail', () => {
  it('rejects +7 ATS dog when source is cross-market', () => {
    const p = pick({ market: 'runline', side: 'away', line: +7, modelSource: 'devigged_ml', rawEdge: 0.20 });
    const { briefingPicks, rejectedBriefingCandidates } = selectBriefingPicks([p]);
    expect(briefingPicks).toHaveLength(0);
    expect(rejectedBriefingCandidates[0].rejectReason).toBe('large_ats_dog_cross_market');
  });

  it('accepts a small ATS dog when edge clears the cross-market floor', () => {
    const p = pick({
      market: 'runline', side: 'home', line: +3.5,
      modelSource: 'devigged_ml', rawEdge: 0.18,
      components: { modelConfidence: 0.55, situationalEdge: 0.65, marketQuality: 0.90 },
    });
    const { briefingPicks } = selectBriefingPicks([p]);
    expect(briefingPicks).toHaveLength(1);
  });
});

describe('selectBriefingPicks — totals', () => {
  it('accepts series_pace_v1 totals', () => {
    const p = pick({ market: 'total', side: 'over', modelSource: 'series_pace_v1', betScore: 0.75 });
    const { briefingPicks } = selectBriefingPicks([p]);
    expect(briefingPicks).toHaveLength(1);
  });
  it('accepts team_recent_v1+trend_v1 totals', () => {
    const p = pick({ market: 'total', side: 'under', modelSource: 'team_recent_v1+trend_v1', betScore: 0.7 });
    const { briefingPicks } = selectBriefingPicks([p]);
    expect(briefingPicks).toHaveLength(1);
  });
  it('rejects slate_baseline_v1 totals', () => {
    const p = pick({ market: 'total', side: 'over', modelSource: 'slate_baseline_v1', betScore: 0.7 });
    const { briefingPicks, rejectedBriefingCandidates } = selectBriefingPicks([p]);
    expect(briefingPicks).toHaveLength(0);
    expect(rejectedBriefingCandidates[0].rejectReason).toBe('weak_total_source');
  });
});

describe('selectBriefingPicks — anomalies + tracking', () => {
  it('rejects ml_spread_anomaly regardless of pickRole', () => {
    const p = pick({ market: 'moneyline', modelSource: 'ml_spread_anomaly', rawEdge: 0.04 });
    const { briefingPicks, rejectedBriefingCandidates } = selectBriefingPicks([p]);
    expect(briefingPicks).toHaveLength(0);
    expect(rejectedBriefingCandidates[0].rejectReason).toBe('ml_spread_divergence');
  });
  it('rejects tracking picks even from non-cross-market sources', () => {
    const p = pick({ role: 'tracking', market: 'total', modelSource: 'series_pace_v1' });
    const { briefingPicks } = selectBriefingPicks([p]);
    expect(briefingPicks).toHaveLength(0);
  });
});

describe('selectBriefingPicks — empty pool stays empty', () => {
  it('all-cross-market-dog hero set yields empty briefing', () => {
    const picks = [
      pick({ market: 'moneyline', side: 'away', price: +236, modelSource: 'spread', rawEdge: 0.08 }),
      pick({ market: 'moneyline', side: 'away', price: +700, modelSource: 'no_vig_blend', rawEdge: 0.20 }),
      pick({ market: 'runline',   side: 'away', line: +7,     modelSource: 'devigged_ml', rawEdge: 0.20 }),
    ];
    const { briefingPicks } = selectBriefingPicks(picks);
    expect(briefingPicks).toHaveLength(0);
  });
});

describe('end-to-end: production fixture (PHI/MIN/CLE/LAL + MIN@SAS anomaly)', () => {
  function mkGame(i, o) {
    return {
      gameId: `g-${i}`,
      startTime: new Date(Date.now() + (i+1)*3600*1000).toISOString(),
      status: 'upcoming', gameState: { isLive: false, isFinal: false },
      teams: {
        away: { slug: o.aS, name: o.aS.toUpperCase(), abbrev: o.aS.toUpperCase() },
        home: { slug: o.hS, name: o.hS.toUpperCase(), abbrev: o.hS.toUpperCase() },
      },
      market: {
        moneyline: { away: o.aMl, home: o.hMl },
        pregameSpread: o.spread,
        pregameTotal: o.total,
      },
      model: { confidence: 0.7, fairTotal: o.total - 2 },
      signals: { importanceScore: 60, watchabilityScore: 50, marketDislocationScore: 55 },
    };
  }

  it('briefingPicks excludes SAS+410 anomaly and all cross-market dogs', () => {
    const slate = [
      // ML anomaly: spread says -2.5 but ML implies -440
      mkGame(1, { aS: 'min', hS: 'sas', aMl: -460, hMl: +410, spread: -2.5, total: 210.5 }),
      // Long-shot dog cross-market
      mkGame(2, { aS: 'lal', hS: 'okc', aMl: +700, hMl: -1100, spread: -16, total: 213.5 }),
      // Moderate dog cross-market
      mkGame(3, { aS: 'phi', hS: 'nyk', aMl: +220, hMl: -270, spread: -7, total: 215 }),
    ];
    const r = buildNbaPicksV2({ games: slate, config: NBA_DEFAULT_CONFIG });

    // No ML/ATS pick should make briefing
    const briefingMlAts = r.briefingPicks.filter(p =>
      p.market?.type === 'moneyline' || p.market?.type === 'runline'
    );
    expect(briefingMlAts).toHaveLength(0);

    // The MIN@SAS game's ML pick must be flagged anomaly
    const sasMl = r.fullSlatePicks.find(p =>
      p.gameId === 'g-1' && p.market?.type === 'moneyline'
    );
    expect(sasMl?.modelSource).toBe('ml_spread_anomaly');

    // meta.flags must contain ml_spread_anomaly:g-1
    expect(r.meta.flags.some(f => f === 'ml_spread_anomaly:g-1')).toBe(true);
  });
});
