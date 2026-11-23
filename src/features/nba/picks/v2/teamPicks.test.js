/**
 * Engine 2.6.0: sides called from season ratings, and the team-pick floor
 * that keeps Maximus's picks from being totals only.
 */

import { describe, it, expect } from 'vitest';
import { buildNbaPicksV2, NBA_DEFAULT_CONFIG, NBA_MODEL_VERSION } from './buildNbaPicksV2.js';
import { pickSpreadSide } from './nbaModelEdge.js';
import {
  SEASON_RATINGS, shrunkMargin, projectHomeMarginFromRatings, ratingsAgainstSpread, parseStandingsRatings,
} from './seasonRatings.js';
import { nbaPickSummary, isLowerConviction, maximusPicks, topPicksWithTeams } from '../pickSummary.js';

const NBA = [
  ['uta', 'lal'], ['okc', 'ind'], ['bkn', 'min'], ['mil', 'tor'], ['por', 'phi'],
];

function mkGame(i, { homeLine, ml, total = 224.5 }) {
  const [away, home] = NBA[i];
  return {
    gameId: `g-${i}`,
    startTime: new Date(Date.now() + (i + 2) * 3600 * 1000).toISOString(),
    status: 'upcoming',
    gameState: { isLive: false, isFinal: false },
    teams: {
      away: { slug: away, name: away.toUpperCase(), abbrev: away.toUpperCase() },
      home: { slug: home, name: home.toUpperCase(), abbrev: home.toUpperCase() },
    },
    market: { moneyline: ml, pregameSpread: homeLine, pregameTotal: total },
    model: { confidence: 0.7 },
    signals: { importanceScore: 60, watchabilityScore: 50, marketDislocationScore: 55 },
  };
}

// A slate shaped like Nov 23, 2026: no fair total on any game, so nothing is a pick on its own.
const SLATE = [
  mkGame(0, { homeLine: -13.5, ml: { away: +550, home: -800 } }),
  mkGame(1, { homeLine: +6, ml: { away: -224, home: +185 } }),
  mkGame(2, { homeLine: -9.5, ml: { away: +340, home: -440 } }),
  mkGame(3, { homeLine: -4.5, ml: { away: +160, home: -190 } }),
  mkGame(4, { homeLine: -2.5, ml: { away: +120, home: -142 } }),
];

const RATINGS = {
  uta: { pointDiff: -9.0, games: 18 }, lal: { pointDiff: 4.0, games: 17 },
  okc: { pointDiff: 11.0, games: 17 }, ind: { pointDiff: -4.0, games: 17 },
  bkn: { pointDiff: -6.0, games: 16 }, min: { pointDiff: 6.5, games: 17 },
  mil: { pointDiff: -2.0, games: 17 }, tor: { pointDiff: 1.0, games: 17 },
  por: { pointDiff: 0.5, games: 17 }, phi: { pointDiff: 3.0, games: 16 },
};

const isSide = (p) => p.market?.type === 'runline' || p.market?.type === 'moneyline';

describe('season ratings', () => {
  it('shrinks a margin toward zero early and refuses to rate a team with too few games', () => {
    expect(shrunkMargin({ pointDiff: 10, games: 15 })).toBeCloseTo(7.5, 5);
    expect(shrunkMargin({ pointDiff: 10, games: SEASON_RATINGS.minGames - 1 })).toBeNull();
    expect(shrunkMargin(null)).toBeNull();
  });

  it('projects a home margin with home court, and none when a team is unrated', () => {
    const m = projectHomeMarginFromRatings({ home: { pointDiff: 4, games: 15 }, away: { pointDiff: -4, games: 15 } });
    expect(m).toBeCloseTo(3 + 3 + SEASON_RATINGS.homeCourt, 5);
    expect(projectHomeMarginFromRatings({ home: { pointDiff: 4, games: 15 }, away: null })).toBeNull();
  });

  it('keeps part of the gap to the line, on the side the ratings like', () => {
    const r = ratingsAgainstSpread(9, -6); // ratings: home by 9; market: home by 6
    expect(r.side).toBe('home');
    expect(r.homeCoverEdge).toBeCloseTo(3 * SEASON_RATINGS.marketKeep, 5);
    expect(r.projectedHomeMargin).toBeCloseTo(6 + 0.9, 5);
    expect(r.guarded).toBe(false);
    expect(ratingsAgainstSpread(2, -6).side).toBe('away');
  });

  it('treats a huge gap as missing information and a tiny one as a coin flip', () => {
    expect(ratingsAgainstSpread(16, -6).guarded).toBe(true);
    expect(ratingsAgainstSpread(6.5, -6).thin).toBe(true);
  });

  it('reads margins out of an ESPN standings payload in either shape', () => {
    const data = {
      children: [{
        standings: {
          entries: [
            { team: { id: '25' }, stats: [{ name: 'wins', value: 14 }, { name: 'losses', value: 3 }, { name: 'avgPointsFor', value: 120.1 }, { name: 'avgPointsAgainst', value: 109.0 }] },
            { team: { id: '11' }, stats: [{ name: 'wins', value: 5 }, { name: 'losses', value: 12 }, { name: 'differential', value: -4.2 }] },
            { team: { id: '99' }, stats: [{ name: 'wins', value: 5 }, { name: 'losses', value: 12 }] },
          ],
        },
      }],
    };
    const out = parseStandingsRatings(data);
    expect(out['25']).toEqual({ pointDiff: 11.1, games: 17 });
    expect(out['11']).toEqual({ pointDiff: -4.2, games: 17 });
    expect(out['99']).toBeUndefined();
  });
});

