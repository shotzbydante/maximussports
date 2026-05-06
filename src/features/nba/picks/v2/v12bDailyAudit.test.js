/**
 * v12b — daily audit module covers:
 *   - pending picks excluded from record/tuning
 *   - hero vs tracking record split
 *   - positive evidence for totals wins
 *   - shadow findings for ML/ATS misses
 *   - new ATS short-dog + long-shot ML hard-cap slices
 */

import { describe, it, expect } from 'vitest';
import { analyzeNbaPicks } from './nbaAudit.js';

function pick({ market_type, side='home', line=null, price=null,
                status='lost', edge=0, tier='tracking', source=null,
                long_shot_dog_risk_supported=undefined,
                ats_short_dog_risk_supported=undefined }) {
  return {
    pick_key: `${market_type}-${side}-${Math.random()}`,
    market_type, selection_side: side,
    line_value: line, price_american: price,
    raw_edge: edge, bet_score: 0.5,
    tier, pick_role: tier === 'tracking' ? 'tracking' : 'hero',
    pick_results: { status }, model_source: source,
    long_shot_dog_risk_supported, ats_short_dog_risk_supported,
    top_signals: [],
  };
}

describe('v12b — pending picks excluded', () => {
  it('PHI ML +220 pending does NOT count toward record/tuning', () => {
    const picks = [
      pick({ market_type: 'moneyline', price: +220, status: 'pending' }),
      pick({ market_type: 'total', side: 'under', status: 'won', source: 'team_recent_v1' }),
      pick({ market_type: 'moneyline', price: +700, status: 'lost', source: 'spread' }),
    ];
    const { summary } = analyzeNbaPicks({ picks, slateDate: '2026-05-05' });
    expect(summary.excludedPending).toBe(1);
    // Pending pick should not appear in byMarket.moneyline.lost
    expect(summary.byMarket.moneyline.lost).toBe(1);   // only LAL
    expect(summary.byMarket.moneyline.won).toBe(0);
  });
});

describe('v12b — hero vs tracking record split', () => {
  it('separates hero (1-0) from tracking (0-2) on May 5 fixture', () => {
    const picks = [
      pick({ market_type: 'total', side: 'under', status: 'won', tier: 'tier3', source: 'team_recent_v1+trend_v1' }),
      pick({ market_type: 'moneyline', price: +700, status: 'lost', tier: 'tracking', source: 'spread' }),
      pick({ market_type: 'runline', line: +3, side: 'away', status: 'lost', tier: 'tracking', source: 'devigged_ml' }),
    ];
    // tier='tier3' picks default to pick_role='hero' in the helper
    const { summary } = analyzeNbaPicks({ picks, slateDate: '2026-05-05' });
    expect(summary.byHeroVsTracking.hero.won).toBe(1);
    expect(summary.byHeroVsTracking.hero.lost).toBe(0);
    expect(summary.byHeroVsTracking.tracking.won).toBe(0);
    expect(summary.byHeroVsTracking.tracking.lost).toBe(2);
  });
});

describe('v12b — positive evidence for totals wins', () => {
  it('logs Under 213.5 win as positive evidence', () => {
    const picks = [
      pick({ market_type: 'total', side: 'under', status: 'won', source: 'team_recent_v1+trend_v1' }),
    ];
    const { summary } = analyzeNbaPicks({ picks, slateDate: '2026-05-05' });
    expect(summary.positiveEvidence).toHaveLength(1);
    expect(summary.positiveEvidence[0].type).toBe('totals_source_win');
    expect(summary.positiveEvidence[0].modelSource).toContain('team_recent_v1');
  });

  it('does NOT log slate-baseline-only wins as positive evidence', () => {
    const picks = [
      pick({ market_type: 'total', side: 'over', status: 'won', source: 'slate_baseline_v1' }),
    ];
    const { summary } = analyzeNbaPicks({ picks, slateDate: '2026-05-05' });
    expect(summary.positiveEvidence).toHaveLength(0);
  });
});

describe('v12b — shadow findings for ML/ATS misses', () => {
  it('LAL ML +700 loss creates shadow finding', () => {
    const picks = [
      pick({ market_type: 'moneyline', price: +700, status: 'lost', source: 'spread' }),
    ];
    const { summary } = analyzeNbaPicks({ picks, slateDate: '2026-05-05' });
    const finding = summary.shadowFindings.find(f => f.type === 'long_shot_ml_dog_miss');
    expect(finding).toBeTruthy();
    expect(finding.safeToAutoApply).toBe(false);
  });

  it('CLE +3 loss creates ATS short-dog shadow finding', () => {
    const picks = [
      pick({ market_type: 'runline', line: +3, side: 'away', status: 'lost', source: 'devigged_ml' }),
    ];
    const { summary } = analyzeNbaPicks({ picks, slateDate: '2026-05-05' });
    const finding = summary.shadowFindings.find(f => f.type === 'ats_short_dog_miss');
    expect(finding).toBeTruthy();
    expect(finding.safeToAutoApply).toBe(false);
  });

  it('Under 213.5 win does NOT generate a shadow finding', () => {
    const picks = [
      pick({ market_type: 'total', side: 'under', status: 'won' }),
    ];
    const { summary } = analyzeNbaPicks({ picks, slateDate: '2026-05-05' });
    expect(summary.shadowFindings).toHaveLength(0);
  });
});

describe('v12b — new audit slices', () => {
  it('byAtsShortDog + byAtsShortDogUnsupported populate', () => {
    const picks = [
      pick({ market_type: 'runline', line: +3, side: 'away', status: 'lost',
             ats_short_dog_risk_supported: false }),
      pick({ market_type: 'runline', line: +5, side: 'home', status: 'won',
             ats_short_dog_risk_supported: true }),
    ];
    const { summary } = analyzeNbaPicks({ picks, slateDate: '2026-05-05' });
    expect(summary.byAtsShortDog.lost).toBe(1);
    expect(summary.byAtsShortDog.won).toBe(1);
    expect(summary.byAtsShortDogUnsupported.lost).toBe(1);
  });

  it('one-day samples never auto-apply', () => {
    const picks = [
      pick({ market_type: 'moneyline', price: +700, status: 'lost', source: 'spread' }),
      pick({ market_type: 'runline', line: +3, side: 'away', status: 'lost', source: 'devigged_ml' }),
    ];
    const { recommendedDeltas } = analyzeNbaPicks({ picks, slateDate: '2026-05-05' });
    expect(recommendedDeltas.marketGates).toBeNull();
    expect(recommendedDeltas.tierCutoffs).toBeNull();
    expect(recommendedDeltas.weights).toBeNull();
  });
});
