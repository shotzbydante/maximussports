import { describe, it, expect } from 'vitest';
import { buildNflPicksV2, NFL_DEFAULT_CONFIG, NFL_MODEL_VERSION } from './buildNflPicksV2.js';

const NOW = new Date('2026-11-21T20:00:00Z');
const DAY = 86_400_000;

function team(slug, abbrev, record = '5-5') {
  return { slug, name: `${abbrev} Team`, abbrev, logo: null, score: null, record };
}

function game(id, away, home, market, extra = {}) {
  return {
    gameId: id,
    sport: 'nfl',
    status: 'upcoming',
    startTime: new Date(NOW.getTime() + DAY).toISOString(),
    week: 11,
    seasonType: 2,
    teams: { away, home },
    gameState: { isLive: false, isFinal: false },
    market: { booksCount: 6, ...market },
    venue: { neutralSite: false },
    broadcast: { network: 'CBS' },
    ...extra,
  };
}

function rating(slug, offense, defense, extra = {}) {
  return {
    slug, games: 10, rating: offense + defense, offense, defense,
    formTrend: 0, lastGameAt: NOW.getTime() - 6 * DAY, ...extra,
  };
}

const ratings = {
  source: 'results',
  games: 160,
  leaguePpg: 22,
  teams: {
    chiefs: rating('chiefs', 4, 3),
    raiders: rating('raiders', -3, -2),
    bills: rating('bills', 5, 2),
    jets: rating('jets', -1, 0),
    lions: rating('lions', 1, 0),
    bears: rating('bears', 0.5, 0.5),
  },
};

const KC = team('chiefs', 'KC');
const LV = team('raiders', 'LV');
const BUF = team('bills', 'BUF');
const NYJ = team('jets', 'NYJ');
const DET = team('lions', 'DET');
const CHI = team('bears', 'CHI');

