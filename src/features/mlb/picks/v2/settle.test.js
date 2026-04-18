import { describe, it, expect } from 'vitest';
import { settlePick, gradePicks } from './settle.js';

function finalGame(awayScore, homeScore, overrides = {}) {
  return {
    gameId: 'g1',
    gameState: { isFinal: true, isLive: false },
    status: 'final',
    teams: {
      away: { slug: 'nyy', score: awayScore },
      home: { slug: 'bos', score: homeScore },
    },
    ...overrides,
  };
}

describe('settlePick', () => {
  describe('moneyline', () => {
    it('away wins', () => {
      const r = settlePick({ market_type: 'moneyline', selection_side: 'away', line_value: null }, finalGame(5, 3));
      expect(r.status).toBe('won');
    });
    it('home wins', () => {
      const r = settlePick({ market_type: 'moneyline', selection_side: 'home', line_value: null }, finalGame(2, 7));
      expect(r.status).toBe('won');
    });
    it('wrong side loses', () => {
      const r = settlePick({ market_type: 'moneyline', selection_side: 'away', line_value: null }, finalGame(2, 7));
      expect(r.status).toBe('lost');
    });
  });

  describe('runline', () => {
    it('away -1.5 covers', () => {
      const r = settlePick({ market_type: 'runline', selection_side: 'away', line_value: -1.5 }, finalGame(6, 3));
      expect(r.status).toBe('won');
    });
    it('away -1.5 fails to cover (by 1)', () => {
      const r = settlePick({ market_type: 'runline', selection_side: 'away', line_value: -1.5 }, finalGame(4, 3));
      expect(r.status).toBe('lost');
    });
    it('home +1.5 covers when losing by 1', () => {
      const r = settlePick({ market_type: 'runline', selection_side: 'home', line_value: 1.5 }, finalGame(4, 3));
      expect(r.status).toBe('won');
    });
    it('exact push on +1.5 (no such push in runline 1.5) — integer push edge', () => {
      // line=1, home wins by 1 exact margin → push
      const r = settlePick({ market_type: 'runline', selection_side: 'away', line_value: 1 }, finalGame(3, 4));
      expect(r.status).toBe('push');
    });
  });

  describe('total', () => {
    it('over wins', () => {
      const r = settlePick({ market_type: 'total', selection_side: 'over', line_value: 8.5 }, finalGame(5, 4));
      expect(r.status).toBe('won');
    });
    it('under wins', () => {
      const r = settlePick({ market_type: 'total', selection_side: 'under', line_value: 8.5 }, finalGame(3, 4));
      expect(r.status).toBe('won');
    });
    it('push on exact line', () => {
      const r = settlePick({ market_type: 'total', selection_side: 'over', line_value: 9 }, finalGame(5, 4));
      expect(r.status).toBe('push');
    });
  });

  it('pending for non-final games', () => {
    const g = { gameState: { isFinal: false, isLive: true }, status: 'in_progress', teams: { away: { score: 2 }, home: { score: 1 } } };
    const r = settlePick({ market_type: 'moneyline', selection_side: 'away' }, g);
    expect(r.status).toBe('pending');
  });

  it('pending for missing scores', () => {
    const g = finalGame(NaN, 4);
    const r = settlePick({ market_type: 'total', selection_side: 'over', line_value: 8.5 }, g);
    expect(r.status).toBe('pending');
  });
});

describe('gradePicks', () => {
  it('grades multiple picks, skips already-graded', () => {
    const picks = [
      { id: 'p1', market_type: 'moneyline', selection_side: 'away', game_id: 'g1' },
      { id: 'p2', market_type: 'total', selection_side: 'over', line_value: 7, game_id: 'g1' },
      { id: 'p3', market_type: 'runline', selection_side: 'home', line_value: 1.5, game_id: 'g2' }, // no final → pending
    ];
    const finals = new Map([['g1', finalGame(5, 3)]]);
    const out = gradePicks(picks, finals, new Set(['p1']));
    const p2 = out.find(r => r.pick_id === 'p2');
    const p3 = out.find(r => r.pick_id === 'p3');
    expect(out.find(r => r.pick_id === 'p1')).toBeUndefined();     // skipped
    expect(p2.status).toBe('won');                                   // 5+3=8 > 7
    expect(p3.status).toBe('pending');                               // no final
  });
});
