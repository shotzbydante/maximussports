/**
 * NFL ratings loader — gathers the season's final scores and solves the
 * power ratings (src/features/nfl/picks/nflModel.js).
 *
 * One scoreboard request per completed week, fetched in parallel and cached:
 *   - in process for 30 minutes
 *   - in KV for 2 hours, plus a 7-day last-known-good copy
 * Completed weeks never change, so the only moving part is the week in
 * progress; the short in-process TTL picks up new finals on game days.
 *
 * If the weekly fetches all fail, ratings fall back to points for and
 * against from the standings feed and say so via `source: 'standings'`.
 */

import { createCache, coalesce } from '../_cache.js';
import { getJson, setJson } from '../_globalCache.js';
import { fetchScoreboardPage, SEASON_TYPE } from '../nfl/live/_normalize.js';
import { getNflStandings } from './nflStandings.js';
import { buildNflRatings } from '../../src/features/nfl/picks/nflModel.js';

const memo = createCache(30 * 60 * 1000);
const MEMO_KEY = 'nfl:ratings:v1';
const KV_KEY = 'nfl:ratings:v1';
const KV_LASTKNOWN = 'nfl:ratings:lastknown:v1';
const KV_TTL_SEC = 2 * 3600;
const KV_LASTKNOWN_TTL_SEC = 7 * 24 * 3600;
const REGULAR_SEASON_WEEKS = 18;

function toResult(g) {
  const home = g?.teams?.home;
  const away = g?.teams?.away;
  if (!home?.slug || !away?.slug) return null;
  if (!(g.gameState?.isFinal || g.status === 'final')) return null;
  if (!Number.isFinite(home.score) || !Number.isFinite(away.score)) return null;
  return {
    gameId: g.gameId,
    week: g.week,
    seasonType: g.seasonType,
    date: g.startTime,
    homeSlug: home.slug,
    awaySlug: away.slug,
    homeScore: home.score,
    awayScore: away.score,
    neutralSite: !!g.venue?.neutralSite,
  };
}

/**
 * Collect every final of the current season up to now.
 * @returns {Promise<{ results: Array, current: object, weeksFetched: number }>}
 */
export async function fetchSeasonResults() {
  const current = await fetchScoreboardPage();
  const results = new Map();
  for (const g of current.games) {
    const r = toResult(g);
    if (r) results.set(r.gameId, r);
  }

  const { week, seasonType, seasonYear } = current;
  let weeks = [];
  if (seasonType === SEASON_TYPE.REGULAR && week > 1) {
    weeks = Array.from({ length: week - 1 }, (_, i) => ({ week: i + 1, seasonType: SEASON_TYPE.REGULAR }));
  } else if (seasonType === SEASON_TYPE.POST) {
    weeks = [
      ...Array.from({ length: REGULAR_SEASON_WEEKS }, (_, i) => ({ week: i + 1, seasonType: SEASON_TYPE.REGULAR })),
      ...Array.from({ length: Math.max(0, (week || 1) - 1) }, (_, i) => ({ week: i + 1, seasonType: SEASON_TYPE.POST })),
    ];
  }

  let weeksFetched = 0;
  if (weeks.length > 0) {
    const pages = await Promise.all(
      weeks.map((w) => fetchScoreboardPage({ ...w, year: seasonYear })),
    );
    for (const page of pages) {
      if (page.ok) weeksFetched += 1;
      for (const g of page.games) {
        const r = toResult(g);
        if (r) results.set(r.gameId, r);
      }
    }
  }

  return { results: [...results.values()], current, weeksFetched, weeksExpected: weeks.length };
}

/**
 * Every regular-season game that has not gone final yet, from the current
 * week through Week 18. Feeds the season simulation.
 * @returns {Promise<{ remaining: Array<{homeSlug,awaySlug,week,neutralSite}>, complete: boolean }>}
 */
