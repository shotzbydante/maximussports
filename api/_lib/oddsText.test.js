/**
 * Tests for the "+" repair on American odds in model-written copy.
 *
 * Regression: once briefings started quoting game totals, "the total at 149.5"
 * was being rewritten to "the total at +149.5". Only prices get a plus sign.
 */

import { describe, it, expect } from 'vitest';
import { fixPositiveOdds } from './oddsText.js';

describe('fixPositiveOdds', () => {
  it('restores the plus on title prices', () => {
    expect(fixPositiveOdds('Duke sits at 750 to win it all.')).toBe('Duke sits at +750 to win it all.');
    expect(fixPositiveOdds('Houston (600) and Florida (600) lead.')).toBe('Houston (+600) and Florida (+600) lead.');
    expect(fixPositiveOdds('The Spurs are priced at 260')).toBe('The Spurs are priced at +260');
    expect(fixPositiveOdds('Denver at 2500, Miami at 3500.')).toBe('Denver at +2500, Miami at +3500.');
  });

  it('leaves prices that already have a sign alone', () => {
    expect(fixPositiveOdds('Duke is at +750 and Kansas at -110.')).toBe('Duke is at +750 and Kansas at -110.');
  });

  it('never puts a plus on a game total', () => {
    expect(fixPositiveOdds('favorites, with the total at 149.5.')).toBe('favorites, with the total at 149.5.');
    expect(fixPositiveOdds('The total sits at 160 for that one.')).toBe('The total sits at 160 for that one.');
    expect(fixPositiveOdds('The over/under is set at 148.')).toBe('The over/under is set at 148.');
    expect(fixPositiveOdds('a total of 141 (141) on the board')).toBe('a total of 141 (141) on the board');
  });

  it('never puts a plus on a score or a point count', () => {
    expect(fixPositiveOdds('They finished at 132-129 in overtime.')).toBe('They finished at 132-129 in overtime.');
    expect(fixPositiveOdds('Illinois topped out at 114 points.')).toBe('Illinois topped out at 114 points.');
    expect(fixPositiveOdds('They scored at will, ending at 106.')).toBe('They scored at will, ending at 106.');
  });

  it('still fixes a price in a sentence after a total was mentioned', () => {
    expect(fixPositiveOdds('The total is 149.5. Duke is at 750 for the title.'))
      .toBe('The total is 149.5. Duke is at +750 for the title.');
  });

  it('passes empty input through', () => {
    expect(fixPositiveOdds('')).toBe('');
    expect(fixPositiveOdds(null)).toBeNull();
  });
});
