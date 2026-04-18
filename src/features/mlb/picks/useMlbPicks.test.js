/**
 * Tests for the canonical picks hook — the shared source of truth between
 * /mlb/insights and MLB Home.
 *
 * We only test the pure helper (withTopPickCrossReference) here because
 * useMlbPicks itself is a thin fetch wrapper; its contract is the shape
 * of the returned object, which is tested via integration in the
 * component-level tests (index.test.jsx).
 */

import { describe, it, expect } from 'vitest';
import { withTopPickCrossReference } from './useMlbPicks.js';

describe('withTopPickCrossReference', () => {
  it('returns the array unchanged when no topPick', () => {
    const picks = [{ id: 'a', gameId: 'g1' }];
    expect(withTopPickCrossReference(picks, null)).toEqual(picks);
  });

  it('flags the Top Play itself with _isTopPick', () => {
    const top = { id: 'g1-moneyline-away', gameId: 'g1' };
    const out = withTopPickCrossReference([top, { id: 'g2-moneyline-home', gameId: 'g2' }], top);
    expect(out[0]._isTopPick).toBe(true);
    expect(out[1]._isTopPick).toBe(false);
  });

  it('flags picks that share the top matchup but are different selections', () => {
    const top = { id: 'g1-moneyline-away', gameId: 'g1' };
    const sibling = { id: 'g1-total-over', gameId: 'g1' };
    const unrelated = { id: 'g2-moneyline-home', gameId: 'g2' };
    const out = withTopPickCrossReference([top, sibling, unrelated], top);
    expect(out[1]._sharesTopMatchup).toBe(true);
    expect(out[1]._isTopPick).toBe(false);
    expect(out[2]._sharesTopMatchup).toBe(false);
  });

  it('does not mutate the input array', () => {
    const picks = [{ id: 'x', gameId: 'g' }];
    const top = { id: 'x', gameId: 'g' };
    const out = withTopPickCrossReference(picks, top);
    expect(picks[0]._isTopPick).toBeUndefined();
    expect(out[0]._isTopPick).toBe(true);
  });
});
