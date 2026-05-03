/**
 * HOU/LAL grading regression — locks the math the user reported as suspect.
 *
 * On 2026-05-04 the user observed:
 *   HOU @ LAL · pick: HOU -4 · final: HOU 98 – LAL 78 · WIN · "Covered by 16.0".
 *
 * The grading is correct — HOU was the road favorite at -4, won by 20,
 * covered by 16. These tests pin both the persisted-shape fixture (the
 * row that shipped) AND the inverse shape (the user's mental model where
 * HOU is +4 and lost by 20) so any future regression points clearly at
 * which fixture broke.
 */

import { describe, it, expect } from 'vitest';
import { settlePick } from '../../src/features/mlb/picks/v2/settle.js';
import { annotatePick } from './annotatePick.js';

function mkFinal(awayScore, homeScore) {
  return {
    teams: { away: { score: awayScore }, home: { score: homeScore } },
    gameState: { isFinal: true },
    status: 'final',
    startTime: '2026-05-03T22:30:00Z',
  };
}

describe('HOU/LAL Game 5 — persisted shape (HOU as away road favorite -4)', () => {
  // The actual persisted row. HOU won by 20 → covered -4 by 16 → WIN.
  const pick = {
    market_type: 'runline',
    selection_side: 'away',
    line_value: -4,
    away_team_slug: 'hou',
    home_team_slug: 'lal',
    slate_date: '2026-05-01',
    start_time: '2026-05-03T22:30:00Z',
  };

  it('settle: HOU -4, HOU 98–78 LAL → WON', () => {
    const r = settlePick(pick, mkFinal(98, 78));
    expect(r.status).toBe('won');
    expect(r.final_away_score).toBe(98);
    expect(r.final_home_score).toBe(78);
  });

  it('annotate: pickLabel="HOU -4", reason="Covered by 16.0 points."', () => {
    const out = annotatePick({
      ...pick,
      pick_results: { status: 'won', final_away_score: 98, final_home_score: 78 },
    });
    expect(out.pickLabel).toBe('HOU -4');
    expect(out.finalScore).toBe('HOU 98 – LAL 78');
    expect(out.status).toBe('won');
    expect(out.resultReason).toBe('Covered by 16.0 points.');
  });
});

describe('HOU/LAL inverse — user-recalled shape (HOU as +4 dog who lost by 20)', () => {
  // Hypothetical: what if HOU had been the underdog +4 and lost by 20?
  // 20 > 4 → did NOT cover → LOSS, lost cover by 16. This proves the
  // engine grades the "user-remembered" scenario correctly too — the
  // displayed WIN is not a sign mismatch.
  const pick = {
    market_type: 'runline',
    selection_side: 'away',
    line_value: +4,
    away_team_slug: 'hou',
    home_team_slug: 'lal',
    slate_date: '2026-05-01',
  };

  it('settle: HOU +4, HOU 78–98 LAL → LOST', () => {
    const r = settlePick(pick, mkFinal(78, 98));
    expect(r.status).toBe('lost');
  });

  it('annotate: pickLabel="HOU +4", reason="Lost cover by 16.0 points."', () => {
    const out = annotatePick({
      ...pick,
      pick_results: { status: 'lost', final_away_score: 78, final_home_score: 98 },
    });
    expect(out.pickLabel).toBe('HOU +4');
    expect(out.finalScore).toBe('HOU 78 – LAL 98');
    expect(out.status).toBe('lost');
    expect(out.resultReason).toBe('Lost cover by 16.0 points.');
  });
});

describe('HOU/LAL Game 5 — both spread sides for the same game', () => {
  // The model published BOTH HOU -4 AND LAL -17 for Game 5.
  // HOU 98, LAL 78. Both should grade independently and consistently.
  it('LAL -17 with LAL losing by 20 → LOST, lost cover by 37.0', () => {
    const pick = {
      market_type: 'runline',
      selection_side: 'home',
      line_value: -17,
      away_team_slug: 'hou',
      home_team_slug: 'lal',
      slate_date: '2026-05-01',
    };
    const settled = settlePick(pick, mkFinal(98, 78));
    expect(settled.status).toBe('lost');
    const annotated = annotatePick({
      ...pick,
      pick_results: { status: settled.status, final_away_score: 98, final_home_score: 78 },
    });
    expect(annotated.pickLabel).toBe('LAL -17');
    expect(annotated.resultReason).toBe('Lost cover by 37.0 points.');
  });
});

describe('Unmatched fallback safety', () => {
  it('a pick that resolves to no final stays pending — never WIN/LOSS', () => {
    const pick = {
      market_type: 'runline', selection_side: 'away', line_value: -4,
      away_team_slug: 'hou', home_team_slug: 'lal',
    };
    // gradePicks-style: no final found
    const annotated = annotatePick({ ...pick, pick_results: null });
    expect(annotated.status).toBe('pending');
    expect(annotated.resultReason).toBeNull();
    expect(annotated.finalScore).toBeNull();
  });
});
