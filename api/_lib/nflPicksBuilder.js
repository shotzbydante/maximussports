/**
 * nflPicksBuilder — direct in-process NFL picks board builder.
 *
 * Mirrors mlbPicksBuilder / nbaPicksBuilder: the HTTP handler and any
 * in-process caller (briefing, email, content studio) call this function
 * rather than HTTP self-fetching the endpoint.
 *
 * Fallback precedence:
 *   1. Fresh build from the current-week slate (ESPN + consensus odds) and
 *      the season power ratings
 *   2. KV latest snapshot (15 min)
 *   3. KV last-known-good snapshot (72 h — covers the Tuesday gap before
 *      next week's lines are posted)
 *   4. Empty board
 *
 * Persistence
 * -----------
 * The picks tables are keyed by one calendar date per slate, and the
 * settlement cron grades one date at a time. An NFL week spans Thursday to
 * Monday, so picks are written per kickoff date (ET), not per build date:
 * Sunday's picks land on Sunday's slate and are graded Monday morning.
 * A game is only persisted once kickoff is within PERSIST_WINDOW_HOURS, so
 * the number that gets graded is close to the closing line rather than a
 * Tuesday opener, and writes are throttled to one run per slate per
 * PERSIST_THROTTLE_MS.
 */

import { getNflSlate } from './nflSlate.js';
import { getJson, setJson } from '../_globalCache.js';
import { writePicksRun, getActiveConfig, getLatestGradedScorecard } from './picksHistory.js';
import { etDayFromISO } from './dateWindows.js';
import {
  buildNflPicksV2, NFL_DEFAULT_CONFIG, NFL_MODEL_VERSION,
} from '../../src/features/nfl/picks/buildNflPicksV2.js';

const KV_LATEST = `nfl:picks:built:latest:${NFL_MODEL_VERSION}`;
const KV_LASTKNOWN = `nfl:picks:built:lastknown:${NFL_MODEL_VERSION}`;
const LATEST_TTL_SEC = 15 * 60;
const LASTKNOWN_TTL_SEC = 72 * 60 * 60;

export const PERSIST_WINDOW_HOURS = 36;
const PERSIST_THROTTLE_MS = 30 * 60 * 1000;
const PERSIST_WAIT_MS = 8000;
const TRACKING_BLOCK_KEY = 'nfl:picks:trackingBlocked:v1';
const TRACKING_BLOCK_TTL_SEC = 6 * 3600;
let trackingBlockedUntil = 0;
const lastPersistAt = new Map(); // slateDate → epoch ms

function countPicks(board) {
  return Array.isArray(board?.fullSlatePicks) ? board.fullSlatePicks.length : 0;
}

function getCounts(board) {
  const c = board?.categories || {};
  return {
    pickEms: c.pickEms?.length || 0,
    ats: c.ats?.length || 0,
    leans: c.leans?.length || 0,
    totals: c.totals?.length || 0,
    hero: board?.heroPicks?.length || 0,
    fullSlate: countPicks(board),
  };
}

/**
 * Split a board into one persistable payload per kickoff date.
 * Exported for tests.
 *
 * @returns {Array<{ date: string, payload: object }>}
 */
export function splitBoardBySlateDate(board, { now = Date.now(), windowHours = PERSIST_WINDOW_HOURS } = {}) {
  const horizon = now + windowHours * 3_600_000;
  const groups = new Map();

  for (const pick of board?.fullSlatePicks || []) {
    const kick = Date.parse(pick?.matchup?.startTime || '');
    if (!Number.isFinite(kick) || kick <= now || kick > horizon) continue;
    const date = etDayFromISO(pick.matchup.startTime);
    if (!date) continue;
    if (!groups.has(date)) groups.set(date, []);
    groups.get(date).push(pick);
  }

  return [...groups.entries()].map(([date, picks]) => {
    const ids = new Set(picks.map((p) => p.id));
    const inDate = (arr) => (arr || []).filter((p) => ids.has(p.id));
    return {
      date,
      payload: {
        sport: 'nfl',
        date,
        week: board.week ?? null,
        modelVersion: board.modelVersion,
        configVersion: board.configVersion,
        generatedAt: board.generatedAt,
        meta: { ...(board.meta || {}), week: board.week ?? null, persistedPicks: picks.length },
        tiers: {
          tier1: inDate(board.tiers?.tier1),
          tier2: inDate(board.tiers?.tier2),
          tier3: inDate(board.tiers?.tier3),
        },
        fullSlatePicks: picks,
      },
    };
  });
}

