import { describe, it, expect } from 'vitest';
import {
  NFL_MODEL, normalCdf, normalInv, impliedFromAmerican, devig,
  buildNflRatings, ratingsFromStandings, projectNflGame, priceNflGame, pythagoreanWinPct,
} from './nflModel.js';

/** Round-robin season where each team's true strength is known. */
function syntheticSeason(strengths, { rounds = 2, hfa = NFL_MODEL.HOME_FIELD, base = 22 } = {}) {
  const slugs = Object.keys(strengths);
  const results = [];
  let day = 0;
  for (let r = 0; r < rounds; r++) {
    for (let i = 0; i < slugs.length; i++) {
      for (let j = 0; j < slugs.length; j++) {
        if (i === j) continue;
        const home = slugs[i], away = slugs[j];
        const margin = strengths[home] - strengths[away] + hfa;
        results.push({
          homeSlug: home, awaySlug: away,
          homeScore: base + margin / 2, awayScore: base - margin / 2,
          date: new Date(Date.UTC(2026, 8, 10 + day++)).toISOString(),
        });
      }
    }
  }
  return results;
}

describe('probability helpers', () => {
  it('normalCdf matches known values', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 3);
    expect(normalCdf(-1)).toBeCloseTo(0.1587, 3);
  });

  it('normalInv inverts normalCdf', () => {
    for (const p of [0.01, 0.2, 0.5, 0.8, 0.975, 0.999]) {
      expect(normalCdf(normalInv(p))).toBeCloseTo(p, 5);
    }
    expect(normalInv(0.5)).toBeCloseTo(0, 6);
    expect(Number.isFinite(normalInv(0))).toBe(true);
    expect(Number.isFinite(normalInv(1))).toBe(true);
  });

  it('converts American odds and removes the vig', () => {
    expect(impliedFromAmerican(-110)).toBeCloseTo(0.5238, 4);
    expect(impliedFromAmerican(150)).toBeCloseTo(0.4, 4);
    expect(impliedFromAmerican(null)).toBeNull();
    const fair = devig(impliedFromAmerican(-110), impliedFromAmerican(-110));
    expect(fair.a).toBeCloseTo(0.5, 6);
    expect(fair.a + fair.b).toBeCloseTo(1, 6);
  });

  it('pythagorean expectation is 50% for an even team and rises with margin', () => {
    expect(pythagoreanWinPct(300, 300)).toBeCloseTo(0.5, 6);
    expect(pythagoreanWinPct(400, 300)).toBeGreaterThan(0.6);
    expect(pythagoreanWinPct(null, 300)).toBeNull();
  });
});

