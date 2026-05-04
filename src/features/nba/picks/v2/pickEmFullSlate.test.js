/**
 * v8 Pick 'Em full-slate fix — every game produces a Moneyline pick,
 * even when:
 *   • `market.moneyline` is missing entirely (delayed odds)
 *   • `market.moneyline` is a SINGLE NUMBER (legacy production shape
 *     before the v8 odds-shape fix)
 *   • only the home or only the away ML is present
 *
 * Pre-v8 root cause: the builder gated ML on `(isNum(implAway) ||
 * isNum(implHome))`. With the legacy single-number shape, both implied
 * probabilities were null → every game silently lost its Pick 'Em
 * pick. v8 adds a spread-derived implied fallback so ML always fires.
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
      moneyline: { away: 130 - i * 5, home: -150 + i * 5 },
      pregameSpread: -3.5 + i * 0.5,
      pregameTotal: 220 + i,
    },
    model: { pregameEdge: 1.5 - i * 0.4, confidence: 0.75, fairTotal: 222 + i },
    signals: { importanceScore: 60, watchabilityScore: 50, marketDislocationScore: 55 },
    ...overrides,
  };
}

describe('v8: Moneyline always publishes — odds shape coverage', () => {
  it('produces ML for every game when odds are properly structured', () => {
    const games = Array.from({ length: 3 }, (_, i) => mkGame(i));
    const r = buildNbaPicksV2({ games, config: NBA_DEFAULT_CONFIG });
    for (const g of r.byGame) {
      expect(g.picks.moneyline, `game ${g.gameId} missing ML`).toBeTruthy();
    }
  });

  it('produces ML even when market.moneyline is missing entirely', () => {
    const games = Array.from({ length: 2 }, (_, i) => mkGame(i, {
      market: {
        moneyline: undefined,                 // delayed odds
        pregameSpread: -4 + i,                // spread still present
        pregameTotal: 220,
      },
    }));
    const r = buildNbaPicksV2({ games, config: NBA_DEFAULT_CONFIG });
    for (const g of r.byGame) {
      expect(g.picks.moneyline, `game ${g.gameId} missing ML`).toBeTruthy();
      // Implied came from the spread-derived fallback.
      expect(g.picks.moneyline.impliedSource).toBe('spread');
    }
  });

  it('produces ML when market.moneyline is a single number (legacy production shape)', () => {
    // Pre-v8 production: enricher wrote `moneyline: -150` directly.
    // toMatchup reads `.away` / `.home` off the number → both null.
    // v8 must still produce an ML pick via the spread fallback.
    const games = [mkGame(0, {
      market: {
        moneyline: -150,                      // legacy single-number form
        pregameSpread: -3.5,
        pregameTotal: 220,
      },
    })];
    const r = buildNbaPicksV2({ games, config: NBA_DEFAULT_CONFIG });
    expect(r.byGame[0].picks.moneyline).toBeTruthy();
    expect(r.byGame[0].picks.moneyline.impliedSource).toBe('spread');
  });

  it('produces ML when only the home ML is present (away missing)', () => {
    const games = [mkGame(0, {
      market: {
        moneyline: { away: null, home: -150 },
        pregameSpread: -3.5,
        pregameTotal: 220,
      },
    })];
    const r = buildNbaPicksV2({ games, config: NBA_DEFAULT_CONFIG });
    expect(r.byGame[0].picks.moneyline).toBeTruthy();
  });

  it('every fullSlate ML pick carries the canonical metadata', () => {
    const games = Array.from({ length: 2 }, (_, i) => mkGame(i));
    const r = buildNbaPicksV2({ games, config: NBA_DEFAULT_CONFIG });
    const mlPicks = r.fullSlatePicks.filter(p => p.market?.type === 'moneyline');
    expect(mlPicks.length).toBe(2);
    for (const p of mlPicks) {
      expect(p.selection?.side).toMatch(/^(away|home)$/);
      expect(p.conviction?.label).toBeTruthy();
      expect(p.conviction?.score).toBeTypeOf('number');
      expect(p.betScore?.total).toBeTypeOf('number');
      expect(p.tier).toBeTruthy();
      expect(p.rationale?.pickRole).toMatch(/^(hero|tracking)$/);
      expect(p.rawEdge).not.toBeUndefined();
      expect(p.modelProb).not.toBeUndefined();
      expect(p.impliedProb).not.toBeUndefined();
    }
  });
});

describe('v8: byGame contract — every game has all 3 markets', () => {
  it('a 2-game slate produces 6 fullSlate picks (2 × ML/ATS/Total)', () => {
    const games = Array.from({ length: 2 }, (_, i) => mkGame(i));
    const r = buildNbaPicksV2({ games, config: NBA_DEFAULT_CONFIG });
    expect(r.fullSlatePicks).toHaveLength(6);
    expect(r.byGame).toHaveLength(2);
    for (const g of r.byGame) {
      expect(g.picks.moneyline).toBeTruthy();
      expect(g.picks.runline).toBeTruthy();
      expect(g.picks.total).toBeTruthy();
    }
  });
});
