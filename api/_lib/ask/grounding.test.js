import { describe, it, expect } from 'vitest';
import { numbersIn, ungroundedNumbers } from './grounding.js';

describe('ungroundedNumbers', () => {
  const tool = JSON.stringify({ pick: 'LV +3.5', price: '-110', expected_value: '+3.5%', conviction: '78 of 100', record: '13-9' });

  it('passes numbers that a tool returned, whatever the sign or percent', () => {
    expect(ungroundedNumbers('LV +3.5 at -110, worth 3.5% and a 78. Season is 13-9.', [tool])).toEqual([]);
  });

  it('flags a number that is in no source', () => {
    expect(ungroundedNumbers('LV +4.5 at -110 wins 57% of the time.', [tool])).toEqual(['4.5', '57']);
  });

  it('always allows small counts and the helpline', () => {
    expect(ungroundedNumbers('3 picks, 2 passes. 21+. Call 1-800-GAMBLER.', [])).toEqual([]);
  });

  it('accepts a number the user or an earlier message already said', () => {
    expect(ungroundedNumbers('You said 250.', ['I have 250 to play with'])).toEqual([]);
  });

  it('normalizes how a number is written', () => {
    expect(numbersIn('44.50 and 044')).toEqual(['44.5', '44']);
    expect(ungroundedNumbers('The total is 44.50.', ['total 44.5'])).toEqual([]);
  });
});
