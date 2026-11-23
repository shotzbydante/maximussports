/**
 * Test fixtures for Ask Maximus. Not imported by the app.
 *
 * The board is built by the real picks engine from its own fixtures, so the
 * tools and cards are tested against the shape production sends them.
 */

import { buildNflPicksV2 } from '../../../src/features/nfl/picks/buildNflPicksV2.js';
import { analyzeGame } from '../../../src/features/nfl/picks/v2/engine.js';
import { buildRatings } from '../../../src/features/nfl/picks/v2/ratings.js';
import { buildQbTable, indexQbWeeks } from '../../../src/features/nfl/picks/v2/qb.js';
import { buildUnitGrades } from '../../../src/features/nfl/picks/v2/units.js';
import { league, game, books, KC, LV, BUF, SF, CHI, DET } from '../../../src/features/nfl/picks/v2/fixtures.js';
import { limitsFor } from './policy.js';

export const NOW = new Date('2026-11-22T12:00:00Z');
const asOf = { season: 2026, week: 9 };

function engineModel() {
  const data = league({ strengths: { KC: 6, BUF: 4, SF: 2, DET: 0, CHI: -2, LV: -4, NYJ: -6, MIA: 0 }, weeks: 8 });
  return {
    ok: true, version: 'v2', asOf,
    ratings: buildRatings({ ...data, asOf }),
    qbTable: buildQbTable({ qbWeeks: data.qbWeeks, asOf }),
    qbIndex: indexQbWeeks(data.qbWeeks),
    unitGrades: buildUnitGrades({ teamWeeks: data.teamWeeks, asOf }),
    schedule: {}, nextDivisional: {}, coachGames: {},
  };
}

function withEngine(g, model) {
  const schedule = {
    [g.gameId]: {
      homeQbId: `qb-${g.teams.home.abbrev}`, homeQbName: `${g.teams.home.abbrev} Starter`,
      awayQbId: `qb-${g.teams.away.abbrev}`, awayQbName: `${g.teams.away.abbrev} Starter`,
      roof: 'outdoors', homeRest: 7, awayRest: 7,
    },
  };
  return { ...g, engine: analyzeGame({ game: g, model: { ...model, schedule }, weather: null }) };
}

/** One book hanging an off-market number on a different market in each game. */
const OFF_MARKET = [
  { betmgm: { spread: -3.5 } },
  { fanduel: { total: 45.5 } },
  { draftkings: { spread: -2.5 } },
  { betrivers: { total: 43.5 } },
];

/**
 * A week with four upcoming games, each with one recommended pick, plus
 * the three-market leans on every game.
 */
export function sampleWeek() {
  const model = engineModel();
  const pairs = [[LV, KC], [SF, BUF], [CHI, DET], [KC, SF]];
  const games = pairs.slice(0, 3).map(([away, home], i) =>
    withEngine(game(`g${i + 1}`, away, home, { market: { books: books(OFF_MARKET[i]), pregameSpread: -3, pregameTotal: 44.5, moneyline: { home: -160, away: 140 }, booksCount: 6 } }), model));
  const board = { ...buildNflPicksV2({ games, now: NOW }), generatedAt: NOW.toISOString() };
  return { games, board };
}

/** A game that has kicked off, in the slate's shape. */
export function liveGame() {
  return {
    ...game('g9', KC, SF, { hoursOut: -1 }),
    status: 'live',
    teams: { away: { ...KC, score: 14 }, home: { ...SF, score: 10 } },
    gameState: { periodLabel: 'Q3 8:12', isLive: true },
    market: { pregameSpread: -2.5, pregameTotal: 47.5, moneyline: { home: -140, away: 120 }, booksCount: 6 },
  };
}

/** A recommended pick already in play, in getWeekPicksInPlay()'s shape. */
export function inPlayRow() {
  return {
    id: 'row-1', gameId: 'g9', market: 'runline', side: 'away', line: 2.5, price: -108, book: 'FanDuel',
    label: 'KC +2.5', tier: 'tier2', lockedAt: '2026-11-21T18:00:00Z', evAtLock: 0.031,
    why: 'FanDuel has KC +2.5 while the market is +2.',
    away: { slug: 'chiefs', abbrev: 'KC', name: 'Kansas City Chiefs', score: 14 },
    home: { slug: '49ers', abbrev: 'SF', name: 'San Francisco 49ers', score: 10 },
    startTime: '2026-11-22T11:00:00Z', gameStatus: 'live', clock: 'Q3 8:12',
    status: { state: 'live', verdict: 'ahead', text: 'KC up 4 at Q3 8:12, covering by 6.5 at +2.5.' },
    closingLine: 2, clvPoints: 0.5,
  };
}

