/**
 * annotatePick — display layer for the NBA scorecard endpoint.
 *
 * Locks down the 2026-05-02 fix:
 *   - The persisted line_value is the SIDE-SPECIFIC line (no flip needed).
 *   - The pickLabel renders the persisted sign verbatim ("HOU +4", "LAL -4").
 *   - The cover magnitude is computed against the opposing team's score.
 *   - "Covered by N" and "Lost cover by N" report the true margin.
 */

import { describe, it, expect } from 'vitest';
import { annotatePick } from './annotatePick.js';

function mkPick(overrides = {}) {
  return {
    id: 'p1',
    pick_key: 'pk1',
    game_id: 'g1',
    market_type: 'runline',
    selection_side: 'away',
    line_value: +4,
    price_american: null,
    away_team_slug: 'hou',
    home_team_slug: 'lal',
    tier: 'tier2',
    bet_score: 0.7,
    pick_results: { status: 'lost', final_away_score: 78, final_home_score: 98 },
    ...overrides,
  };
}

describe('annotatePick — pickLabel honors persisted side-specific line', () => {
  it('away dog: HOU +4 stored as side="away", line=+4 → "HOU +4"', () => {
    const out = annotatePick(mkPick({ selection_side: 'away', line_value: +4 }));
    expect(out.pickLabel).toBe('HOU +4');
  });

  it('home favorite: LAL -4 stored as side="home", line=-4 → "LAL -4"', () => {
    const out = annotatePick(mkPick({ selection_side: 'home', line_value: -4 }));
    expect(out.pickLabel).toBe('LAL -4');
  });

  it('away favorite: HOU -3.5 stored as side="away", line=-3.5 → "HOU -3.5"', () => {
    const out = annotatePick(mkPick({ selection_side: 'away', line_value: -3.5 }));
    expect(out.pickLabel).toBe('HOU -3.5');
  });

  it('home dog: LAL +6 stored as side="home", line=+6 → "LAL +6"', () => {
    const out = annotatePick(mkPick({ selection_side: 'home', line_value: +6 }));
    expect(out.pickLabel).toBe('LAL +6');
  });
});

describe('annotatePick — cover magnitude (the May 2 bug)', () => {
  it('HOU +4 losing 78–98 (lost by 20) → "Lost cover by 16.0 points."', () => {
    const out = annotatePick(mkPick({
      selection_side: 'away', line_value: +4,
      pick_results: { status: 'lost', final_away_score: 78, final_home_score: 98 },
    }));
    expect(out.resultReason).toBe('Lost cover by 16.0 points.');
  });

  it('LAL -4 winning 98–78 (won by 20) → "Covered by 16.0 points."', () => {
    const out = annotatePick(mkPick({
      selection_side: 'home', line_value: -4,
      pick_results: { status: 'won', final_away_score: 78, final_home_score: 98 },
    }));
    expect(out.resultReason).toBe('Covered by 16.0 points.');
  });

  it('HOU +4 covering by losing close 100–103 → "Covered by 1.0 points."', () => {
    const out = annotatePick(mkPick({
      selection_side: 'away', line_value: +4,
      pick_results: { status: 'won', final_away_score: 100, final_home_score: 103 },
    }));
    expect(out.resultReason).toBe('Covered by 1.0 points.');
  });

  it('HOU +4 pushing on a 4-point loss 100–104 → "Margin landed exactly on the spread."', () => {
    const out = annotatePick(mkPick({
      selection_side: 'away', line_value: +4,
      pick_results: { status: 'push', final_away_score: 100, final_home_score: 104 },
    }));
    expect(out.resultReason).toBe('Margin landed exactly on the spread.');
  });

  it('home favorite failing to cover: LAL -10 wins by 7 → "Lost cover by 3.0 points."', () => {
    const out = annotatePick(mkPick({
      selection_side: 'home', line_value: -10,
      pick_results: { status: 'lost', final_away_score: 95, final_home_score: 102 },
    }));
    expect(out.resultReason).toBe('Lost cover by 3.0 points.');
  });

  it('away favorite covering: HOU -4 wins by 5 → "Covered by 1.0 points."', () => {
    const out = annotatePick(mkPick({
      selection_side: 'away', line_value: -4,
      pick_results: { status: 'won', final_away_score: 105, final_home_score: 100 },
    }));
    expect(out.resultReason).toBe('Covered by 1.0 points.');
  });
});

describe('annotatePick — finalScore + status passthrough', () => {
  it('renders final score with both team slugs upper-cased', () => {
    const out = annotatePick(mkPick({
      pick_results: { status: 'lost', final_away_score: 78, final_home_score: 98 },
    }));
    expect(out.finalScore).toBe('HOU 78 – LAL 98');
    expect(out.status).toBe('lost');
  });

  it('pending pick has no finalScore + no resultReason', () => {
    const out = annotatePick(mkPick({ pick_results: null }));
    expect(out.finalScore).toBeNull();
    expect(out.resultReason).toBeNull();
    expect(out.status).toBe('pending');
  });

  it('handles pick_results returned as an array', () => {
    const out = annotatePick(mkPick({
      pick_results: [{ status: 'lost', final_away_score: 78, final_home_score: 98 }],
    }));
    expect(out.status).toBe('lost');
    expect(out.finalScore).toBe('HOU 78 – LAL 98');
  });
});

describe('annotatePick — moneyline + total still work', () => {
  it('moneyline label includes price', () => {
    const out = annotatePick(mkPick({
      market_type: 'moneyline', selection_side: 'away',
      line_value: null, price_american: -150,
    }));
    expect(out.pickLabel).toBe('HOU ML -150');
  });

  it('total over label', () => {
    const out = annotatePick(mkPick({
      market_type: 'total', selection_side: 'over', line_value: 220.5, price_american: null,
      pick_results: { status: 'won', final_away_score: 110, final_home_score: 115 },
    }));
    expect(out.pickLabel).toBe('OVER 220.5');
    expect(out.resultReason).toMatch(/Total finished 225/);
  });
});
