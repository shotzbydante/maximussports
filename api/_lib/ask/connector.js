/**
 * Ask Maximus data connector.
 *
 * Everything the agent knows about football comes through this interface.
 * The agent and its tools import only `getConnector()`; no provider code
 * (ESPN, the odds feed, nflverse, Supabase) lives outside a connector.
 * Adding the NBA is a second connector, not a change to the agent.
 *
 * @typedef {object} AskDataConnector
 * @property {string} league
 * @property {() => Promise<{ board: object|null, asOf: number|null, stale: boolean }>} picks
 *           the week's picks board for games still to be played
 * @property {() => Promise<{ games: Array, week: number|null, asOf: number }>} games
 *           every game this week with score, state and consensus lines
 * @property {() => Promise<{ picks: Array, asOf: number }>} inPlay
 *           this week's recommended picks whose games have kicked off
 * @property {() => Promise<object|null>} record
 *           graded record: season, recent window and closing-line value
 * @property {(teamSlug: string) => Promise<{ injuries: Array, summary: object, asOf: number|null, stale: boolean }>} injuries
 * @property {() => Promise<{ teams: object, asOf: number|null }>} standings
 *
 * Each call is made at most once per turn: a connector instance memoizes
 * its results, and the route creates one per request.
 */

import { getNflSlate } from '../nflSlate.js';
import { buildNflPicksBoard, getLatestNflPicksBoard } from '../nflPicksBuilder.js';
import { getWeekPicksInPlay } from '../nflWeekPicks.js';
import { getNflInjuries, summarizeTeamInjuries } from '../nflInjuries.js';
import { getNflStandings } from '../nflStandings.js';
import scorecardHandler from '../../nfl/picks/scorecard.js';

/** A stored board newer than this is used as is, without building. */
const BOARD_FRESH_MS = 15 * 60 * 1000;
/** How long a turn waits for a fresh board before falling back to the stored one. */
const BOARD_BUILD_WAIT_MS = 20_000;

const ms = (iso) => {
  const t = Date.parse(iso || '');
  return Number.isFinite(t) ? t : null;
};

/** Run one of our own JSON route handlers in-process and return what it sent. */
export function callJsonHandler(handler, query = {}) {
  return new Promise((resolve, reject) => {
    const res = {
      setHeader() { return res; },
      status() { return res; },
      json(body) { resolve(body); return res; },
      end() { resolve(null); return res; },
    };
    Promise.resolve(handler({ method: 'GET', query, headers: {} }, res)).catch(reject);
  });
}

function withTimeout(promise, waitMs) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(null), waitMs)),
  ]);
}

/**
 * The NFL connector, over the same builders the NFL pages use.
 *
 * `deps` exists for tests; production passes nothing.
 */
export function createNflConnector(deps = {}) {
  const d = {
    getSlate: getNflSlate,
    getLatestBoard: getLatestNflPicksBoard,
    buildBoard: buildNflPicksBoard,
    getInPlay: getWeekPicksInPlay,
    getInjuries: getNflInjuries,
    getStandings: getNflStandings,
    getScorecard: () => callJsonHandler(scorecardHandler, { days: '9' }),
    now: () => Date.now(),
    ...deps,
  };
  const memo = new Map();
  const once = (key, fn) => {
    if (!memo.has(key)) memo.set(key, Promise.resolve().then(fn));
    return memo.get(key);
  };

  return {
    league: 'nfl',

    picks: () => once('picks', async () => {
      const stored = await d.getLatestBoard().catch(() => null);
      const storedAt = ms(stored?.generatedAt);
      if (stored && storedAt != null && d.now() - storedAt <= BOARD_FRESH_MS) {
        return { board: stored, asOf: storedAt, stale: false };
      }
      // Same call the picks page makes, so chat can never publish or lock
      // anything the page would not.
      const built = await withTimeout(d.buildBoard().catch(() => null), BOARD_BUILD_WAIT_MS);
      const fresh = built?.board;
      if (fresh && built.source !== 'empty') {
        const at = ms(fresh.generatedAt) ?? d.now();
        return { board: fresh, asOf: at, stale: d.now() - at > BOARD_FRESH_MS };
      }
      if (stored) return { board: stored, asOf: storedAt, stale: true };
      return { board: fresh || null, asOf: fresh ? d.now() : null, stale: false };
    }),

    games: () => once('games', async () => {
      const slate = await d.getSlate();
      return { games: slate?.games || [], week: slate?.week ?? null, slate, asOf: d.now() };
    }),

    inPlay() {
      return once('inPlay', async () => {
        const { slate } = await this.games();
        const { picks } = await d.getInPlay(slate);
        return { picks: picks || [], asOf: d.now() };
      });
    },

    record: () => once('record', async () => {
      const card = await d.getScorecard().catch(() => null);
      return card && !card._error ? card : null;
    }),

    injuries: (teamSlug) => once(`injuries:${teamSlug}`, async () => {
      const data = await d.getInjuries();
      const injuries = data?.teams?.[teamSlug] || [];
      return {
        injuries,
        summary: summarizeTeamInjuries(injuries),
        asOf: ms(data?.generatedAt),
        stale: !!data?.stale || data?.ok === false,
      };
    }),

    standings: () => once('standings', async () => {
      const data = await d.getStandings();
      return { teams: data?.teams || {}, asOf: ms(data?.generatedAt), stale: !!data?.stale };
    }),
  };
}

/** The connector for a league. NFL is the only one today. */
export function getConnector(league = 'nfl') {
  if (league !== 'nfl') throw new Error(`No Ask Maximus connector for ${league}`);
  return createNflConnector();
}
