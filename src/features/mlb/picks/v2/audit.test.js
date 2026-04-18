import { describe, it, expect } from 'vitest';
import { analyzePicks } from './audit.js';

function p(o = {}) {
  return {
    pick_key: o.key || 'k',
    market_type: o.market || 'moneyline',
    tier: o.tier || 'tier2',
    selection_side: o.side || 'away',
    bet_score: o.score ?? 0.6,
    raw_edge: o.edge ?? 0.03,
    top_signals: o.signals ?? ['Rotation quality (moderate away edge)'],
    pick_results: o.status ? [{ status: o.status }] : [],
  };
}

describe('analyzePicks', () => {
  it('returns summary shape with zeros when empty', () => {
    const r = analyzePicks({ sport: 'mlb', slateDate: '2026-04-17', picks: [] });
    expect(r.summary.sampleSize).toBe(0);
    expect(r.summary.overall).toEqual({ won: 0, lost: 0, push: 0, pending: 0 });
    expect(r.recommendedDeltas.rationale).toEqual([]);
  });

  it('proposes raising tier1 floor when tier1 hit rate is bad with sample', () => {
    const picks = [];
    for (let i = 0; i < 20; i++) {
      picks.push(p({ tier: 'tier1', status: i < 8 ? 'won' : 'lost' })); // 8-12 → 40%
    }
    const r = analyzePicks({ sport: 'mlb', slateDate: 'x', picks });
    expect(r.recommendedDeltas.tierCutoffs?.tier1?.floor?.delta).toBe(0.02);
  });

  it('proposes tightening totals gate when totals hit < 45% with sample', () => {
    const picks = [];
    for (let i = 0; i < 20; i++) picks.push(p({ market: 'total', side: 'over', status: i < 7 ? 'won' : 'lost' })); // 35%
    const r = analyzePicks({ sport: 'mlb', slateDate: 'x', picks });
    expect(r.recommendedDeltas.marketGates?.total?.minExpectedDelta?.delta).toBe(0.05);
  });

  it('signal attribution groups by base signal name', () => {
    const picks = [
      p({ signals: ['Rotation quality (strong away edge)'], status: 'won' }),
      p({ signals: ['Rotation quality (moderate home edge)'], status: 'lost' }),
    ];
    const r = analyzePicks({ sport: 'mlb', slateDate: 'x', picks });
    expect(r.signalAttribution['Rotation quality']).toEqual({ won: 1, lost: 1, push: 0, pending: 0 });
  });
});