describe('buildNflRatings', () => {
  const strengths = { a: 6, b: 2, c: 0, d: -3, e: -5 };
  const ratings = buildNflRatings(syntheticSeason(strengths));

  it('recovers the ordering and spacing of true strength', () => {
    const order = Object.values(ratings.teams).sort((x, y) => y.rating - x.rating).map((t) => t.slug);
    expect(order).toEqual(['a', 'b', 'c', 'd', 'e']);
    // Two home-and-away round robins: 16 games each.
    const shrink = 16 / (16 + NFL_MODEL.PRIOR_GAMES);
    expect(ratings.teams.a.rating - ratings.teams.e.rating).toBeCloseTo(11 * shrink, 0);
  });

  it('centres ratings on zero and splits them into offense and defense', () => {
    const sum = Object.values(ratings.teams).reduce((acc, t) => acc + t.rating, 0);
    expect(Math.abs(sum)).toBeLessThan(0.5);
    for (const t of Object.values(ratings.teams)) {
      expect(t.offense + t.defense).toBeCloseTo(t.rating, 0);
    }
  });

  it('removes home field, so a team that only played at home is not overrated', () => {
    // x hosts y four times and wins each by exactly the home-field margin.
    const results = Array.from({ length: 4 }, (_, i) => ({
      homeSlug: 'x', awaySlug: 'y', homeScore: 20 + NFL_MODEL.HOME_FIELD, awayScore: 20,
      date: new Date(Date.UTC(2026, 8, 10 + i)).toISOString(),
    }));
    const r = buildNflRatings(results);
    expect(r.teams.x.rating).toBeCloseTo(0, 1);
    expect(r.teams.y.rating).toBeCloseTo(0, 1);
  });

  it('gives no home edge to neutral-site games', () => {
    const results = Array.from({ length: 4 }, (_, i) => ({
      homeSlug: 'x', awaySlug: 'y', homeScore: 24, awayScore: 20, neutralSite: true,
      date: new Date(Date.UTC(2026, 8, 10 + i)).toISOString(),
    }));
    // Four 4-point wins, shrunk by 4 / (4 + PRIOR_GAMES): x is +1, y is -1.
    const r = buildNflRatings(results);
    expect(r.teams.x.rating).toBeCloseTo(1, 1);
    expect(r.teams.y.rating).toBeCloseTo(-1, 1);
  });

  it('converges on a bipartite schedule (every team has played once)', () => {
    // Week 1: a perfect matching. An undamped solve oscillates here.
    const week1 = [
      { homeSlug: 'a', awaySlug: 'b', homeScore: 30, awayScore: 20, neutralSite: true },
      { homeSlug: 'c', awaySlug: 'd', homeScore: 17, awayScore: 23, neutralSite: true },
    ];
    const r = buildNflRatings(week1);
    const shrink = 1 / (1 + NFL_MODEL.PRIOR_GAMES);
    expect(r.teams.a.rating - r.teams.b.rating).toBeCloseTo(10 * shrink, 1);
    expect(r.teams.d.rating - r.teams.c.rating).toBeCloseTo(6 * shrink, 1);
  });

  it('shrinks small samples toward average', () => {
    const one = buildNflRatings([{ homeSlug: 'x', awaySlug: 'y', homeScore: 45, awayScore: 3, neutralSite: true }]);
    // A 42-point win in one game must not read as a 42-point team.
    expect(one.teams.x.rating).toBeLessThan(10);
    expect(one.teams.x.shrink).toBeCloseTo(1 / (1 + NFL_MODEL.PRIOR_GAMES), 3);
  });

  it('ignores games without a final score and records the source', () => {
    const r = buildNflRatings([
      { homeSlug: 'x', awaySlug: 'y', homeScore: 24, awayScore: 20 },
      { homeSlug: 'x', awaySlug: 'z', homeScore: null, awayScore: null },
    ]);
    expect(r.games).toBe(1);
    expect(r.source).toBe('results');
    expect(r.teams.z).toBeUndefined();
  });

  it('falls back to standings when there are no results', () => {
    const standings = {
      x: { wins: 6, losses: 2, ties: 0, pointsFor: 240, pointsAgainst: 160 },
      y: { wins: 2, losses: 6, ties: 0, pointsFor: 160, pointsAgainst: 240 },
    };
    const r = buildNflRatings([], { standings });
    expect(r.source).toBe('standings');
    expect(r.teams.x.rating).toBeGreaterThan(0);
    expect(r.teams.y.rating).toBeLessThan(0);
    expect(ratingsFromStandings({}).source).toBe('none');
  });

  it('tracks recent form and the last game date for rest calculations', () => {
    expect(ratings.teams.a.lastGameAt).toBeGreaterThan(0);
    expect(ratings.teams.a.games).toBe(16);
  });
});

describe('projectNflGame', () => {
  const ratings = {
    leaguePpg: 22,
    teams: {
      good: { rating: 6, offense: 4, defense: 2 },
      bad: { rating: -4, offense: -3, defense: -1 },
    },
  };

  it('adds home field and stays internally consistent', () => {
    const p = projectNflGame({ homeSlug: 'good', awaySlug: 'bad', ratings });
    expect(p.margin).toBeCloseTo(10 + NFL_MODEL.HOME_FIELD, 1);
    expect(p.fairSpreadHome).toBeCloseTo(-p.margin, 1);
    expect(p.homePoints - p.awayPoints).toBeCloseTo(p.margin, 1);
    // Each figure is rounded to a tenth on its own.
    expect(Math.abs(p.homePoints + p.awayPoints - p.total)).toBeLessThanOrEqual(0.11);
    expect(p.homeWinProb + p.awayWinProb).toBeCloseTo(1, 3);
    expect(p.homeWinProb).toBeGreaterThan(0.75);
  });

  it('drops home field at a neutral site and returns null for unknown teams', () => {
    const p = projectNflGame({ homeSlug: 'good', awaySlug: 'bad', ratings, neutralSite: true });
    expect(p.margin).toBeCloseTo(10, 1);
    expect(projectNflGame({ homeSlug: 'good', awaySlug: 'nobody', ratings })).toBeNull();
  });
});

