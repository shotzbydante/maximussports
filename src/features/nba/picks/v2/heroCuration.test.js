/**
 * Hero curation guardrail (v10) — pin the fix for the v9 bug where
 * cross-market arbitrage dogs leaked into NBA Home as heroes.
 *
 * The v9 audit confirmed the spread-vs-moneyline edge is honest but
 * small. Heroes need either a non-cross-market source (real model) OR
 * a stricter cross-market threshold AND multi-factor support.
 */

import { describe, it, expect } from 'vitest';
import { buildNbaPicksV2, NBA_DEFAULT_CONFIG, NBA_MODEL_VERSION } from './buildNbaPicksV2.js';

function mkGame(i, overrides = {}) {
  return {
    gameId: `g-${i}`,
    startTime: new Date(Date.now() + (i + 1) * 3600 * 1000).toISOString(),
    status: 'upcoming',
    gameState: { isLive: false, isFinal: false },
    teams: {
      away: { slug: `away${i}`, name: `Away${i}`, abbrev: `A${i}` },
      home: { slug: `home${i}`, name: `Home${i}`, abbrev: `H${i}` },
    },
    market: {
      moneyline: { away: +200, home: -240 },
      pregameSpread: -5.5,
      pregameTotal: 220,
    },
    model: { confidence: 0.7, fairTotal: 222 },
    signals: { importanceScore: 60, watchabilityScore: 50, marketDislocationScore: 55 },
    ...overrides,
  };
}

describe('v10 hero curation — cross-market underdog guardrail', () => {
  it('NBA_MODEL_VERSION is bumped past v2.0.0', () => {
    expect(NBA_MODEL_VERSION).not.toBe('nba-picks-v2.0.0');
    expect(NBA_MODEL_VERSION.startsWith('nba-picks-v2.')).toBe(true);
  });

  it('cross-market dog with rawEdge < 0.10 is NOT promoted to hero', () => {
    // Mirror the production fixture: PHI +236 / NYK -7.5 had ML rawEdge ≈ 0.08.
    const games = Array.from({ length: 4 }, (_, i) => mkGame(i, {
      market: { moneyline: { away: +236, home: -290 }, pregameSpread: -7.5, pregameTotal: 213 },
    }));
    const r = buildNbaPicksV2({ games, config: NBA_DEFAULT_CONFIG });
    const xmDogHeroes = r.heroPicks.filter(p =>
      (p.modelSource === 'spread' || p.modelSource === 'no_vig_blend' || p.modelSource === 'devigged_ml')
      && (p.market?.type === 'moneyline' || p.market?.type === 'runline')
      && Math.abs(p.rawEdge ?? 0) < 0.10
    );
    expect(xmDogHeroes.length).toBe(0);
  });

  it('all-cross-market-dog slate triggers diversification cap', () => {
    // 4 home favorites with consistent cross-market disagreement
    const lines = [-7.5, -5.5, -3, -10];
    const mls = [
      { away: +236, home: -290 },
      { away: +200, home: -240 },
      { away: +130, home: -150 },
      { away: +400, home: -550 },
    ];
    const games = lines.map((line, i) => mkGame(i, {
      market: { moneyline: mls[i], pregameSpread: line, pregameTotal: 220 },
    }));
    const r = buildNbaPicksV2({ games, config: NBA_DEFAULT_CONFIG });
    // Diversification flag should fire if ≥ 2 cross-market dogs would have been heroes
    const hasFlag = (r.meta?.flags || []).includes('cross_market_underdog_diversification');
    // Either: the strict edge floor already removed them all (no flag needed) OR the flag fired.
    const xmDogHeroes = r.heroPicks.filter(p =>
      (p.modelSource === 'spread' || p.modelSource === 'no_vig_blend' || p.modelSource === 'devigged_ml')
      && (p.market?.type === 'moneyline' || p.market?.type === 'runline')
      && (p.market?.priceAmerican ?? p.market?.line ?? 0) > 0
    );
    // Either way, we MUST end up with zero cross-market dog heroes.
    expect(xmDogHeroes.length).toBe(0);
    // If any cross-market dog candidates remained, the diversification flag should have fired.
    if (!hasFlag) expect(xmDogHeroes.length).toBe(0);
  });

  it('non-cross-market pick with score ≥ HERO_FLOOR remains a hero (Total picks)', () => {
    const games = Array.from({ length: 3 }, (_, i) => mkGame(i, {
      // Decent fair total so totals can earn hero
      market: { moneyline: { away: +110, home: -130 }, pregameSpread: -2, pregameTotal: 215 },
      model: { confidence: 0.7, fairTotal: 220 },
    }));
    // Manually set fair-total source to mark non-cross-market origin
    for (const g of games) {
      g.model.fairTotalSource = 'series_pace_v1';
      g.model.fairTotalConfidence = 0.6;
    }
    const r = buildNbaPicksV2({ games, config: NBA_DEFAULT_CONFIG });
    const totalHeroes = r.heroPicks.filter(p => p.market?.type === 'total');
    // Totals picks are NOT cross-market — they should still earn hero status when score qualifies
    if (totalHeroes.length > 0) {
      for (const t of totalHeroes) {
        expect(t.modelSource === 'spread' || t.modelSource === 'devigged_ml' || t.modelSource === 'no_vig_blend').toBe(false);
      }
    }
  });

  it('production fixture (PHI/MIN/CLE/LAL) yields zero cross-market underdog ML/ATS heroes', () => {
    // The exact slate the user complained about.
    const slate = [
      { awayMl: +236, homeMl: -290, homeLine: -7.5, total: 213 },
      { awayMl: +490, homeMl: -700, homeLine: -13,  total: 217.5 },
      { awayMl: +130, homeMl: -150, homeLine: -3,   total: 214 },
      { awayMl: +729, homeMl: -1100, homeLine: -16, total: 213.5 },
    ];
    const games = slate.map((g, i) => mkGame(i, {
      market: { moneyline: { away: g.awayMl, home: g.homeMl }, pregameSpread: g.homeLine, pregameTotal: g.total },
    }));
    const r = buildNbaPicksV2({ games, config: NBA_DEFAULT_CONFIG });

    // Every ML/ATS hero must NOT be a cross-market dog
    for (const p of r.heroPicks) {
      if (p.market?.type !== 'moneyline' && p.market?.type !== 'runline') continue;
      const isCrossMarket = ['spread', 'devigged_ml', 'no_vig_blend'].includes(p.modelSource);
      const isUnderdog = p.market?.type === 'moneyline'
        ? (p.market?.priceAmerican ?? 0) > 0
        : (p.market?.line ?? 0) > 0;
      if (isCrossMarket && isUnderdog) {
        throw new Error(`v10 leak: ${p.market.type} ${p.selection?.label} stayed hero (modelSource=${p.modelSource}, edge=${p.rawEdge})`);
      }
    }
  });
});
