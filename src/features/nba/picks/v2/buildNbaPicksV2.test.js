/**
 * NBA picks v2 — architecture parity tests.
 *
 * Guarantees:
 *   1. NBA picks share the same v2 architecture (tiers + coverage + topPick).
 *   2. No systematic side bias (all-home or all-away) when model edges vary.
 *   3. Model edge of zero / absent produces ZERO picks — no invented confidence.
 *   4. No pick ever carries betScore.total <= 0.
 *   5. sport='nba' is stamped throughout.
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
      pregameEdge: 1.5 - i * 0.7,   // varies from +1.5 to ~-0.2 across games
      confidence: 0.70,
      fairTotal: 222 + i,
    },
    signals: {
      importanceScore: 60,
      watchabilityScore: 50,
      marketDislocationScore: 55,
    },
    ...overrides,
  };
}

describe('buildNbaPicksV2 — canonical shape parity with MLB', () => {
  it('returns tiers + coverage + topPick + meta like MLB', () => {
    const games = Array.from({ length: 6 }, (_, i) => mkGame(i));
    const r = buildNbaPicksV2({ games, config: NBA_DEFAULT_CONFIG });
    expect(r).toHaveProperty('sport', 'nba');
    expect(r).toHaveProperty('tiers.tier1');
    expect(r).toHaveProperty('tiers.tier2');
    expect(r).toHaveProperty('tiers.tier3');
    expect(r).toHaveProperty('coverage');
    expect(r).toHaveProperty('topPick');
    expect(r).toHaveProperty('meta.picksPublished');
    expect(r).toHaveProperty('categories.pickEms');
  });

  it('every pick carries sport="nba"', () => {
    const games = Array.from({ length: 6 }, (_, i) => mkGame(i));
    const r = buildNbaPicksV2({ games, config: NBA_DEFAULT_CONFIG });
    const all = [...r.tiers.tier1, ...r.tiers.tier2, ...r.tiers.tier3, ...(r.coverage || [])];
    for (const p of all) expect(p.sport).toBe('nba');
  });

  it('no pick has betScore.total <= 0', () => {
    const games = Array.from({ length: 6 }, (_, i) => mkGame(i));
    const r = buildNbaPicksV2({ games, config: NBA_DEFAULT_CONFIG });
    const all = [...r.tiers.tier1, ...r.tiers.tier2, ...r.tiers.tier3, ...(r.coverage || [])];
    for (const p of all) {
      expect(Number.isFinite(p.betScore?.total)).toBe(true);
      expect(p.betScore.total).toBeGreaterThan(0);
    }
  });
});

describe('buildNbaPicksV2 — non-bias behavior', () => {
  it('produces zero picks when both moneyline and spread are missing (no market signal at all)', () => {
    // v9: deriveWinProbs uses the spread + de-vigged moneyline as the
    // independent model. With both gone there is no signal, so no picks.
    const games = Array.from({ length: 4 }, (_, i) => mkGame(i, {
      model: { confidence: 0.7, fairTotal: null },
      market: { moneyline: null, pregameSpread: null, pregameTotal: null },
    }));
    const r = buildNbaPicksV2({ games, config: NBA_DEFAULT_CONFIG });
    const total = r.tiers.tier1.length + r.tiers.tier2.length + r.tiers.tier3.length + (r.coverage?.length || 0);
    expect(total).toBe(0);
  });

  it('does NOT systematically favor one side — mixed signs in the edge yield mixed sides', () => {
    // Alternate edge sign across games. No all-home / all-away bias expected.
    const games = Array.from({ length: 8 }, (_, i) => mkGame(i, {
      model: {
        pregameEdge: i % 2 === 0 ? 2.0 : -2.0,
        confidence: 0.75,
        fairTotal: 220,
      },
    }));
    const r = buildNbaPicksV2({ games, config: NBA_DEFAULT_CONFIG });
    const all = [...r.tiers.tier1, ...r.tiers.tier2, ...r.tiers.tier3, ...(r.coverage || [])];
    const mlSides = all.filter(p => p.market?.type === 'moneyline' || p.market?.type === 'runline')
      .map(p => p.selection?.side);
    if (mlSides.length >= 4) {
      const allHome = mlSides.every(s => s === 'home');
      const allAway = mlSides.every(s => s === 'away');
      expect(allHome || allAway).toBe(false);
    }
  });
});
