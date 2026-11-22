/**
 * NFL model data — loads nflverse files, builds the week's ratings,
 * quarterback table and unit grades, and caches the lot.
 *
 * Source files (https://github.com/nflverse/nflverse-data, CC BY 4.0):
 *   schedules/games.csv                  results, starters, rest, roof, coaches
 *   stats_team/stats_team_week_Y.csv     team EPA by game
 *   stats_player/stats_player_week_Y.csv quarterback EPA by game
 *
 * nflverse refreshes overnight after each game day. Finished seasons never
 * change, so their reduced rows sit in KV for a month; the season in
 * progress is re-pulled every three hours. If a pull fails, the last good
 * copy (kept a week) is used and the model says how old it is.
 *
 * ESPN stays the source for the live schedule, scores, injuries and the
 * current week. nflverse is only read for what ESPN does not carry.
 */

import { createCache, coalesce } from '../_cache.js';
import { getJson, setJson } from '../_globalCache.js';
import {
  NFLVERSE_BASE, parseGames, parseTeamWeeks, parseQbWeeks, parseCoachGames,
} from '../../src/features/nfl/data/nflverse.js';
import { buildRatings, RATING_PARAMS } from '../../src/features/nfl/picks/v2/ratings.js';
import { buildQbTable, indexQbWeeks, QB_PARAMS } from '../../src/features/nfl/picks/v2/qb.js';
import { buildUnitGrades } from '../../src/features/nfl/picks/v2/units.js';

export const NFL_ENGINE_DATA_VERSION = 'v2';
const FETCH_TIMEOUT_MS = 20_000;
const MEMO_TTL_MS = 30 * 60 * 1000;
const CURRENT_TTL_SEC = 3 * 3600;
const PAST_TTL_SEC = 30 * 24 * 3600;
const LASTKNOWN_TTL_SEC = 7 * 24 * 3600;
const LOOKBACK = Math.max(RATING_PARAMS.lookbackSeasons, QB_PARAMS.lookbackSeasons);

const memo = createCache(MEMO_TTL_MS);
// A failed build is remembered briefly so a GitHub outage is not retried on every request.
const failed = createCache(2 * 60 * 1000);
let lastFetch = { ok: null, at: null, error: null, files: {} };

/** Health view of the last nflverse pull this instance made. */
export function getNflverseStatus() { return lastFetch; }

async function fetchText(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), redirect: 'follow' });
  if (!r.ok) throw new Error(`nflverse ${r.status} for ${url.split('/').slice(-2).join('/')}`);
  return r.text();
}

/** KV-backed loader for one reduced file. */
async function cached(key, ttlSec, load) {
  const hit = await getJson(key).catch(() => null);
  if (hit?.rows && Date.now() - (hit.at || 0) < ttlSec * 1000) return { rows: hit.rows, extra: hit.extra, at: hit.at, cache: 'kv' };
  try {
    const { rows, extra } = await load();
    const value = { at: Date.now(), rows, extra };
    setJson(key, value, { exSeconds: Math.max(ttlSec, LASTKNOWN_TTL_SEC) }).catch(() => {});
    lastFetch.files[key] = { ok: true, at: new Date().toISOString(), rows: rows.length };
    return { ...value, cache: 'fresh' };
  } catch (err) {
    lastFetch.files[key] = { ok: false, at: new Date().toISOString(), error: err?.message };
    if (hit?.rows) return { rows: hit.rows, extra: hit.extra, at: hit.at, cache: 'stale' };
    throw err;
  }
}

/** The NFL season a date falls in (the season that started the previous fall, through February). */
export function seasonForDate(now = new Date()) {
  const y = now.getUTCFullYear();
  return now.getUTCMonth() <= 1 ? y - 1 : y;
}

/** ESPN (seasonType, week) → nflverse week (playoffs run 19 to 22). */
export function nflverseWeek({ seasonType, week }) {
  if (seasonType === 3) return week >= 5 ? 22 : 18 + Math.max(1, week || 1);
  return week || 1;
}

async function loadRows(season) {
  const seasons = [];
  for (let y = season - LOOKBACK; y <= season; y++) seasons.push(y);
  const ttl = (y) => (y === season ? CURRENT_TTL_SEC : PAST_TTL_SEC);
  const v = NFL_ENGINE_DATA_VERSION;

  const [gamesRes, teamRes, qbRes] = await Promise.all([
    cached(`nfl:nflverse:${v}:games:${season}`, CURRENT_TTL_SEC, async () => {
      const text = await fetchText(`${NFLVERSE_BASE}/schedules/games.csv`);
      return { rows: parseGames(text, { fromSeason: season - LOOKBACK }), extra: { coachGames: parseCoachGames(text) } };
    }),
    Promise.all(seasons.map((y) => cached(`nfl:nflverse:${v}:team:${y}`, ttl(y), async () => ({
      rows: parseTeamWeeks(await fetchText(`${NFLVERSE_BASE}/stats_team/stats_team_week_${y}.csv`)),
    })))),
    Promise.all(seasons.map((y) => cached(`nfl:nflverse:${v}:qb:${y}`, ttl(y), async () => ({
      rows: parseQbWeeks(await fetchText(`${NFLVERSE_BASE}/stats_player/stats_player_week_${y}.csv`)),
    })))),
  ]);

  const stale = [gamesRes, ...teamRes, ...qbRes].some((r) => r.cache === 'stale');
  return {
    games: gamesRes.rows,
    coachGames: gamesRes.extra?.coachGames || {},
    teamWeeks: teamRes.flatMap((r) => r.rows),
    qbWeeks: qbRes.flatMap((r) => r.rows),
    fetchedAt: Math.min(gamesRes.at, ...teamRes.map((r) => r.at), ...qbRes.map((r) => r.at)),
    stale,
  };
}

