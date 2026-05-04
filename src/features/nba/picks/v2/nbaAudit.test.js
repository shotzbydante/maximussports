import { describe, it, expect } from 'vitest';
import { analyzeNbaPicks } from './nbaAudit.js';

function pick({ market_type, side='home', line=null, price=null, status='lost', edge=0, tier='tier3', source=null }) {
  return {
    pick_key: `${market_type}-${side}-${Math.random()}`,
    market_type,
    selection_side: side,
    line_value: line,
    price_american: price,
    raw_edge: edge,
    bet_score: 0.5,
    tier,
    pick_role: tier === 'tracking' ? 'tracking' : 'hero',
    pick_results: { status },
    model_source: source,
    top_signals: [],
  };
}

describe('analyzeNbaPicks — regime detection', () => {
  it('flags all-underdog ML regime when every ML pick has positive odds', () => {
    const picks = [
      pick({ market_type: 'moneyline', price: +200, side: 'away' }),
      pick({ market_type: 'moneyline', price: +240, side: 'away' }),
      pick({ market_type: 'moneyline', price: +130, side: 'home' }),
      pick({ market_type: 'moneyline', price: +150, side: 'away' }),
    ];
    const { summary } = analyzeNbaPicks({ picks, slateDate: '2026-05-02' });
    const flag = summary.regimeFlags.find(f => f.kind === 'all_underdog_ml');
    expect(flag).toBeTruthy();
    expect(flag.sampleSize).toBe(4);
  });

  it('flags all-underdog ATS regime', () => {
    const picks = [
      pick({ market_type: 'runline', line: +7, side: 'away' }),
      pick({ market_type: 'runline', line: +5.5, side: 'home' }),
      pick({ market_type: 'runline', line: +13, side: 'away' }),
    ];
    const { summary } = analyzeNbaPicks({ picks, slateDate: '2026-05-02' });
    expect(summary.regimeFlags.some(f => f.kind === 'all_underdog_ats')).toBe(true);
  });

  it('flags all-over totals regime', () => {
    const picks = [
      pick({ market_type: 'total', side: 'over' }),
      pick({ market_type: 'total', side: 'over' }),
      pick({ market_type: 'total', side: 'over' }),
    ];
    const { summary } = analyzeNbaPicks({ picks, slateDate: '2026-05-02' });
    expect(summary.regimeFlags.some(f => f.kind === 'all_over')).toBe(true);
  });

  it('flags slate-baseline-dominant totals', () => {
    const picks = [
      pick({ market_type: 'total', side: 'over', source: 'slate_baseline_v1' }),
      pick({ market_type: 'total', side: 'under', source: 'slate_baseline_v1' }),
      pick({ market_type: 'total', side: 'over', source: 'slate_baseline_v1' }),
    ];
    const { summary } = analyzeNbaPicks({ picks, slateDate: '2026-05-02' });
    expect(summary.regimeFlags.some(f => f.kind === 'totals_slate_baseline_dominant')).toBe(true);
  });

  it('does not flag mixed regimes', () => {
    const picks = [
      pick({ market_type: 'moneyline', price: -200 }),
      pick({ market_type: 'moneyline', price: +250 }),
      pick({ market_type: 'moneyline', price: -110 }),
    ];
    const { summary } = analyzeNbaPicks({ picks, slateDate: '2026-05-02' });
    expect(summary.regimeFlags.find(f => f.kind === 'all_underdog_ml')).toBeUndefined();
  });
});

describe('analyzeNbaPicks — proposer & guardrails', () => {
  it('does NOT auto-tune from a small underdog losing day', () => {
    const picks = [
      pick({ market_type: 'moneyline', price: +200, status: 'lost' }),
      pick({ market_type: 'moneyline', price: +240, status: 'lost' }),
      pick({ market_type: 'moneyline', price: +130, status: 'lost' }),
    ];
    const { recommendedDeltas } = analyzeNbaPicks({ picks, slateDate: '2026-05-02' });
    expect(recommendedDeltas.marketGates).toBeNull();
    // But it should still write a regime rationale.
    const text = recommendedDeltas.rationale.join(' ');
    expect(text).toMatch(/REGIME all_underdog_ml/);
  });

  it('proposes a bounded shadow delta when sample ≥ 30 and dog hit rate < 45%', () => {
    const picks = [];
    for (let i = 0; i < 35; i++) {
      picks.push(pick({ market_type: 'moneyline', price: +180,
        status: i < 12 ? 'won' : 'lost' })); // 12/35 = 34% hit
    }
    const { recommendedDeltas } = analyzeNbaPicks({ picks, slateDate: '2026-05-02' });
    expect(recommendedDeltas.marketGates?.moneyline?.minUnderdogEdge?.delta).toBeGreaterThan(0);
  });

  it('proposes total-gate tightening when overs hit < 45% with sample', () => {
    const picks = [];
    for (let i = 0; i < 32; i++) {
      picks.push(pick({ market_type: 'total', side: 'over',
        status: i < 12 ? 'won' : 'lost' }));
    }
    const { recommendedDeltas } = analyzeNbaPicks({ picks, slateDate: '2026-05-02' });
    expect(recommendedDeltas.marketGates?.total?.minExpectedDelta?.delta).toBeGreaterThan(0);
  });
});

describe('analyzeNbaPicks — slicing', () => {
  it('slices ML by favorite/underdog', () => {
    const picks = [
      pick({ market_type: 'moneyline', price: -200, status: 'won' }),
      pick({ market_type: 'moneyline', price: +250, status: 'lost' }),
      pick({ market_type: 'moneyline', price: -110, status: 'won' }),
    ];
    const { summary } = analyzeNbaPicks({ picks, slateDate: '2026-05-02' });
    expect(summary.byFavoriteSide.ml_favorite.won).toBe(2);
    expect(summary.byFavoriteSide.ml_underdog.lost).toBe(1);
  });

  it('slices ATS by spread bucket', () => {
    const picks = [
      pick({ market_type: 'runline', line: -3, status: 'won' }),
      pick({ market_type: 'runline', line: -8, status: 'lost' }),
      pick({ market_type: 'runline', line: +6, status: 'won' }),
    ];
    const { summary } = analyzeNbaPicks({ picks, slateDate: '2026-05-02' });
    expect(summary.bySpreadBucket['fav_-0.5_-4.5'].won).toBe(1);
    expect(summary.bySpreadBucket['fav_-5_-9.5'].lost).toBe(1);
    expect(summary.bySpreadBucket['dog_+5_+9.5'].won).toBe(1);
  });

  it('slices totals by source', () => {
    const picks = [
      pick({ market_type: 'total', side: 'over', source: 'series_pace_v1', status: 'won' }),
      pick({ market_type: 'total', side: 'over', source: 'team_recent_v1', status: 'lost' }),
      pick({ market_type: 'total', side: 'under', source: 'slate_baseline_v1', status: 'lost' }),
    ];
    const { summary } = analyzeNbaPicks({ picks, slateDate: '2026-05-02' });
    expect(summary.byTotalsSource.series_pace_v1.won).toBe(1);
    expect(summary.byTotalsSource.slate_baseline_v1.lost).toBe(1);
  });
});
