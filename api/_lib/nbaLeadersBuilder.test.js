/**
 * Locks the data-correctness contract for Slide 2 (Postseason Leaders):
 *   - hasAnyValidLeaderCategory: any single category populated → ship
 *   - hasAnyValidLeaderCategory: empty payload → reject
 *
 * The full buildPostseasonLeadersData() integration test would require
 * mocking ESPN endpoints + KV reads; the helper test here covers the
 * audit-spec'd partial-render contract that prevents Slide 2 from
 * blanking out when 3-of-5 categories populate.
 */

import { describe, it, expect } from 'vitest';
import { hasAnyValidLeaderCategory } from './nbaLeadersBuilder.js';

describe('hasAnyValidLeaderCategory', () => {
  it('returns true when at least one category has leaders', () => {
    const payload = {
      categories: {
        pts: { leaders: [{ name: 'A', value: 100 }] },
        ast: { leaders: [] },
        reb: { leaders: [] },
        stl: { leaders: [] },
        blk: { leaders: [] },
      },
    };
    expect(hasAnyValidLeaderCategory(payload)).toBe(true);
  });

  it('returns true when 3 of 5 categories populate', () => {
    const payload = {
      categories: {
        pts: { leaders: [{ name: 'A' }, { name: 'B' }, { name: 'C' }] },
        ast: { leaders: [{ name: 'D' }] },
        reb: { leaders: [{ name: 'E' }] },
        stl: { leaders: [] },
        blk: { leaders: [] },
      },
    };
    expect(hasAnyValidLeaderCategory(payload)).toBe(true);
  });

  it('returns false when all categories are empty', () => {
    const payload = {
      categories: {
        pts: { leaders: [] },
        ast: { leaders: [] },
        reb: { leaders: [] },
        stl: { leaders: [] },
        blk: { leaders: [] },
      },
    };
    expect(hasAnyValidLeaderCategory(payload)).toBe(false);
  });

  it('returns false when categories is missing entirely', () => {
    expect(hasAnyValidLeaderCategory({})).toBe(false);
    expect(hasAnyValidLeaderCategory(null)).toBe(false);
    expect(hasAnyValidLeaderCategory(undefined)).toBe(false);
  });

  it('returns false when categories has no leaders arrays', () => {
    const payload = { categories: { pts: {}, ast: {} } };
    expect(hasAnyValidLeaderCategory(payload)).toBe(false);
  });
});
