/**
 * Full-slate contract (v7) — pins the new behavior:
 *
 *   1. EVERY playoff game in the input produces exactly one ML, one ATS,
 *      and one Total pick (when market data exists).
 *   2. Low-edge picks are NOT dropped; they're flagged as `pickRole:
 *      'tracking'` and tier 'tracking'.
 *   3. Hero picks are a subset of fullSlatePicks (those that meet the
 *      hero score floor).
 *   4. byGame[].picks.{moneyline,runline,total} all populated for every
 *      game with the required market data.
 *   5. Builder return shape includes fullSlatePicks + heroPicks +
 *      trackingPicks + byGame + meta counts.
 *   6. Persistence-ready: every fullSlatePick carries `tier`,
 *      `market.type`, `selection.side`, and `rationale.pickRole`.
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
    model: {
      pregameEdge: 1.5 - i * 0.4,
      confidence: 0.75,
      fairTotal: 222 + i,                   // ensures totals can fire
    },
    signals: { importanceScore: 60, watchabilityScore: 50, marketDislocationScore: 55 },
    ...overrides,
  };
}

describe('v7 full-slate contract — every game produces ML + ATS + Total', () => {
  it('returns fullSlatePicks, heroPicks, trackingPicks, byGame on the payload', () => {
    const games = Array.from({ length: 3 }, (_, i) => mkGame(i));
    const r = buildNbaPicksV2({ games, config: NBA_DEFAULT_CONFIG });
    expect(r).toHaveProperty('fullSlatePicks');
    expect(r).toHaveProperty('heroPicks');
    expect(r).toHaveProperty('trackingPicks');
    expect(r).toHaveProperty('byGame');
    expect(Array.isArray(r.fullSlatePicks)).toBe(true);
    expect(Array.isArray(r.heroPicks)).toBe(true);
    expect(Array.isArray(r.trackingPicks)).toBe(true);
    expect(Array.isArray(r.byGame)).toBe(true);
  });

  it('every game produces exactly one ML + one ATS + one Total pick', () => {
    const games = Array.from({ length: 3 }, (_, i) => mkGame(i));
    const r = buildNbaPicksV2({ games, config: NBA_DEFAULT_CONFIG });
    expect(r.byGame).toHaveLength(3);
    for (const g of r.byGame) {
      expect(g.picks.moneyline, `${g.gameId} ML`).toBeTruthy();
      expect(g.picks.runline,   `${g.gameId} ATS`).toBeTruthy();
      expect(g.picks.total,     `${g.gameId} Total`).toBeTruthy();
    }
  });

  it('fullSlatePicks length = games × 3 when all market data exists', () => {
    const games = Array.from({ length: 3 }, (_, i) => mkGame(i));
    const r = buildNbaPicksV2({ games, config: NBA_DEFAULT_CONFIG });
    expect(r.fullSlatePicks).toHaveLength(9);
  });

  it('heroPicks is a subset of fullSlatePicks', () => {
    const games = Array.from({ length: 3 }, (_, i) => mkGame(i));
    const r = buildNbaPicksV2({ games, config: NBA_DEFAULT_CONFIG });
    const allIds = new Set(r.fullSlatePicks.map(p => p.id));
    for (const h of r.heroPicks) {
      expect(allIds.has(h.id), `hero ${h.id} must exist in fullSlatePicks`).toBe(true);
      expect(h.isHeroPick).toBe(true);
      expect(h.pickRole).toBe('hero');
    }
  });

  it('trackingPicks are full-slate picks NOT in heroPicks', () => {
    const games = Array.from({ length: 3 }, (_, i) => mkGame(i));
    const r = buildNbaPicksV2({ games, config: NBA_DEFAULT_CONFIG });
    const heroIds = new Set(r.heroPicks.map(p => p.id));
    for (const t of r.trackingPicks) {
      expect(heroIds.has(t.id), 'tracking pick must not be a hero').toBe(false);
      expect(t.pickRole).toBe('tracking');
    }
    // Together they exhaust fullSlate.
    expect(r.heroPicks.length + r.trackingPicks.length).toBe(r.fullSlatePicks.length);
  });

  it('every persisted pick has tier + rationale.pickRole + market.type', () => {
    const games = Array.from({ length: 3 }, (_, i) => mkGame(i));
    const r = buildNbaPicksV2({ games, config: NBA_DEFAULT_CONFIG });
    for (const p of r.fullSlatePicks) {
      expect(p.tier, 'tier required for persistence').toBeTruthy();
      expect(['tier1', 'tier2', 'tier3', 'coverage', 'tracking']).toContain(p.tier);
      expect(p.rationale?.pickRole).toMatch(/^(hero|tracking)$/);
      expect(['moneyline', 'runline', 'total']).toContain(p.market?.type);
      expect(p.selection?.side).toBeTruthy();
    }
  });

  it('byGame entries carry start time + away/home so the UI can render game cards', () => {
    const games = Array.from({ length: 2 }, (_, i) => mkGame(i));
    const r = buildNbaPicksV2({ games, config: NBA_DEFAULT_CONFIG });
    for (const g of r.byGame) {
      expect(g.gameId).toBeTruthy();
      expect(g.startTime).toBeTruthy();
      expect(g.awayTeam?.slug).toBeTruthy();
      expect(g.homeTeam?.slug).toBeTruthy();
    }
  });

  it('meta counts surface fullSlate / hero / tracking and games-with-full-slate', () => {
    const games = Array.from({ length: 3 }, (_, i) => mkGame(i));
    const r = buildNbaPicksV2({ games, config: NBA_DEFAULT_CONFIG });
    expect(r.meta.fullSlatePickCount).toBe(9);
    expect(r.meta.heroPickCount).toBe(r.heroPicks.length);
    expect(r.meta.trackingPickCount).toBe(r.trackingPicks.length);
    expect(r.meta.gamesWithFullSlate).toBe(3);
  });
});

describe('v7 full-slate contract — low-edge picks become TRACKING, not dropped', () => {
  it('a slate with neutral edge still produces 3 picks per game (all tracking)', () => {
    // pregameEdge=0 → flat win probabilities → low-edge picks across the
    // board. Pre-v7 these would have been dropped.
    const games = [mkGame(0, { model: { pregameEdge: 0, confidence: 0.4, fairTotal: 220 }, market: { moneyline: { away: 105, home: -125 }, pregameSpread: -1, pregameTotal: 220 } })];
    const r = buildNbaPicksV2({ games, config: NBA_DEFAULT_CONFIG });
    expect(r.fullSlatePicks.length).toBeGreaterThanOrEqual(3);
    // None should be hero — neutral edge can't possibly clear the floor.
    expect(r.heroPicks).toHaveLength(0);
  });
});

describe('v7 full-slate contract — totals always produce a directional pick when fairTotal exists', () => {
  it('positive delta picks Over, negative picks Under', () => {
    const overGame = mkGame(0, {
      market: { moneyline: { away: 130, home: -150 }, pregameSpread: -3, pregameTotal: 220 },
      model: { pregameEdge: 1, confidence: 0.7, fairTotal: 230 },     // +10 → Over
    });
    const underGame = mkGame(1, {
      market: { moneyline: { away: -160, home: 140 }, pregameSpread: 2, pregameTotal: 220 },
      model: { pregameEdge: -1, confidence: 0.7, fairTotal: 210 },    // −10 → Under
    });
    const r = buildNbaPicksV2({ games: [overGame, underGame], config: NBA_DEFAULT_CONFIG });
    const overTot  = r.byGame.find(g => g.gameId === 'nba-g-0').picks.total;
    const underTot = r.byGame.find(g => g.gameId === 'nba-g-1').picks.total;
    expect(overTot.selection.side).toBe('over');
    expect(underTot.selection.side).toBe('under');
  });
});