describe('priceNflGame', () => {
  const projection = { margin: 7, fairSpreadHome: -7, total: 47, homeWinProb: 0.7, awayWinProb: 0.3, homePoints: 27, awayPoints: 20 };

  it('keeps only a share of the gap to the market on sides', () => {
    const priced = priceNflGame({ projection, market: { spreadHome: -3, moneylineHome: -160, moneylineAway: 135 } });
    // Model -7, market -3: raw gap 4 toward the home team.
    expect(priced.side.rawGap).toBeCloseTo(4, 5);
    expect(priced.side.edgePoints).toBeCloseTo(4 * NFL_MODEL.MARKET_WEIGHT_SIDE, 5);
    expect(priced.side.blendedSpreadHome).toBeCloseTo(-4.2, 5);
    expect(priced.side.homeCoverProb).toBeGreaterThan(0.5);
    expect(priced.side.homeCoverProb).toBeLessThan(0.56);
    expect(priced.side.homeCoverProb + priced.side.awayCoverProb).toBeCloseTo(1, 3);
    expect(priced.side.informationGap).toBe(false);
  });

  it('anchors the moneyline on its own price and shifts it by the spread adjustment', () => {
    const priced = priceNflGame({ projection, market: { spreadHome: -3, moneylineHome: -160, moneylineAway: 135 } });
    const m = priced.moneyline;
    expect(m.priced).toBe(true);
    expect(m.impliedHome + m.impliedAway).toBeCloseTo(1, 3);
    // Model likes the home side by 1.2 points, so the home moneyline gains
    // a few points of probability and the road side loses the same.
    expect(m.homeEdge).toBeGreaterThan(0.02);
    expect(m.homeEdge).toBeLessThan(0.05);
    expect(m.homeEdge + m.awayEdge).toBeCloseTo(0, 3);
  });

  it('finds no moneyline edge when the model agrees with the spread, whatever the price', () => {
    // Big favourites are priced shorter than a normal curve implies. That
    // must not read as value on the underdog.
    const agree = { ...projection, margin: 10, fairSpreadHome: -10 };
    const m = priceNflGame({ projection: agree, market: { spreadHome: -10, moneylineHome: -550, moneylineAway: 400 } }).moneyline;
    expect(m.homeEdge).toBeCloseTo(0, 3);
    expect(m.awayEdge).toBeCloseTo(0, 3);
  });

  it('keeps the moneyline on the same side as the spread pick', () => {
    for (const spreadHome of [-13.5, -9, -3, 2.5, 7]) {
      const p = priceNflGame({ projection, market: { spreadHome, moneylineHome: -300, moneylineAway: 250 } });
      expect(Math.sign(p.moneyline.homeEdge)).toBe(Math.sign(p.side.edgePoints));
    }
  });

  it('prices a moneyline with no spread posted from the moneyline-implied margin', () => {
    const m = priceNflGame({ projection, market: { moneylineHome: -110, moneylineAway: -110 } }).moneyline;
    expect(m.priced).toBe(true);
    // Market says coin flip, ratings say home by 7: a modest home edge.
    expect(m.homeEdge).toBeGreaterThan(0.03);
    expect(m.homeEdge).toBeLessThan(0.1);
  });

  it('flags a touchdown-sized disagreement as an information gap', () => {
    const priced = priceNflGame({ projection, market: { spreadHome: 1.5 } });
    expect(priced.side.rawGap).toBeCloseTo(8.5, 5);
    expect(priced.side.informationGap).toBe(true);
  });

  it('prices totals with their own weight and direction', () => {
    const over = priceNflGame({ projection, market: { total: 43 } }).total;
    expect(over.edgePoints).toBeCloseTo(4 * NFL_MODEL.MARKET_WEIGHT_TOTAL, 5);
    expect(over.overProb).toBeGreaterThan(0.5);
    const under = priceNflGame({ projection, market: { total: 50 } }).total;
    expect(under.edgePoints).toBeLessThan(0);
    expect(under.underProb).toBeGreaterThan(0.5);
  });

  it('returns null fields for markets with no posted number', () => {
    const priced = priceNflGame({ projection, market: {} });
    expect(priced.side).toBeNull();
    expect(priced.total).toBeNull();
    expect(priced.moneyline.priced).toBe(false);
    expect(priceNflGame({ projection: null, market: {} })).toBeNull();
  });
});