const VALID_HERO_TIERS = new Set(['tier1', 'tier2', 'tier3']);
const isHero = (p) => VALID_HERO_TIERS.has(p?.tier) && p?.pickRole !== 'tracking';

function withPicks(payload, picks, part) {
  return {
    ...payload,
    meta: { ...(payload.meta || {}), persistedPicks: picks.length, part },
    fullSlatePicks: picks,
  };
}

async function trackingBlocked(now) {
  if (now < trackingBlockedUntil) return true;
  const stored = await getJson(TRACKING_BLOCK_KEY).catch(() => null);
  if (stored?.until > now) { trackingBlockedUntil = stored.until; return true; }
  return false;
}

function isTierConstraintFailure(r) {
  return (r?.failures || []).some((f) => f?.code === '23514' || /picks_tier_check/.test(f?.message || ''));
}

/**
 * Save one slate. Recommended picks and tracking picks go in separate
 * runs: the recommended picks fit the original picks.tier constraint and
 * must never be held up by it, while a database that has not had
 * docs/nfl-picks-migration.sql applied rejects every tracking row. When
 * that happens the tracking write is skipped for a few hours instead of
 * failing row by row on every build.
 */
async function persistSlate(date, payload, now) {
  const hero = payload.fullSlatePicks.filter(isHero);
  const tracking = payload.fullSlatePicks.filter((p) => !isHero(p));
  let ok = true;

  if (hero.length > 0) {
    const r = await writePicksRun(withPicks(payload, hero, 'recommended'));
    if (r && !r.ok && r.reason !== 'no_supabase') {
      ok = false;
      console.error(
        `[nflPicksBuilder] persist failed slate=${date} part=recommended reason=${r.reason} ` +
        `inserted=${r.picksInserted ?? 0}/${r.picksAttempted ?? 0} first="${r.failures?.[0]?.message || 'n/a'}"`
      );
    }
    if (r?.reason === 'no_supabase') return true;
  }

  if (tracking.length > 0 && !(await trackingBlocked(now))) {
    const r = await writePicksRun(withPicks(payload, tracking, 'tracking'));
    if (r && !r.ok && isTierConstraintFailure(r)) {
      trackingBlockedUntil = now + TRACKING_BLOCK_TTL_SEC * 1000;
      setJson(TRACKING_BLOCK_KEY, { until: trackingBlockedUntil }, { exSeconds: TRACKING_BLOCK_TTL_SEC }).catch(() => {});
      console.error(
        '[nflPicksBuilder] tracking picks rejected by picks_tier_check. ' +
        'Run docs/nfl-picks-migration.sql in Supabase; recommended picks are unaffected. ' +
        `Skipping tracking writes for ${TRACKING_BLOCK_TTL_SEC / 3600}h.`
      );
    } else if (r && !r.ok && r.reason !== 'no_supabase') {
      ok = false;
      console.error(
        `[nflPicksBuilder] persist failed slate=${date} part=tracking reason=${r.reason} ` +
        `inserted=${r.picksInserted ?? 0}/${r.picksAttempted ?? 0} first="${r.failures?.[0]?.message || 'n/a'}"`
      );
    }
  }
  return ok;
}

/** Exported for tests. */
export async function persistBoard(board) {
  const now = Date.now();
  for (const { date, payload } of splitBoardBySlateDate(board, { now })) {
    const last = lastPersistAt.get(date) || 0;
    if (now - last < PERSIST_THROTTLE_MS) continue;
    lastPersistAt.set(date, now);
    try {
      const ok = await persistSlate(date, payload, now);
      // Let the next build retry instead of waiting out the throttle.
      if (!ok) lastPersistAt.delete(date);
    } catch (err) {
      console.error(`[nflPicksBuilder] persist threw slate=${date}: ${err?.message}`);
      lastPersistAt.delete(date);
    }
  }
}

/**
 * @param {object} [opts]
 * @param {boolean} [opts.preferFresh=false] — ignore the KV latest snapshot
 * @returns {Promise<{ board, source, counts }>}
 */
