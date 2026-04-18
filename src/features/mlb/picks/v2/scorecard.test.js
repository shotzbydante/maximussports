import { describe, it, expect } from 'vitest';
import { buildScorecard } from './scorecard.js';

function pick(o) {
  return {
    pick_key: o.key || 'k',
    market_type: o.market || 'moneyline',
    tier: o.tier || 'tier2',
    bet_score: o.bet_score ?? 0.6,
    pick_results: o.status ? [{ status: o.status }] : [],
  };
}

describe('buildScorecard', () => {
  it('empty picks produces zero record + note', () => {
    const r = buildScorecard({ sport: 'mlb', slateDate: '2026-04-17', picks: [] });
    expect(r.record).toEqual({ won: 0, lost: 0, push: 0, pending: 0 });
    expect(r.note).toBe('No picks yesterday');
  });

  it('counts wins/losses/pushes overall and by market/tier', () => {
    const r = buildScorecard({
      sport: 'mlb',
      slateDate: '2026-04-17',
      picks: [
        pick({ market: 'moneyline', tier: 'tier1', status: 'won', bet_score: 0.9 }),
        pick({ market: 'runline', tier: 'tier2', status: 'lost' }),
        pick({ market: 'total', tier: 'tier2', status: 'push' }),
        pick({ market: 'moneyline', tier: 'tier3', status: 'won' }),
      ],
    });
    expect(r.record).toEqual({ won: 2, lost: 1, push: 1, pending: 0 });
    expect(r.by_market.moneyline).toEqual({ won: 2, lost: 0, push: 0, pending: 0 });
    expect(r.by_market.runline).toEqual({ won: 0, lost: 1, push: 0, pending: 0 });
    expect(r.by_tier.tier1).toEqual({ won: 1, lost: 0, push: 0, pending: 0 });
  });

  it('top play selected from highest bet_score within tier1', () => {
    const r = buildScorecard({
      sport: 'mlb',
      slateDate: '2026-04-17',
      picks: [
        pick({ key: 'low-t1', tier: 'tier1', status: 'lost', bet_score: 0.78 }),
        pick({ key: 'hi-t1',  tier: 'tier1', status: 'won',  bet_score: 0.92 }),
      ],
    });
    expect(r.top_play_result).toBe('won');
    expect(r.note).toBe('Top Play hit');
  });

  it('all pending → awaiting settlement note', () => {
    const r = buildScorecard({
      sport: 'mlb',
      slateDate: '2026-04-17',
      picks: [
        pick({ tier: 'tier1', status: 'pending' }),
        pick({ tier: 'tier2', status: 'pending' }),
      ],
    });
    expect(r.note).toBe('Awaiting settlement');
  });

  it('streak extends when most-recent record matches', () => {
    const r = buildScorecard({
      sport: 'mlb',
      slateDate: '2026-04-17',
      picks: [pick({ tier: 'tier1', status: 'won' })],
      recentRecords: [
        { record: { won: 3, lost: 1, push: 0, pending: 0 } },
        { record: { won: 2, lost: 0, push: 0, pending: 0 } },
        { record: { won: 1, lost: 2, push: 0, pending: 0 } }, // breaks at index 2
      ],
    });
    expect(r.streak.type).toBe('won');
    expect(r.streak.count).toBe(3); // current + 2 prior wins
  });
});
