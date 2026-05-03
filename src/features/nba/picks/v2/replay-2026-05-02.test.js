/**
 * Replay test for the 2026-05-02 NBA playoff slate that produced 0–5 results
 * for the v2 engine. The point is NOT to retro-fit those exact picks — it's
 * to assert that with the post-audit discipline rules:
 *
 *   • No "Top Play" emerges from low-confidence chalk spreads.
 *   • Conviction does not exceed the matching betScore tier.
 *   • The BOS −8 Game 7 spot is suppressed entirely.
 *   • Heavy spreads (≥12 points) are not published as Strong/Top Play.
 *   • The slate may publish ZERO picks — that's an acceptable outcome.
 */

import { describe, it, expect } from 'vitest';
import { buildNbaPicksV2, NBA_DEFAULT_CONFIG } from './buildNbaPicksV2.js';

/**
 * Build a synthetic enriched-game payload that mimics the shape produced by
 * `enrichGamesWithOdds` for one matchup of the 2026-05-02 slate. We hard-set
 * `model.pregameEdge` and `model.confidence` to match what the live odds
 * pipeline would have produced.
 */
function mkEnriched({ id, awaySlug, homeSlug, spread, ml, edge, confidence, fairTotal = null }) {
  return {
    gameId: id,
    startTime: new Date(Date.now() + 3 * 3600 * 1000).toISOString(),
    status: 'upcoming',
    gameState: { isLive: false, isFinal: false },
    teams: {
      away: { slug: awaySlug, name: awaySlug.toUpperCase(), abbrev: awaySlug.toUpperCase() },
      home: { slug: homeSlug, name: homeSlug.toUpperCase(), abbrev: homeSlug.toUpperCase() },
    },
    market: {
      moneyline: ml,
      pregameSpread: spread,
      pregameTotal: 220,
    },
    model: {
      pregameEdge: edge,
      confidence,
      fairTotal,
    },
    signals: { importanceScore: 70, watchabilityScore: 60, marketDislocationScore: 60 },
  };
}

describe('replay-2026-05-02 — disciplined NBA build', () => {
  // The five lines from the audit. Spread sign convention: home line.
  const games = [
    mkEnriched({ id: 'sas-min', awaySlug: 'min', homeSlug: 'sas',
      spread: -14, ml: { away: +1100, home: -2500 }, edge: 5.0, confidence: 0.33 }),
    mkEnriched({ id: 'tor-cle', awaySlug: 'cle', homeSlug: 'tor',
      spread: +3.5, ml: { away: -180, home: +160 }, edge: 2.5, confidence: 0.33 }),
    mkEnriched({ id: 'phi-bos', awaySlug: 'phi', homeSlug: 'bos',
      spread: -8, ml: { away: +320, home: -400 }, edge: 3.5, confidence: 0.33 }),
    mkEnriched({ id: 'det-orl', awaySlug: 'det', homeSlug: 'orl',
      spread: -15.5, ml: { away: +1200, home: -3000 }, edge: 6.0, confidence: 0.33 }),
    mkEnriched({ id: 'lal-hou', awaySlug: 'hou', homeSlug: 'lal',
      spread: +3.5, ml: { away: -180, home: +160 }, edge: 3.0, confidence: 0.33 }),
  ];

  // Game 7 context applies to the BOS-PHI matchup; ORL-DET was a closeout-style
  // home-fav spot that we model as elimination.
  const gameContext = {
    'phi-bos': { isElimination: true, isGameSeven: true, eliminationFor: 'top' },
    'det-orl': { isElimination: true, isGameSeven: false, eliminationFor: 'top' },
  };

  it('publishes no Top Play (≥0.85 conviction) for any pick on this slate', () => {
    const r = buildNbaPicksV2({ games, config: NBA_DEFAULT_CONFIG, gameContext, injuryDataAvailable: false });
    const all = [...r.tiers.tier1, ...r.tiers.tier2, ...r.tiers.tier3, ...(r.coverage || [])];
    for (const p of all) {
      expect(p.conviction.score, p.id).toBeLessThan(85);
      expect(p.conviction.label, p.id).not.toBe('Top Play');
    }
  });

  it('does NOT publish a BOS −8 Game 7 spread pick', () => {
    const r = buildNbaPicksV2({ games, config: NBA_DEFAULT_CONFIG, gameContext, injuryDataAvailable: false });
    const all = [...r.tiers.tier1, ...r.tiers.tier2, ...r.tiers.tier3, ...(r.coverage || [])];
    const bosSpread = all.find(p =>
      p.gameId === 'phi-bos'
      && p.market.type === 'runline'
      && p.selection?.side === 'home'
    );
    expect(bosSpread).toBeUndefined();
  });

  it('any heavy spread (|line| ≥ 12) that survives is capped to "Lean"', () => {
    const r = buildNbaPicksV2({ games, config: NBA_DEFAULT_CONFIG, gameContext, injuryDataAvailable: false });
    const all = [...r.tiers.tier1, ...r.tiers.tier2, ...r.tiers.tier3, ...(r.coverage || [])];
    const heavy = all.filter(p =>
      p.market.type === 'runline' && Math.abs(p.market.line ?? 0) >= 12
    );
    for (const p of heavy) {
      expect(p.conviction.label, p.id).toBe('Lean');
    }
  });

  it('every published pick has a flags object reflecting the discipline pass', () => {
    const r = buildNbaPicksV2({ games, config: NBA_DEFAULT_CONFIG, gameContext, injuryDataAvailable: false });
    const all = [...r.tiers.tier1, ...r.tiers.tier2, ...r.tiers.tier3, ...(r.coverage || [])];
    for (const p of all) {
      expect(p.flags, p.id).toBeDefined();
      // Every pick should have injury flag set (false in this run).
      expect(p.flags.injuryDataAvailable, p.id).toBe(false);
    }
  });
});

describe('replay — coverage quality', () => {
  it('zero-pick slate is a valid outcome (no padding)', () => {
    // Only suppressed/demoted spots → coverage may be empty. The engine must
    // not throw nor invent picks.
    const games = [
      mkEnriched({ id: 'a-b', awaySlug: 'a', homeSlug: 'b',
        spread: -14, ml: { away: +1200, home: -2500 }, edge: 0.1, confidence: 0.20 }),
    ];
    const r = buildNbaPicksV2({ games, config: NBA_DEFAULT_CONFIG, injuryDataAvailable: false });
    expect(Array.isArray(r.tiers.tier1)).toBe(true);
    expect(Array.isArray(r.coverage)).toBe(true);
    // The exact count isn't asserted; what matters is no exception + valid shape.
  });
});
