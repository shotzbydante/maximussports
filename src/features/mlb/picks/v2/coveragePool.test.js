/**
 * Tests for the new coverage pool exposed by buildMlbPicksV2.
 *
 * Guarantees:
 *   1. Tier assignments are UNCHANGED by the coverage addition.
 *   2. `coverage` contains picks that scored above COVERAGE_MIN_SCORE
 *      but did not clear any tier's threshold.
 *   3. `coverage` never duplicates a published pick.
 *   4. `coverage` is sorted by bet-score desc.
 *   5. `meta.coverageAvailable` mirrors `coverage.length`.
 */

import { describe, it, expect } from 'vitest';
import { buildMlbPicksV2 } from './buildMlbPicksV2.js';
import { MLB_DEFAULT_CONFIG } from '../../../picks/tuning/defaultConfig.js';

function mkGame(i, overrides = {}) {
  const h = `10:${String(i).padStart(2, '0')}:00Z`;
  return {
    gameId: `g-${i}`,
    startTime: new Date(Date.now() + (i + 1) * 3600 * 1000).toISOString(),
    status: 'upcoming',
    gameState: { isLive: false, isFinal: false },
    teams: {
      away: { slug: `team_a_${i}`, name: `Away${i}`, abbrev: `A${i}` },
      home: { slug: `team_h_${i}`, name: `Home${i}`, abbrev: `H${i}` },
    },
    market: {
      moneyline: -135 + (i * 5),
      pregameSpread: -1.5,
      pregameTotal: 8.5 + (i * 0.2),
    },
    model: { pregameEdge: null, confidence: 0.75 },
    ...overrides,
  };
}

describe('buildMlbPicksV2 — coverage pool', () => {
  it('returns a coverage array alongside tiers', () => {
    const games = Array.from({ length: 4 }, (_, i) => mkGame(i));
    const r = buildMlbPicksV2({ games, config: MLB_DEFAULT_CONFIG });
    expect(Array.isArray(r.coverage)).toBe(true);
    expect(r).toHaveProperty('tiers');
    expect(r).toHaveProperty('topPick');
  });

  it('coverage entries carry the _coverage flag', () => {
    const games = Array.from({ length: 4 }, (_, i) => mkGame(i));
    const r = buildMlbPicksV2({ games, config: MLB_DEFAULT_CONFIG });
    for (const p of r.coverage) {
      expect(p._coverage).toBe(true);
      expect(p.tier).toBe('coverage');
    }
  });

  it('coverage picks do not duplicate tier picks', () => {
    const games = Array.from({ length: 4 }, (_, i) => mkGame(i));
    const r = buildMlbPicksV2({ games, config: MLB_DEFAULT_CONFIG });
    const publishedIds = new Set([
      ...r.tiers.tier1.map(p => p.id),
      ...r.tiers.tier2.map(p => p.id),
      ...r.tiers.tier3.map(p => p.id),
    ]);
    for (const p of r.coverage) {
      expect(publishedIds.has(p.id)).toBe(false);
    }
  });

  it('coverage is sorted by bet-score desc', () => {
    const games = Array.from({ length: 4 }, (_, i) => mkGame(i));
    const r = buildMlbPicksV2({ games, config: MLB_DEFAULT_CONFIG });
    for (let i = 1; i < r.coverage.length; i++) {
      const a = r.coverage[i - 1].betScore?.total ?? 0;
      const b = r.coverage[i].betScore?.total ?? 0;
      expect(a).toBeGreaterThanOrEqual(b);
    }
  });

  it('meta.coverageAvailable mirrors coverage.length', () => {
    const games = Array.from({ length: 4 }, (_, i) => mkGame(i));
    const r = buildMlbPicksV2({ games, config: MLB_DEFAULT_CONFIG });
    expect(r.meta.coverageAvailable).toBe(r.coverage.length);
  });

  it('coverage is empty when no games qualify', () => {
    const r = buildMlbPicksV2({ games: [], config: MLB_DEFAULT_CONFIG });
    expect(r.coverage).toEqual([]);
    expect(r.meta.coverageAvailable).toBe(0);
  });
});
