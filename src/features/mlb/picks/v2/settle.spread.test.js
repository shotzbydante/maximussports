/**
 * Spread grading regression tests — proves settle.js correctly grades
 * NBA / MLB spread picks across home/away × favorite/underdog × win/loss/push.
 *
 * Lock-in for the 2026-05-02 grading bug surfaced by:
 *   HOU +4 vs LAL, final LAL 98 / HOU 78. UI showed WIN / "Covered by 24.0".
 *   Correct grade: LOSS, missed cover by 16.
 *
 * The audit traced the WIN display to:
 *   1. annotatePick() in api/nba/picks/scorecard.js wrongly flipped
 *      `line_value` for the away side, distorting the displayed pick label
 *      AND the cover magnitude.
 *   2. Pre-fix pick_results rows that need a regrade.
 *
 * settle.js itself was correct — these tests pin that contract so we never
 * regress, AND so the regrade against current code produces correct rows.
 */

import { describe, it, expect } from 'vitest';
import { settlePick } from './settle.js';

function mkSpread({ side, line, away = 'hou', home = 'lal' }) {
  return {
    market_type: 'runline',
    selection_side: side,
    line_value: line,
    away_team_slug: away,
    home_team_slug: home,
  };
}

function mkFinal(awayScore, homeScore) {
  return {
    teams: { away: { score: awayScore }, home: { score: homeScore } },
    gameState: { isFinal: true },
    status: 'final',
  };
}

describe('settle.js — spread grading: 7 user-named scenarios', () => {
  // Result key: LAL 98, HOU 78 — HOU lost by 20.
  // HOU is the AWAY team (line +4 stored as awayLine).
  it('1. HOU +4 LOSES when HOU loses 98–78', () => {
    const pick = mkSpread({ side: 'away', line: +4 });
    const r = settlePick(pick, mkFinal(78, 98));
    expect(r.status).toBe('lost');
  });

  it('2. HOU +4 WINS if HOU loses by 3 (HOU 100, LAL 103)', () => {
    const pick = mkSpread({ side: 'away', line: +4 });
    const r = settlePick(pick, mkFinal(100, 103));
    expect(r.status).toBe('won');
  });

  it('3. HOU +4 PUSHES if HOU loses by exactly 4 (HOU 100, LAL 104)', () => {
    const pick = mkSpread({ side: 'away', line: +4 });
    const r = settlePick(pick, mkFinal(100, 104));
    expect(r.status).toBe('push');
  });

  it('4. LAL -4 WINS if LAL wins by 20 (LAL 98, HOU 78)', () => {
    const pick = mkSpread({ side: 'home', line: -4 });
    const r = settlePick(pick, mkFinal(78, 98));
    expect(r.status).toBe('won');
  });

  it('5. LAL -4 LOSES if LAL wins by only 3 (LAL 103, HOU 100)', () => {
    const pick = mkSpread({ side: 'home', line: -4 });
    const r = settlePick(pick, mkFinal(100, 103));
    expect(r.status).toBe('lost');
  });

  it('6. away underdog spread — DAL +6.5 winning outright (DAL 110, BOS 105)', () => {
    const pick = mkSpread({ side: 'away', line: +6.5, away: 'dal', home: 'bos' });
    const r = settlePick(pick, mkFinal(110, 105));
    expect(r.status).toBe('won');
  });

  it('7. home favorite spread — BOS -8 covering (BOS 120, DAL 100)', () => {
    const pick = mkSpread({ side: 'home', line: -8, away: 'dal', home: 'bos' });
    const r = settlePick(pick, mkFinal(100, 120));
    expect(r.status).toBe('won');
  });
});

describe('settle.js — spread grading: corner cases', () => {
  it('away favorite covering (HOU -4 wins by 5)', () => {
    const pick = mkSpread({ side: 'away', line: -4 });
    const r = settlePick(pick, mkFinal(105, 100));
    expect(r.status).toBe('won');
  });

  it('home underdog covering by losing close (LAL +6 loses by 3)', () => {
    const pick = mkSpread({ side: 'home', line: +6, away: 'hou', home: 'lal' });
    const r = settlePick(pick, mkFinal(103, 100));
    expect(r.status).toBe('won');
  });

  it('home underdog winning outright (LAL +6 wins)', () => {
    const pick = mkSpread({ side: 'home', line: +6, away: 'hou', home: 'lal' });
    const r = settlePick(pick, mkFinal(95, 102));
    expect(r.status).toBe('won');
  });

  it('home favorite failing to cover (LAL -10 wins by 7)', () => {
    const pick = mkSpread({ side: 'home', line: -10, away: 'hou', home: 'lal' });
    const r = settlePick(pick, mkFinal(95, 102));
    expect(r.status).toBe('lost');
  });

  it('non-final game stays pending', () => {
    const pick = mkSpread({ side: 'away', line: +4 });
    const r = settlePick(pick, { teams: { away: { score: 78 }, home: { score: 98 } }, gameState: { isFinal: false } });
    expect(r.status).toBe('pending');
  });

  it('missing line is voided', () => {
    const pick = mkSpread({ side: 'away', line: null });
    const r = settlePick(pick, mkFinal(78, 98));
    expect(r.status).toBe('void');
  });
});

describe('settle.js — moneyline grading sanity', () => {
  it('home ML wins when home wins', () => {
    const pick = { market_type: 'moneyline', selection_side: 'home', away_team_slug: 'hou', home_team_slug: 'lal' };
    expect(settlePick(pick, mkFinal(78, 98)).status).toBe('won');
  });
  it('away ML loses when home wins', () => {
    const pick = { market_type: 'moneyline', selection_side: 'away', away_team_slug: 'hou', home_team_slug: 'lal' };
    expect(settlePick(pick, mkFinal(78, 98)).status).toBe('lost');
  });
});
