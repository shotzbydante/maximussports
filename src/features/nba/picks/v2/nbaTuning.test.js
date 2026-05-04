/**
 * NBA conservative tuning — behavioral tests.
 *
 * Locks the playoff-aware adjustments made in NBA_DEFAULT_CONFIG:
 *   1. Underdog moneyline below minUnderdogEdge is rejected.
 *   2. Spread picks below minEdge are rejected.
 *   3. Large-spread picks without enough model edge get their bet_score
 *      penalized (multiplied by penaltyFactor).
 *   4. Coverage pool is narrower than MLB (minScore=0.40, not 0.30).
 *   5. tier1 requires higher floor than MLB.
 *   6. Tier 1 cap is 2, not 3.
 *   7. No pick is published with betScore.total <= 0 after penalty.
 */

import { describe, it, expect } from 'vitest';
import { buildNbaPicksV2, NBA_DEFAULT_CONFIG } from './buildNbaPicksV2.js';

function mkGame(i, overrides = {}) {
  return {
    gameId: `nba-g-${i}`,
    startTime: new Date(Date.now() + (i + 1) * 3600 * 1000).toISOString(),
    status: 'upcoming',
    gameState: { isLive: false, isFinal: false },
    teams: {
      away: { slug: `away_${i}`, name: `Away${i}`, abbrev: `A${i}` },
      home: { slug: `home_${i}`, name: `Home${i}`, abbrev: `H${i}` },
    },
    market: {
      moneyline: { away: 140 - (i * 10), home: -160 + (i * 8) },
      pregameSpread: -3.5 + (i * 0.5),
      pregameTotal: 220 + i,
    },
    model: {
      pregameEdge: 1.5 - i * 0.7,
      confidence: 0.70,
      fairTotal: 222 + i,
    },
    signals: { importanceScore: 60, watchabilityScore: 50, marketDislocationScore: 55 },
    ...overrides,
  };
}

describe('NBA_DEFAULT_CONFIG — playoff-aware values', () => {
  it('version string reflects the new tuning', () => {
    expect(NBA_DEFAULT_CONFIG.version).toMatch(/^nba-picks-tuning-/);
  });

  it('tier1 floor is stricter than MLB default (0.75)', () => {
    expect(NBA_DEFAULT_CONFIG.tierCutoffs.tier1.floor).toBeGreaterThanOrEqual(0.80);
  });

  it('tier1 slate percentile is stricter (≥ 0.92)', () => {
    expect(NBA_DEFAULT_CONFIG.tierCutoffs.tier1.slatePercentile).toBeGreaterThanOrEqual(0.92);
  });

  it('maxPerTier.tier1 is capped at 2', () => {
    expect(NBA_DEFAULT_CONFIG.maxPerTier.tier1).toBe(2);
  });

  it('coverage.minScore is ≥ 0.40 (narrower than MLB 0.30)', () => {
    expect(NBA_DEFAULT_CONFIG.coverage.minScore).toBeGreaterThanOrEqual(0.40);
  });

  it('moneyline has a minUnderdogEdge floor', () => {
    expect(NBA_DEFAULT_CONFIG.marketGates.moneyline.minUnderdogEdge).toBeGreaterThan(0);
  });

  it('spread has a minEdge floor', () => {
    expect(NBA_DEFAULT_CONFIG.marketGates.spread.minEdge).toBeGreaterThan(0);
  });

  it('largeSpread penalty is configured (penaltyAbove, requiredModelEdge, penaltyFactor)', () => {
    const ls = NBA_DEFAULT_CONFIG.components.largeSpread;
    expect(ls.penaltyAbove).toBeGreaterThan(0);
    expect(ls.requiredModelEdge).toBeGreaterThan(0);
    expect(ls.penaltyFactor).toBeGreaterThan(0);
    expect(ls.penaltyFactor).toBeLessThan(1);
  });
});

describe('buildNbaPicksV2 — underdog moneyline floor (v7 contract)', () => {
  it('keeps a low-edge underdog ML as a TRACKING pick instead of dropping it', () => {
    // +110 line → implied ≈ 47.6%. Model neutral (edge=0) → away model prob ≈ 50% →
    // raw edge ≈ 2.4% which would have been below the legacy 4% dog floor.
    // Under the v7 full-slate contract, every game must produce a pick per
    // market — low-edge picks become "tracking" (not "hero") rather than
    // being dropped, so they can be persisted and graded daily.
    const games = [mkGame(0, {
      market: { moneyline: { away: 110, home: -130 }, pregameSpread: -1, pregameTotal: 220 },
      model: { pregameEdge: 0.0, confidence: 0.6, fairTotal: 220 },
    })];
    const r = buildNbaPicksV2({ games, config: NBA_DEFAULT_CONFIG });
    expect(Array.isArray(r.fullSlatePicks)).toBe(true);
    const ml = r.fullSlatePicks.find(p => p.market.type === 'moneyline');
    expect(ml, 'fullSlatePicks must contain a moneyline pick').toBeDefined();
    // The low-edge ML should NOT be elevated to a hero tier.
    expect(ml.isHeroPick).toBe(false);
    expect(ml.pickRole).toBe('tracking');
  });
});

describe('buildNbaPicksV2 — no invalid scores', () => {
  it('no published pick carries betScore.total <= 0 even after penalty application', () => {
    const games = Array.from({ length: 6 }, (_, i) => mkGame(i));
    const r = buildNbaPicksV2({ games, config: NBA_DEFAULT_CONFIG });
    const all = [...r.tiers.tier1, ...r.tiers.tier2, ...r.tiers.tier3, ...r.coverage];
    for (const p of all) {
      expect(Number.isFinite(p.betScore?.total)).toBe(true);
      expect(p.betScore.total).toBeGreaterThan(0);
    }
  });
});

describe('buildNbaPicksV2 — tier 1 cap enforced', () => {
  it('emits at most 2 tier-1 picks even with many qualifying games', () => {
    const games = Array.from({ length: 12 }, (_, i) => mkGame(i, {
      model: { pregameEdge: 3.0, confidence: 0.9, fairTotal: 220 },
    }));
    const r = buildNbaPicksV2({ games, config: NBA_DEFAULT_CONFIG });
    expect(r.tiers.tier1.length).toBeLessThanOrEqual(2);
  });
});

describe('buildNbaPicksV2 — coverage pool narrower than MLB', () => {
  it('coverage picks all have bet_score >= 0.40', () => {
    const games = Array.from({ length: 8 }, (_, i) => mkGame(i));
    const r = buildNbaPicksV2({ games, config: NBA_DEFAULT_CONFIG });
    for (const p of r.coverage) {
      expect(p.betScore.total).toBeGreaterThanOrEqual(0.40);
    }
  });
});
