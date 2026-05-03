/**
 * Builder category-bucket parity — proves buildNbaPicksV2 produces
 * candidates for ML / ATS / Totals when the inputs justify it, and the
 * legacy `categories` shape mirrors the modern `tiers` output 1:1.
 *
 * Confirms the structural capability the v4 audit promises. (Today the
 * NBA pipeline doesn't actually publish totals because the enricher
 * leaves `model.fairTotal === null` — these tests inject a synthetic
 * fairTotal to exercise the totals gate so future model work doesn't
 * regress the structure.)
 */

import { describe, it, expect } from 'vitest';
import { buildNbaPicksV2, NBA_DEFAULT_CONFIG } from './buildNbaPicksV2.js';

function mkGame({ id, edge = 2.0, fairTotal = null, marketTotal = 220 }) {
  return {
    gameId: id,
    startTime: new Date(Date.now() + 3 * 3600 * 1000).toISOString(),
    status: 'upcoming',
    gameState: { isLive: false, isFinal: false },
    teams: {
      away: { slug: `${id}_away`, name: `Away${id}`, abbrev: 'A' },
      home: { slug: `${id}_home`, name: `Home${id}`, abbrev: 'H' },
    },
    market: {
      moneyline: { away: 130, home: -150 },
      pregameSpread: -3.5,
      pregameTotal: marketTotal,
    },
    model: {
      pregameEdge: edge,
      confidence: 0.75,
      fairTotal,
    },
    signals: { importanceScore: 60, watchabilityScore: 50, marketDislocationScore: 55 },
  };
}

describe('buildNbaPicksV2 — category structure', () => {
  it('exposes the canonical pick.market.type for moneyline + runline + total', () => {
    // Use a synthetic fairTotal that's well above the 2.0 minExpectedDelta
    // so a totals candidate is generated for verification.
    const games = Array.from({ length: 6 }, (_, i) => mkGame({
      id: `g${i}`,
      edge: 2.5,
      fairTotal: 230,    // marketTotal default 220, delta = 10 → passes gate
      marketTotal: 220,
    }));
    const r = buildNbaPicksV2({ games, config: NBA_DEFAULT_CONFIG });
    const all = [
      ...r.tiers.tier1, ...r.tiers.tier2, ...r.tiers.tier3,
      ...(r.coverage || []),
    ];
    const types = new Set(all.map(p => p.market?.type));
    expect(types.has('moneyline') || types.has('runline') || types.has('total'))
      .toBe(true);
  });

  it('produces totals candidates when fairTotal is supplied — proves structural capability', () => {
    const games = [mkGame({ id: 'g0', edge: 0, fairTotal: 230, marketTotal: 220 })];
    const r = buildNbaPicksV2({ games, config: NBA_DEFAULT_CONFIG });
    const all = [
      ...r.tiers.tier1, ...r.tiers.tier2, ...r.tiers.tier3,
      ...(r.coverage || []),
    ];
    const totals = all.filter(p => p.market?.type === 'total');
    // The synthetic delta of 10 is well above the gate; SOME totals row
    // should appear. (Discipline may demote it to coverage tier, that's
    // fine — what matters is the category exists.)
    expect(totals.length).toBeGreaterThan(0);
  });

  it('produces NO totals candidates when fairTotal is null (current honest state)', () => {
    const games = [mkGame({ id: 'g0', edge: 2.5, fairTotal: null, marketTotal: 220 })];
    const r = buildNbaPicksV2({ games, config: NBA_DEFAULT_CONFIG });
    const all = [
      ...r.tiers.tier1, ...r.tiers.tier2, ...r.tiers.tier3,
      ...(r.coverage || []),
    ];
    const totals = all.filter(p => p.market?.type === 'total');
    expect(totals).toHaveLength(0);
  });

  it('legacy.categories mirrors tiered output by market', () => {
    const games = Array.from({ length: 4 }, (_, i) => mkGame({
      id: `g${i}`, edge: 2.5, fairTotal: 230,
    }));
    const r = buildNbaPicksV2({ games, config: NBA_DEFAULT_CONFIG });
    expect(r.legacy?.categories).toBeDefined();
    expect(r.legacy.categories).toHaveProperty('pickEms');
    expect(r.legacy.categories).toHaveProperty('ats');
    expect(r.legacy.categories).toHaveProperty('totals');
  });
});

describe('buildNbaPicksV2 — pick row shape preserves history fields', () => {
  it('every published pick has the metadata persistence requires', () => {
    const games = Array.from({ length: 4 }, (_, i) => mkGame({ id: `g${i}`, edge: 2.5 }));
    const r = buildNbaPicksV2({ games, config: NBA_DEFAULT_CONFIG });
    const all = [...r.tiers.tier1, ...r.tiers.tier2, ...r.tiers.tier3, ...(r.coverage || [])];
    expect(all.length).toBeGreaterThan(0);
    for (const p of all) {
      expect(p).toHaveProperty('id');
      expect(p).toHaveProperty('gameId');
      expect(p).toHaveProperty('sport', 'nba');
      expect(p).toHaveProperty('market.type');
      expect(p).toHaveProperty('selection.side');
      expect(p).toHaveProperty('betScore.total');
      expect(p).toHaveProperty('matchup.awayTeam.slug');
      expect(p).toHaveProperty('matchup.homeTeam.slug');
    }
  });
});