export function scorecard() {
  const perf = (won, lost, units) => ({
    record: { won, lost, push: 0 }, winPct: Math.round((won / (won + lost)) * 1000) / 10,
    units, roiPct: Math.round((units / (won + lost)) * 1000) / 10, beatClosePct: 61.5, clvSample: 13, clvEvPct: 1.2, clvPoints: 0.4,
  });
  return {
    sport: 'nfl',
    window: { from: '2026-11-14', to: '2026-11-22', days: 9 },
    byPickRole: { hero: { won: 2, lost: 1, push: 0, pending: 1 }, tracking: { won: 9, lost: 10, push: 0, pending: 0 } },
    performance: { hero: perf(2, 1, 0.82), tracking: perf(9, 10, -1.9) },
    slates: [{
      date: '2026-11-16',
      picks: [
        { id: 'p1', pickRole: 'hero', status: 'won', label: 'DET -2.5', awayAbbrev: 'CHI', homeAbbrev: 'DET', slateDate: '2026-11-16', finalScore: 'CHI 17, DET 27', price: -105, book: 'DraftKings', review: { note: 'Covered by 7.5. The number held to close.' } },
        { id: 'p2', pickRole: 'hero', status: 'lost', label: 'Under 43.5', awayAbbrev: 'SF', homeAbbrev: 'BUF', slateDate: '2026-11-16', finalScore: 'SF 24, BUF 28', price: -110, book: 'BetRivers', review: null },
        { id: 'p3', pickRole: 'tracking', status: 'won', label: 'KC -3', awayAbbrev: 'LV', homeAbbrev: 'KC', slateDate: '2026-11-16', finalScore: 'LV 10, KC 24', price: -110, book: null, review: null },
      ],
    }],
    season: {
      record: { won: 30, lost: 27, push: 2 },
      byMarket: { moneyline: { won: 3, lost: 2, push: 0 }, runline: { won: 14, lost: 13, push: 1 }, total: { won: 13, lost: 12, push: 1 } },
      byPickRole: { hero: { won: 13, lost: 9, push: 1 }, tracking: { won: 17, lost: 18, push: 1 } },
      performance: { hero: perf(13, 9, 3.41), tracking: perf(17, 18, -2.2) },
      slates: 11,
      lastGradedDate: '2026-11-17',
    },
  };
}

/**
 * A connector over fixed data, counting calls. Pass overrides to replace
 * any method.
 */
export function fakeConnector(overrides = {}) {
  const { games, board } = sampleWeek();
  const calls = {};
  const count = (name, fn) => (...args) => { calls[name] = (calls[name] || 0) + 1; return fn(...args); };
  const asOfMs = NOW.getTime();
  const base = {
    league: 'nfl',
    picks: async () => ({ board, asOf: asOfMs, stale: false }),
    games: async () => ({ games: [...games, liveGame()], week: 12, slate: { games }, asOf: asOfMs }),
    inPlay: async () => ({ picks: [inPlayRow()], asOf: asOfMs }),
    record: async () => scorecard(),
    injuries: async (slug) => ({
      injuries: slug === 'chiefs'
        ? [{ name: 'Test Tackle', position: 'OT', status: 'out', statusLabel: 'Out', injury: 'Knee', comment: null }]
        : [],
      summary: { out: slug === 'chiefs' ? 1 : 0, doubtful: 0, questionable: 0, ir: 0 },
      asOf: asOfMs, stale: false,
    }),
    standings: async () => ({
      teams: {
        chiefs: { slug: 'chiefs', name: 'Kansas City Chiefs', record: '9-2', division: 'AFC West', divisionRank: 1, playoffSeed: 1, streak: 'W4', pointDiff: 88 },
        raiders: { slug: 'raiders', name: 'Las Vegas Raiders', record: '4-7', division: 'AFC West', divisionRank: 4, playoffSeed: null, streak: 'L2', pointDiff: -41 },
      },
      asOf: asOfMs,
    }),
  };
  const merged = { ...base, ...overrides };
  const connector = Object.fromEntries(Object.entries(merged).map(([k, v]) => [k, typeof v === 'function' ? count(k, v) : v]));
  return { connector, calls, board, games };
}

export const FREE = () => limitsFor('free');
export const PRO = () => limitsFor('pro');
export const newCtx = (connector, limits) => ({ connector, limits, cards: [], chips: null });
