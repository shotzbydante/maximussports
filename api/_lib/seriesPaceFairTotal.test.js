/**
 * Series-pace fair-total MVP — locks the honest contract.
 *
 *   - 0 priors → fairTotal=null (no signal)
 *   - 1 prior  → fairTotal=null (below minSample)
 *   - 2+ priors → fairTotal = mean(priorTotals), confidence ramps with sample
 *   - matches both home/away orientations (playoff series flip)
 *   - ignores in-flight games (only counts isFinal)
 */

import { describe, it, expect } from 'vitest';
import { seriesPaceFairTotal, priorFinalsBetween, pairKey } from './seriesPaceFairTotal.js';

function mkFinal({ id, away, home, awayScore, homeScore }) {
  return {
    gameId: id,
    teams: {
      away: { slug: away, score: awayScore },
      home: { slug: home, score: homeScore },
    },
    gameState: { isFinal: true },
    status: 'final',
  };
}
function mkLive({ id, away, home }) {
  return {
    gameId: id,
    teams: { away: { slug: away, score: 50 }, home: { slug: home, score: 48 } },
    gameState: { isFinal: false, isLive: true },
    status: 'live',
  };
}
function mkUpcoming({ id, away, home }) {
  return {
    gameId: id,
    teams: { away: { slug: away }, home: { slug: home } },
    gameState: { isFinal: false },
    status: 'upcoming',
  };
}

describe('pairKey', () => {
  it('is symmetric', () => {
    expect(pairKey('hou', 'lal')).toBe(pairKey('lal', 'hou'));
  });
});

describe('priorFinalsBetween', () => {
  it('only returns finals (skips live + upcoming)', () => {
    const games = [
      mkFinal({ id: '1', away: 'hou', home: 'lal', awayScore: 90, homeScore: 105 }),
      mkLive({ id: '2', away: 'hou', home: 'lal' }),
      mkUpcoming({ id: '3', away: 'lal', home: 'hou' }),
    ];
    const r = priorFinalsBetween('hou', 'lal', games);
    expect(r).toHaveLength(1);
  });

  it('matches in either home/away order', () => {
    const games = [
      mkFinal({ id: 'a', away: 'hou', home: 'lal', awayScore: 95, homeScore: 100 }),
      mkFinal({ id: 'b', away: 'lal', home: 'hou', awayScore: 85, homeScore: 92 }),
    ];
    expect(priorFinalsBetween('hou', 'lal', games)).toHaveLength(2);
    expect(priorFinalsBetween('lal', 'hou', games)).toHaveLength(2);
  });
});

describe('seriesPaceFairTotal — sample size gate', () => {
  it('returns fairTotal=null with 0 priors', () => {
    const out = seriesPaceFairTotal({
      awaySlug: 'hou', homeSlug: 'lal', windowGames: [],
    });
    expect(out.fairTotal).toBeNull();
    expect(out.priorGamesUsed).toBe(0);
    expect(out.confidence).toBe(0);
  });

  it('returns fairTotal=null with 1 prior (below minSample default of 2)', () => {
    const games = [mkFinal({ id: '1', away: 'hou', home: 'lal', awayScore: 100, homeScore: 110 })];
    const out = seriesPaceFairTotal({ awaySlug: 'hou', homeSlug: 'lal', windowGames: games });
    expect(out.fairTotal).toBeNull();
    expect(out.priorGamesUsed).toBe(1);
  });

  it('publishes a fairTotal with 2 priors, confidence=0.50', () => {
    const games = [
      mkFinal({ id: '1', away: 'hou', home: 'lal', awayScore: 90, homeScore: 110 }),  // 200
      mkFinal({ id: '2', away: 'lal', home: 'hou', awayScore: 100, homeScore: 110 }), // 210
    ];
    const out = seriesPaceFairTotal({ awaySlug: 'hou', homeSlug: 'lal', windowGames: games });
    expect(out.fairTotal).toBe(205);
    expect(out.priorGamesUsed).toBe(2);
    expect(out.confidence).toBe(0.5);
    expect(out.scoreRange).toEqual({ min: 200, max: 210 });
  });

  it('confidence saturates at 4+ priors', () => {
    const games = Array.from({ length: 5 }, (_, i) =>
      mkFinal({ id: `${i}`, away: 'hou', home: 'lal', awayScore: 100, homeScore: 100 })
    );
    const out = seriesPaceFairTotal({ awaySlug: 'hou', homeSlug: 'lal', windowGames: games });
    expect(out.fairTotal).toBe(200);
    expect(out.confidence).toBe(1);
  });

  it('ignores priors between unrelated teams', () => {
    const games = [
      mkFinal({ id: '1', away: 'bos', home: 'phi', awayScore: 100, homeScore: 100 }),
      mkFinal({ id: '2', away: 'tor', home: 'cle', awayScore: 100, homeScore: 100 }),
    ];
    const out = seriesPaceFairTotal({ awaySlug: 'hou', homeSlug: 'lal', windowGames: games });
    expect(out.fairTotal).toBeNull();
    expect(out.priorGamesUsed).toBe(0);
  });

  it('honors a custom minSample', () => {
    const games = [
      mkFinal({ id: '1', away: 'hou', home: 'lal', awayScore: 100, homeScore: 100 }),
      mkFinal({ id: '2', away: 'hou', home: 'lal', awayScore: 100, homeScore: 100 }),
    ];
    // minSample=3 with 2 priors should still null out
    const out = seriesPaceFairTotal({
      awaySlug: 'hou', homeSlug: 'lal', windowGames: games, minSample: 3,
    });
    expect(out.fairTotal).toBeNull();
  });
});

describe('seriesPaceFairTotal — empty / malformed inputs', () => {
  it('returns null when slugs are missing', () => {
    expect(seriesPaceFairTotal({ windowGames: [] }).fairTotal).toBeNull();
    expect(seriesPaceFairTotal({ awaySlug: 'hou', windowGames: [] }).fairTotal).toBeNull();
    expect(seriesPaceFairTotal({ homeSlug: 'lal', windowGames: [] }).fairTotal).toBeNull();
  });

  it('skips games with non-numeric scores', () => {
    const games = [
      mkFinal({ id: '1', away: 'hou', home: 'lal', awayScore: 100, homeScore: 100 }),
      // Missing scores
      { gameId: '2', teams: { away: { slug: 'hou' }, home: { slug: 'lal' } }, gameState: { isFinal: true } },
    ];
    const out = seriesPaceFairTotal({ awaySlug: 'hou', homeSlug: 'lal', windowGames: games });
    expect(out.priorGamesUsed).toBe(1);   // only the one with real scores
    expect(out.fairTotal).toBeNull();      // < minSample(2)
  });
});
