/**
 * Unit tests for v2 MLB picks engine.
 */

import { describe, it, expect } from 'vitest';
import { buildMlbPicksV2 } from './buildMlbPicksV2.js';
import { MLB_DEFAULT_CONFIG } from '../../../picks/tuning/defaultConfig.js';

function mkGame(overrides = {}) {
  return {
    gameId: 'gid-1',
    startTime: new Date(Date.now() + 4 * 3600 * 1000).toISOString(),
    status: 'upcoming',
    gameState: { isLive: false, isFinal: false },
    teams: {
      away: { slug: 'nyy', name: 'New York Yankees', abbrev: 'NYY' },
      home: { slug: 'bos', name: 'Boston Red Sox',  abbrev: 'BOS' },
    },
    market: {
      moneyline: -135,
      pregameSpread: -1.5,
      pregameTotal: 8.5,
    },
    model: { pregameEdge: null, confidence: 0.75 },
    ...overrides,
  };
}

describe('buildMlbPicksV2', () => {
  it('returns the v2 canonical shape', () => {
    const r = buildMlbPicksV2({ games: [mkGame()], config: MLB_DEFAULT_CONFIG });
    expect(r).toHaveProperty('sport', 'mlb');
    expect(r).toHaveProperty('modelVersion');
    expect(r).toHaveProperty('configVersion', MLB_DEFAULT_CONFIG.version);
    expect(r).toHaveProperty('tiers.tier1');
    expect(r).toHaveProperty('tiers.tier2');
    expect(r).toHaveProperty('tiers.tier3');
    expect(r).toHaveProperty('legacy.categories.pickEms');
    expect(r).toHaveProperty('categories.pickEms'); // top-level back-compat
    expect(r).toHaveProperty('meta.qualifiedGames');
  });

  it('handles an empty slate', () => {
    const r = buildMlbPicksV2({ games: [], config: MLB_DEFAULT_CONFIG });
    expect(r.tiers.tier1).toEqual([]);
    expect(r.tiers.tier2).toEqual([]);
    expect(r.tiers.tier3).toEqual([]);
    expect(r.topPick).toBeNull();
    expect(r.meta.qualifiedGames).toBe(0);
    expect(r.meta.flags).toContain('low_slate');
  });

  it('skips live/final games', () => {
    const live  = mkGame({ gameId: 'live-1',  gameState: { isLive: true, isFinal: false }, status: 'live' });
    const final = mkGame({ gameId: 'final-1', gameState: { isLive: false, isFinal: true }, status: 'final' });
    const r = buildMlbPicksV2({ games: [live, final], config: MLB_DEFAULT_CONFIG });
    expect(r.meta.qualifiedGames).toBe(0);
    expect(r.meta.picksPublished).toBe(0);
  });

  it('topPick is the highest bet-score pick when any exist', () => {
    const games = [
      mkGame({ gameId: 'a', teams: { away: { slug: 'nyy', name: 'Yankees', abbrev: 'NYY' }, home: { slug: 'bos', name: 'Red Sox', abbrev: 'BOS' } } }),
      mkGame({ gameId: 'b', teams: { away: { slug: 'lad', name: 'Dodgers', abbrev: 'LAD' }, home: { slug: 'sd', name: 'Padres', abbrev: 'SD' } } }),
    ];
    const r = buildMlbPicksV2({ games, config: MLB_DEFAULT_CONFIG });
    if (r.topPick) {
      const allScores = [...r.tiers.tier1, ...r.tiers.tier2, ...r.tiers.tier3].map(p => p.betScore.total);
      const max = Math.max(...allScores, 0);
      expect(r.topPick.betScore.total).toBe(max);
    } else {
      expect(r.meta.picksPublished).toBe(0);
    }
  });

  it('bet scores are bounded [0,1]', () => {
    const r = buildMlbPicksV2({ games: [mkGame()], config: MLB_DEFAULT_CONFIG });
    for (const p of [...r.tiers.tier1, ...r.tiers.tier2, ...r.tiers.tier3]) {
      expect(p.betScore.total).toBeGreaterThanOrEqual(0);
      expect(p.betScore.total).toBeLessThanOrEqual(1);
    }
  });

  it('enforces maxTier1PerGame', () => {
    const games = Array.from({ length: 3 }, (_, i) => mkGame({ gameId: `g${i}` }));
    const r = buildMlbPicksV2({ games, config: MLB_DEFAULT_CONFIG });
    const gameCountsTier1 = new Map();
    for (const p of r.tiers.tier1) {
      gameCountsTier1.set(p.gameId, (gameCountsTier1.get(p.gameId) || 0) + 1);
    }
    for (const count of gameCountsTier1.values()) {
      expect(count).toBeLessThanOrEqual(MLB_DEFAULT_CONFIG.maxTier1PerGame);
    }
  });

  it('canonical snapshot (shape-only, not values)', () => {
    const r = buildMlbPicksV2({ games: [mkGame()], config: MLB_DEFAULT_CONFIG });
    // Shape contract — critical keys consumers rely on
    const keys = Object.keys(r).sort();
    expect(keys).toEqual(
      expect.arrayContaining([
        'categories', 'configVersion', 'date', 'generatedAt', 'legacy',
        'meta', 'modelVersion', 'scorecardSummary', 'sport', 'tiers', 'topPick',
      ])
    );
  });
});