describe('pickSpreadSide with ratings', () => {
  it('calls the side from the ratings and tags the source', () => {
    const sp = pickSpreadSide({ awayMl: -224, homeMl: +185, homeLine: +6, ratingsHomeMargin: -10 });
    expect(sp.modelSource).toBe('season_ratings_v1');
    expect(sp.side).toBe('away'); // ratings: road team by 10, laying 6
    expect(sp.lineValue).toBe(-6);
    expect(sp.rawEdge).toBeGreaterThan(0);
    expect(sp.rawEdge).toBeLessThanOrEqual(0.08);
  });

  it('falls back to the moneyline comparison without ratings', () => {
    const sp = pickSpreadSide({ awayMl: -224, homeMl: +185, homeLine: +6 });
    expect(sp.modelSource).not.toBe('season_ratings_v1');
  });
});

describe('team-pick floor', () => {
  it('is on engine 2.6.0', () => {
    expect(NBA_MODEL_VERSION).toBe('nba-picks-v2.6.0');
  });

  it('adds ratings-backed spreads when no side made the list on its own', () => {
    const r = buildNbaPicksV2({ games: SLATE, config: NBA_DEFAULT_CONFIG, teamRatings: RATINGS });
    const heroes = maximusPicks(r);
    const sides = heroes.filter(isSide);
    expect(sides.length).toBeGreaterThanOrEqual(1);
    expect(sides.length).toBeLessThanOrEqual(2);
    for (const p of sides) {
      expect(p.market.type).toBe('runline');
      expect(p.modelSource).toBe('season_ratings_v1');
      expect(p.teamPickFloor).toBe(true);
      expect(p.rationale.teamPickFloor).toBe(true);
      expect(p.isLowConviction).toBe(true);
      expect(isLowerConviction(p)).toBe(true);
      expect(p.lowSignalReason).toBeNull();
    }
    // One per game.
    expect(new Set(sides.map((p) => p.gameId)).size).toBe(sides.length);
    expect(r.meta.flags).toContain('team_pick_floor');
  });

  it('adds nothing without ratings: a moneyline-derived lean is never promoted', () => {
    const r = buildNbaPicksV2({ games: SLATE, config: NBA_DEFAULT_CONFIG });
    expect(maximusPicks(r).filter((p) => p.teamPickFloor).length).toBe(0);
    expect(r.meta.flags).not.toContain('team_pick_floor');
  });

  it('does not promote a side the ratings guard held back', () => {
    const wild = { ...RATINGS, okc: { pointDiff: 25, games: 17 }, ind: { pointDiff: -20, games: 17 } };
    const r = buildNbaPicksV2({ games: [SLATE[1]], config: NBA_DEFAULT_CONFIG, teamRatings: wild });
    const spread = r.fullSlatePicks.find((p) => p.market.type === 'runline');
    expect(spread.lowSignalReason).toBe('data_gap');
    expect(spread.pickRole).toBe('tracking');
  });

  it('never makes a guarded side a pick, on a slate shaped like Nov 23 (MEM -3 with an 9.7-point gap)', () => {
    const mem = { ...SLATE[1], gameId: 'g-mem', market: { moneyline: { away: -155, home: +130 }, pregameSpread: +3, pregameTotal: 224 } };
    const wide = { ...RATINGS, okc: { pointDiff: 9.06, games: 17 }, ind: { pointDiff: -10.53, games: 15 } };
    const r = buildNbaPicksV2({ games: [mem, SLATE[0], SLATE[2], SLATE[3], SLATE[4]], config: NBA_DEFAULT_CONFIG, teamRatings: wide });
    const spread = r.fullSlatePicks.find((p) => p.gameId === 'g-mem' && p.market.type === 'runline');
    expect(spread.lowSignalReason).toBe('data_gap');
    expect(spread.rawEdge).toBe(0);
    expect(spread.pickRole).toBe('tracking');
    for (const p of maximusPicks(r)) expect(p.lowSignalReason).toBeNull();
  });

  it('writes the reason from the season margins, not the moneyline', () => {
    const r = buildNbaPicksV2({ games: SLATE, config: NBA_DEFAULT_CONFIG, teamRatings: RATINGS });
    const side = maximusPicks(r).find(isSide);
    const text = nbaPickSummary(side);
    expect(text).toMatch(/a game/);
    expect(text).toMatch(/Season margins and home court/);
    expect(text).not.toMatch(/moneyline/i);
  });
});

describe('topPicksWithTeams', () => {
  const mk = (id, type, s) => ({ id, market: { type }, conviction: { score: s }, pickRole: 'hero' });
  const totals = [80, 78, 74, 70, 66].map((s, i) => mk(`t${i}`, 'total', s));
  const sides = [mk('s0', 'runline', 41), mk('s1', 'runline', 38)];

  it('keeps the team picks in a five-pick cut, in place of the weakest totals', () => {
    const out = topPicksWithTeams([...totals, ...sides], 5);
    expect(out.map((p) => p.id)).toEqual(['t0', 't1', 't2', 's0', 's1']);
  });

  it('leaves a list alone when it already fits or already has team picks', () => {
    expect(topPicksWithTeams([...totals.slice(0, 2), ...sides], 5).length).toBe(4);
    const strong = [mk('s9', 'runline', 90), mk('s8', 'moneyline', 85), ...totals];
    expect(topPicksWithTeams(strong, 5).map((p) => p.id)).toEqual(['s9', 's8', 't0', 't1', 't2']);
  });

  it('is a plain top cut when there are no team picks', () => {
    expect(topPicksWithTeams([...totals, mk('t5', 'total', 60)], 5).map((p) => p.id)).toEqual(['t0', 't1', 't2', 't3', 't4']);
  });
});