export async function buildNflPicksBoard({ preferFresh = false } = {}) {
  let freshBoard = null;
  let freshError = null;

  try {
    const slate = await getNflSlate();

    let config = NFL_DEFAULT_CONFIG;
    try {
      const dbCfg = await getActiveConfig({ sport: 'nfl' });
      if (dbCfg) config = { ...NFL_DEFAULT_CONFIG, ...dbCfg };
    } catch (e) { console.warn(`[nflPicksBuilder] getActiveConfig failed: ${e?.message}`); }

    let scorecardSummary = null;
    try {
      const card = await getLatestGradedScorecard({ sport: 'nfl', lookbackDays: 14 });
      if (card) {
        scorecardSummary = {
          date: card.slate_date,
          overall: card.record,
          byMarket: card.by_market,
          byTier: card.by_tier,
          topPlayResult: card.top_play_result,
          streak: card.streak,
          note: card.note,
          isFallback: true,
        };
      }
    } catch { /* non-fatal */ }

    freshBoard = {
      ...buildNflPicksV2({ games: slate.games, ratings: slate.ratings, config, scorecardSummary }),
      byeTeams: slate.byeTeams || [],
      _debug: {
        totalGames: slate.games.length,
        ratingSource: slate.ratings?.source || 'none',
        ratingCache: slate.ratings?.cache || null,
      },
    };

    const freshCount = countPicks(freshBoard);
    console.log(
      `[nflPicksBuilder] fresh build: week=${freshBoard.week} fullSlate=${freshCount} ` +
      `t1=${freshBoard.tiers.tier1.length} t2=${freshBoard.tiers.tier2.length} t3=${freshBoard.tiers.tier3.length} ` +
      `ratings=${slate.ratings?.source || 'none'}`
    );

    if (freshCount > 0) {
      setJson(KV_LATEST, freshBoard, { exSeconds: LATEST_TTL_SEC }).catch(() => {});
      setJson(KV_LASTKNOWN, freshBoard, { exSeconds: LASTKNOWN_TTL_SEC }).catch(() => {});
      // Waited on, with a cap. A serverless function can be frozen the
      // moment it responds, and a write left running in the background was
      // observed never to finish. Writes are throttled to one per slate
      // per half hour, so almost every request skips this entirely.
      await Promise.race([
        persistBoard(freshBoard),
        new Promise((resolve) => setTimeout(resolve, PERSIST_WAIT_MS)),
      ]).catch((err) => console.error(`[nflPicksBuilder] persist: ${err?.message}`));
      return { board: freshBoard, source: 'fresh', counts: getCounts(freshBoard) };
    }
  } catch (err) {
    freshError = err.message;
    console.warn(`[nflPicksBuilder] fresh build failed: ${err.message}`);
  }

  // A fresh build with games but no upcoming ones (every game in the week
  // is live or final) is a correct empty board — do not paper over it with
  // an older snapshot of picks that have already kicked off.
  const weekInProgress = (freshBoard?._debug?.totalGames || 0) > 0;
  if (!weekInProgress) {
    for (const [key, source] of [[KV_LATEST, 'kv_latest'], [KV_LASTKNOWN, 'kv_lastknown']]) {
      if (preferFresh && source === 'kv_latest') continue;
      try {
        const snap = await getJson(key);
        if (countPicks(snap) > 0 && snap.modelVersion === NFL_MODEL_VERSION) {
          return { board: snap, source, counts: getCounts(snap) };
        }
      } catch (err) {
        console.warn(`[nflPicksBuilder] ${source} read failed: ${err.message}`);
      }
    }
  }

  const emptyBoard = freshBoard || {
    sport: 'nfl',
    tiers: { tier1: [], tier2: [], tier3: [] },
    coverage: [], fullSlatePicks: [], heroPicks: [], trackingPicks: [], byGame: [],
    categories: { pickEms: [], ats: [], leans: [], totals: [] },
    topPick: null,
    meta: { totalCandidates: 0, qualifiedGames: 0, skippedGames: 0, picksPublished: 0, flags: [] },
    modelVersion: NFL_MODEL_VERSION,
    generatedAt: new Date().toISOString(),
    _error: freshError || 'no data available',
  };
  return { board: emptyBoard, source: 'empty', counts: getCounts(emptyBoard) };
}