describe('buildNflPicksV2', () => {
  it('returns the canonical contract the shared picks UI and persistence expect', () => {
    const out = buildNflPicksV2({
      games: [game('1', LV, KC, { pregameSpread: -9.5, pregameTotal: 44.5, moneyline: { home: -450, away: 340 } })],
      ratings, now: NOW,
    });
    expect(out.sport).toBe('nfl');
    expect(out.modelVersion).toBe(NFL_MODEL_VERSION);
    expect(out.configVersion).toBe(NFL_DEFAULT_CONFIG.version);
    expect(out.date).toBe('2026-11-21');
    expect(out.week).toBe(11);
    expect(out.slateLabel).toBe('Week 11');
    for (const key of ['tier1', 'tier2', 'tier3']) expect(Array.isArray(out.tiers[key])).toBe(true);
    for (const key of ['coverage', 'fullSlatePicks', 'heroPicks', 'trackingPicks', 'byGame']) {
      expect(Array.isArray(out[key])).toBe(true);
    }
    expect(Object.keys(out.categories)).toEqual(['pickEms', 'ats', 'leans', 'totals']);
    expect(out.byGame).toHaveLength(1);
    expect(Object.keys(out.byGame[0].picks)).toEqual(['moneyline', 'runline', 'total']);
  });

  it('shapes each pick for the picks table: id, market, side, line, slugs and a positive bet score', () => {
    const out = buildNflPicksV2({
      games: [game('g1', LV, KC, { pregameSpread: -6.5, pregameTotal: 41, moneyline: { home: -280, away: 230 } })],
      ratings, now: NOW,
    });
    const spread = out.byGame[0].picks.runline;
    // Ratings: KC by 12 + 1.7; market KC -6.5. Model likes KC.
    expect(spread.id).toBe('g1-runline-home');
    expect(spread.market).toEqual({ type: 'runline', line: -6.5, priceAmerican: null });
    expect(spread.selection).toMatchObject({ side: 'home', team: 'KC', label: 'KC -6.5' });
    expect(spread.matchup.awayTeam.slug).toBe('raiders');
    expect(spread.matchup.homeTeam.slug).toBe('chiefs');
    expect(spread.betScore.total).toBeGreaterThan(0);
    expect(spread.betScore.total).toBeLessThanOrEqual(1);
    expect(Object.keys(spread.betScore.components)).toEqual(['edgeStrength', 'modelConfidence', 'situationalEdge', 'marketQuality']);
    expect(spread.conviction.score).toBe(Math.round(spread.betScore.total * 100));
    expect(spread.rawEdge).toBeGreaterThan(0);
    expect(spread.rationale.headline).toContain('KC Team -6.5');

    const total = out.byGame[0].picks.total;
    expect(['over', 'under']).toContain(total.selection.side);
    expect(total.market.line).toBe(41);
  });

  it('takes the road team and flips the line when the market overrates the home side', () => {
    const out = buildNflPicksV2({
      // Ratings: DET by 0 + 1.7 at home. Market DET -6.5 → value on CHI +6.5.
      games: [game('g2', CHI, DET, { pregameSpread: -6.5 })],
      ratings, now: NOW,
    });
    const spread = out.byGame[0].picks.runline;
    expect(spread.selection.side).toBe('away');
    expect(spread.market.line).toBe(6.5);
    expect(spread.selection.label).toBe('CHI +6.5');
  });

  it('never promotes a pick when model and market are a touchdown apart', () => {
    const out = buildNflPicksV2({
      // Ratings make KC a 13.7-point favourite; the market says pick'em.
      games: [game('g3', LV, KC, { pregameSpread: 0, moneyline: { home: -110, away: -110 } })],
      ratings, now: NOW,
    });
    const spread = out.byGame[0].picks.runline;
    expect(spread.flags.informationGap).toBe(true);
    expect(spread.pickRole).toBe('tracking');
    expect(spread.tier).toBe('tracking');
    expect(spread.lowSignalReason).toBe('information_gap');
    expect(out.heroPicks.find((p) => p.gameId === 'g3' && p.market.type !== 'total')).toBeUndefined();
    expect(spread.rationale.bullets[0]).toMatch(/touchdown apart/);
    // A guarded pick cannot also carry a high conviction number.
    expect(spread.betScore.total).toBeLessThanOrEqual(0.5);
    expect(out.byGame[0].picks.moneyline.betScore.total).toBeLessThanOrEqual(0.5);
  });

  it('puts the moneyline on the same team as the spread pick', () => {
    const out = buildNflPicksV2({
      games: [
        game('a', LV, KC, { pregameSpread: -9.5, moneyline: { home: -420, away: 330 } }),
        game('c', CHI, DET, { pregameSpread: -5.5, moneyline: { home: -240, away: 200 } }),
      ],
      ratings, now: NOW,
    });
    for (const g of out.byGame) {
      expect(g.picks.moneyline.selection.side).toBe(g.picks.runline.selection.side);
    }
  });

  it('tracks but does not promote moneylines outside the price band', () => {
    const out = buildNflPicksV2({
      games: [game('g4', NYJ, BUF, { pregameSpread: -7, moneyline: { home: -900, away: 600 } })],
      ratings, now: NOW,
    });
    const ml = out.byGame[0].picks.moneyline;
    expect(ml).not.toBeNull();
    expect(ml.flags.priceGuard).toBe(true);
    expect(ml.pickRole).toBe('tracking');
    expect(out.heroPicks.some((p) => p.id === ml.id)).toBe(false);
  });

  it('marks promoted picks as hero and everything else as tracking, with no overlap', () => {
    const out = buildNflPicksV2({
      games: [
        game('a', LV, KC, { pregameSpread: -9.5, pregameTotal: 44.5, moneyline: { home: -420, away: 330 } }),
        game('b', NYJ, BUF, { pregameSpread: -4.5, pregameTotal: 47, moneyline: { home: -210, away: 175 } }),
        game('c', CHI, DET, { pregameSpread: -5.5, pregameTotal: 40, moneyline: { home: -240, away: 200 } }),
      ],
      ratings, now: NOW,
    });
    const heroIds = new Set(out.heroPicks.map((p) => p.id));
    const trackIds = new Set(out.trackingPicks.map((p) => p.id));
    expect(out.heroPicks.length).toBeGreaterThan(0);
    expect(out.fullSlatePicks.length).toBe(heroIds.size + trackIds.size);
    for (const id of heroIds) expect(trackIds.has(id)).toBe(false);
    for (const p of out.heroPicks) {
      expect(p.pickRole).toBe('hero');
      expect(p.rationale.pickRole).toBe('hero');
      expect(['tier1', 'tier2', 'tier3']).toContain(p.tier);
    }
    for (const p of out.trackingPicks) expect(p.tier).toBe('tracking');
    // No game contributes more picks than the per-game cap.
    const perGame = {};
    for (const p of out.heroPicks) perGame[p.gameId] = (perGame[p.gameId] || 0) + 1;
    for (const n of Object.values(perGame)) expect(n).toBeLessThanOrEqual(NFL_DEFAULT_CONFIG.maxPerGame);
    expect(out.meta.picksPublished).toBe(out.heroPicks.length);
    expect(out.topPick === null || heroIds.has(out.topPick.id)).toBe(true);
  });

  it('skips markets with no posted number instead of inventing a line', () => {
    const out = buildNflPicksV2({ games: [game('g5', LV, KC, {})], ratings, now: NOW });
    expect(out.byGame[0].picks).toEqual({ moneyline: null, runline: null, total: null });
    expect(out.fullSlatePicks).toHaveLength(0);
  });

  it('ignores live and final games, and games whose teams have no rating', () => {
    const live = game('l', LV, KC, { pregameSpread: -7 }, { status: 'live', gameState: { isLive: true, isFinal: false } });
    const final = game('f', NYJ, BUF, { pregameSpread: -7 }, { status: 'final', gameState: { isLive: false, isFinal: true } });
    const unknown = game('u', team('nobody', 'XX'), KC, { pregameSpread: -7 });
    const out = buildNflPicksV2({ games: [live, final, unknown], ratings, now: NOW });
    expect(out.byGame).toHaveLength(0);
    expect(out.meta.skippedGames).toBe(1);
    expect(out.meta.totalCandidates).toBe(1);
  });

  it('credits a rest advantage after a bye and lowers confidence on a thin sample', () => {
    const rested = {
      ...ratings,
      teams: {
        ...ratings.teams,
        lions: rating('lions', 3, 2, { lastGameAt: NOW.getTime() - 13 * DAY }),
        bears: rating('bears', 0.5, 0.5, { lastGameAt: NOW.getTime() - 5 * DAY }),
      },
    };
    const g = game('r', CHI, DET, { pregameSpread: -3 });
    const withRest = buildNflPicksV2({ games: [g], ratings: rested, now: NOW }).byGame[0].picks.runline;
    expect(withRest.selection.side).toBe('home');
    expect(withRest.betScore.components.situationalEdge).toBeGreaterThan(0.5);
    expect(withRest.rationale.bullets.join(' ')).toMatch(/Rest edge/);

    const thin = {
      ...rested,
      teams: Object.fromEntries(Object.entries(rested.teams).map(([k, v]) => [k, { ...v, games: 2 }])),
    };
    const early = buildNflPicksV2({ games: [g], ratings: thin, now: NOW }).byGame[0].picks.runline;
    expect(early.betScore.components.modelConfidence).toBeLessThan(withRest.betScore.components.modelConfidence);
  });

  it('returns an empty, well-formed board with no games or no ratings', () => {
    const empty = buildNflPicksV2({ games: [], ratings, now: NOW });
    expect(empty.fullSlatePicks).toEqual([]);
    expect(empty.topPick).toBeNull();
    const noRatings = buildNflPicksV2({ games: [game('x', LV, KC, { pregameSpread: -7 })], ratings: null, now: NOW });
    expect(noRatings.fullSlatePicks).toEqual([]);
    expect(noRatings.meta.flags).toContain('no_ratings');
  });
});