/**
 * Build the model for a week from already-loaded rows. Exported for tests
 * and the backtest; no I/O.
 */
export function buildModelFromRows({ games, teamWeeks, qbWeeks, coachGames = {}, asOf }) {
  const ratings = buildRatings({ games, teamWeeks, asOf });
  const qbTable = buildQbTable({ qbWeeks, asOf });
  const qbIndex = indexQbWeeks(qbWeeks);
  const unitGrades = buildUnitGrades({ teamWeeks, asOf });

  const schedule = {};
  const nextDivisional = {};
  const upcomingByTeam = {};
  for (const g of games) {
    if (g.season !== asOf.season) continue;
    if (g.espnId) schedule[String(g.espnId)] = g;
    if (g.week > asOf.week) {
      for (const t of [g.home, g.away]) {
        if (!upcomingByTeam[t] || g.week < upcomingByTeam[t].week) upcomingByTeam[t] = g;
      }
    }
  }
  for (const [t, g] of Object.entries(upcomingByTeam)) nextDivisional[t] = !!g.divisional;

  const played = games.filter((g) => g.season === asOf.season && g.homeScore != null);
  const lastPlayedWeek = played.length ? Math.max(...played.map((g) => g.week)) : 0;
  const reasons = [];
  const teamCount = Object.keys(ratings.teams).length;
  if (teamCount < 32) reasons.push(`ratings cover ${teamCount} of 32 teams`);
  if (ratings.epaCoverage < 0.8) reasons.push(`EPA is on file for ${Math.round(ratings.epaCoverage * 100)}% of rated games`);
  if (qbTable.byId.size === 0) reasons.push('no quarterback data');

  return {
    ok: teamCount >= 32 && qbTable.byId.size > 0,
    version: NFL_ENGINE_DATA_VERSION,
    asOf,
    ratings, qbTable, qbIndex, unitGrades, unitSource: 'nflverse',
    schedule, nextDivisional, coachGames,
    lastPlayedWeek,
    // Weeks of finished games the files have not caught up with. Zero when
    // this week's Thursday game is already in.
    behind: Math.max(0, asOf.week - 1 - lastPlayedWeek),
    reasons,
  };
}

/**
 * @param {object} args
 * @param {number} [args.seasonYear]  ESPN season year (defaults from today's date)
 * @param {number} [args.seasonType]  ESPN season type
 * @param {number} [args.week]        ESPN week
 * @returns {Promise<object>} model, or `{ ok:false, reasons:[...] }`; never throws
 */
export async function getNflModelData({ seasonYear, seasonType = 2, week, force = false } = {}) {
  const season = seasonYear || seasonForDate();
  const asOf = { season, week: nflverseWeek({ seasonType, week }) };
  const key = `nfl:model:${NFL_ENGINE_DATA_VERSION}:${asOf.season}:${asOf.week}`;
  if (!force) {
    const hit = memo.get(key) || failed.get(key);
    if (hit) return hit;
  }
  try {
    const model = await coalesce(key, async () => {
      const rows = await loadRows(season);
      const built = buildModelFromRows({ ...rows, asOf });
      const ageHours = Math.round((Date.now() - rows.fetchedAt) / 360_000) / 10;
      if (rows.stale) built.reasons.push(`nflverse could not be refreshed; using a copy ${ageHours} hours old`);
      if (built.behind > 0) built.reasons.push(`nflverse is ${built.behind} week${built.behind === 1 ? '' : 's'} behind the schedule`);
      return { ...built, source: { name: 'nflverse', license: 'CC BY 4.0', fetchedAt: new Date(rows.fetchedAt).toISOString(), ageHours, stale: rows.stale } };
    });
    lastFetch = { ...lastFetch, ok: true, at: new Date().toISOString(), error: null };
    if (model.ok) memo.set(key, model); else failed.set(key, model);
    return model;
  } catch (err) {
    lastFetch = { ...lastFetch, ok: false, at: new Date().toISOString(), error: err?.message };
    console.warn('[nflModelData] build failed:', err?.message);
    const down = { ok: false, version: NFL_ENGINE_DATA_VERSION, asOf, reasons: [`nflverse unavailable: ${err?.message || 'unknown error'}`] };
    failed.set(key, down);
    return down;
  }
}