export async function fetchRemainingSchedule() {
  const current = await fetchScoreboardPage();
  if (current.seasonType !== SEASON_TYPE.REGULAR || !current.week) {
    return { remaining: [], complete: current.ok, week: current.week, seasonType: current.seasonType };
  }
  const futureWeeks = [];
  for (let w = current.week + 1; w <= REGULAR_SEASON_WEEKS; w++) futureWeeks.push(w);
  const pages = await Promise.all(
    futureWeeks.map((w) => fetchScoreboardPage({ week: w, seasonType: SEASON_TYPE.REGULAR, year: current.seasonYear })),
  );

  const seen = new Set();
  const remaining = [];
  for (const page of [current, ...pages]) {
    for (const g of page.games) {
      if (seen.has(g.gameId)) continue;
      seen.add(g.gameId);
      if (g.gameState?.isFinal || g.status === 'final' || g.status === 'postponed') continue;
      if (!g.teams?.home?.slug || !g.teams?.away?.slug) continue;
      remaining.push({
        homeSlug: g.teams.home.slug,
        awaySlug: g.teams.away.slug,
        week: g.week,
        neutralSite: !!g.venue?.neutralSite,
      });
    }
  }
  return {
    remaining,
    complete: current.ok && pages.every((p) => p.ok),
    week: current.week,
    seasonType: current.seasonType,
  };
}

/**
 * @param {object} [opts]
 * @param {boolean} [opts.force] — skip caches
 * @returns {Promise<{ teams, leaguePpg, source, games, week, seasonType, seasonYear, generatedAt, cache }>}
 */
export async function getNflRatings({ force = false } = {}) {
  if (!force) {
    const hit = memo.get(MEMO_KEY);
    if (hit) return { ...hit, cache: 'memory' };
    const kv = await getJson(KV_KEY).catch(() => null);
    if (kv?.teams && Object.keys(kv.teams).length > 0) {
      memo.set(MEMO_KEY, kv);
      return { ...kv, cache: 'kv' };
    }
  }

  try {
    const built = await coalesce(MEMO_KEY, async () => {
      const [season, standings] = await Promise.all([
        fetchSeasonResults().catch(() => null),
        getNflStandings().catch(() => null),
      ]);

      // Only trust the game log when most weeks arrived; a partial log
      // would rate teams on a lopsided sample of their schedule.
      const complete = season && (season.weeksExpected === 0
        || season.weeksFetched >= Math.ceil(season.weeksExpected * 0.8));
      // Preseason games say nothing about regular-season strength.
      const usable = complete
        ? season.results.filter((r) => r.seasonType !== 1)
        : [];

      const ratings = buildNflRatings(usable, { standings: standings?.teams || null });
      return {
        ...ratings,
        // Finals behind the ratings, kept so the season simulation can
        // rebuild head-to-head, division and conference records.
        results: usable.map(({ homeSlug, awaySlug, homeScore, awayScore, week }) => ({ homeSlug, awaySlug, homeScore, awayScore, week })),
        week: season?.current?.week ?? null,
        seasonType: season?.current?.seasonType ?? null,
        seasonYear: season?.current?.seasonYear ?? standings?.season ?? null,
        generatedAt: new Date().toISOString(),
      };
    });

    if (Object.keys(built.teams || {}).length > 0) {
      memo.set(MEMO_KEY, built);
      setJson(KV_KEY, built, { exSeconds: KV_TTL_SEC }).catch(() => {});
      setJson(KV_LASTKNOWN, built, { exSeconds: KV_LASTKNOWN_TTL_SEC }).catch(() => {});
      return { ...built, cache: 'fresh' };
    }
  } catch (err) {
    console.warn('[nflRatings] build failed:', err?.message);
  }

  const lastKnown = await getJson(KV_LASTKNOWN).catch(() => null);
  if (lastKnown?.teams) return { ...lastKnown, cache: 'lastknown' };

  return { teams: {}, leaguePpg: null, source: 'none', games: 0, week: null, seasonType: null, seasonYear: null, generatedAt: new Date().toISOString(), cache: 'empty' };
}
