/**
 * nflPicksBuilder — direct in-process NFL picks board builder.
 *
 * Mirrors mlbPicksBuilder / nbaPicksBuilder: the HTTP handler, the cron and
 * any in-process caller (briefing, email, content studio) call this
 * function rather than HTTP self-fetching the endpoint.
 *
 * Each fresh build:
 *   1. loads the slate (ESPN schedule and injuries, per-book odds, nflverse
 *      model data, kickoff weather) and prices every market
 *   2. lays stored locks over the board, so a pick published earlier shows
 *      the ticket it was published at
 *   3. in production, locks any newly recommended pick, locks the model's
 *      lean on each remaining market a day before kickoff, and snapshots
 *      every game's consensus line (the last one before kickoff is the close)
 *
 * Fallback precedence: fresh build, then the KV latest snapshot (15 min),
 * then the KV last-known-good snapshot (72 h), then an empty board.
 *
 * Writes happen only in production. Preview deployments share the
 * production database, and a preview that locked picks would be writing
 * the public record from unreleased code. Set NFL_PICKS_PERSIST=1 to
 * override (for example on a staging project with its own database).
 */

import { getNflSlate } from './nflSlate.js';
import { getNflConfig } from './nflConfig.js';
import { getJson, setJson } from '../_globalCache.js';
import { getLatestGradedScorecard } from './picksHistory.js';
import { getLockedPicks, lockPicks, saveLineSnapshots } from './nflPicksStore.js';
import { applyLocks } from '../../src/features/nfl/picks/v2/locks.js';
import {
  buildNflPicksV2, NFL_DEFAULT_CONFIG, NFL_MODEL_VERSION,
} from '../../src/features/nfl/picks/buildNflPicksV2.js';

const KV_LATEST = `nfl:picks:built:latest:${NFL_MODEL_VERSION}`;
const KV_LASTKNOWN = `nfl:picks:built:lastknown:${NFL_MODEL_VERSION}`;
const LATEST_TTL_SEC = 15 * 60;
const LASTKNOWN_TTL_SEC = 72 * 60 * 60;

/** Hours before kickoff at which the model's lean on a market is locked for grading. */
export const TRACKING_LOCK_HOURS = 24;
const PERSIST_WAIT_MS = 9000;
const SNAPSHOT_THROTTLE_MS = 4 * 60 * 1000;
let lastSnapshotAt = 0;

export function canPersist() {
  return process.env.VERCEL_ENV === 'production' || process.env.NFL_PICKS_PERSIST === '1';
}

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
    locked: board?.meta?.lockedPicks || 0,
    fullSlate: countPicks(board),
  };
}

/**
 * Which picks on a board should be locked now. Exported for tests.
 * @returns {{ hero: Array, tracking: Array }}
 */
export function picksToLock(board, lockedRows = [], { now = Date.now(), trackingLockHours = TRACKING_LOCK_HOURS } = {}) {
  const lockedHero = new Set();
  const lockedTracking = new Set();
  for (const r of lockedRows) {
    if (!r?.locked_at) continue;
    (r.tier === 'tracking' ? lockedTracking : lockedHero).add(`${r.game_id}|${r.market_type}`);
  }
  const future = (p) => Date.parse(p?.matchup?.startTime || '') > now;
  const hero = (board?.heroPicks || []).filter((p) => !p.lock && future(p) && !lockedHero.has(`${p.gameId}|${p.market.type}`));
  const heroNow = new Set([...lockedHero, ...hero.map((p) => `${p.gameId}|${p.market.type}`)]);
  const horizon = now + trackingLockHours * 3_600_000;
  const tracking = (board?.trackingPicks || []).filter((p) => {
    const k = `${p.gameId}|${p.market.type}`;
    const kick = Date.parse(p?.matchup?.startTime || '');
    return future(p) && kick <= horizon && !lockedTracking.has(k) && !heroNow.has(k);
  });
  return { hero, tracking };
}

async function persist(board, lockedRows, season) {
  const now = new Date();
  const { hero, tracking } = picksToLock(board, lockedRows, { now: now.getTime() });
  const result = { hero: null, tracking: null, snapshots: null };
  if (hero.length > 0) {
    result.hero = await lockPicks({ picks: hero, role: 'hero', board, now });
    const done = new Set(result.hero.locked);
    for (const p of hero) {
      if (!done.has(p.id)) continue;
      p.lock = { lockedAt: now.toISOString(), line: p.market.line, price: p.market.priceAmerican, book: p.book?.title || null, evAtLock: p.ev, evNow: p.ev, fairPriceNow: p.fair?.priceAmerican ?? null };
    }
  }
  if (tracking.length > 0) result.tracking = await lockPicks({ picks: tracking, role: 'tracking', board, now });
  if (now.getTime() - lastSnapshotAt > SNAPSHOT_THROTTLE_MS) {
    lastSnapshotAt = now.getTime();
    result.snapshots = await saveLineSnapshots(board.byGame, { now, week: board.week, season });
    if (!result.snapshots.ok) lastSnapshotAt = 0;
  }
  return result;
}

/**
 * The most recent board already built, without building one. For callers
 * that only want to quote the picks (the written briefing): no feeds are
 * pulled and nothing is locked.
 * @returns {Promise<object|null>}
 */
export async function getLatestNflPicksBoard() {
  for (const key of [KV_LATEST, KV_LASTKNOWN]) {
    try {
      const snap = await getJson(key);
      if (snap && snap.modelVersion === NFL_MODEL_VERSION) return snap;
    } catch { /* fall through */ }
  }
  return null;
}

/**
 * @param {object} [opts]
 * @param {boolean} [opts.preferFresh=false] — ignore the KV latest snapshot
 * @returns {Promise<{ board, source, counts }>}
 */
export async function buildNflPicksBoard({ preferFresh = false, modelWaitMs = 25_000 } = {}) {
  let freshBoard = null;
  let freshError = null;

  try {
    const [slate, config] = await Promise.all([getNflSlate({ modelWaitMs }), getNflConfig()]);

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

    const built = buildNflPicksV2({ games: slate.games, config: config || NFL_DEFAULT_CONFIG, scorecardSummary });
    const gameIds = (built.byGame || []).map((g) => g.gameId);
    const locks = await getLockedPicks(gameIds);
    freshBoard = {
      ...applyLocks(built, locks.rows, { maxPerTier: config?.maxPerTier, maxPerGame: config?.maxPerGame }),
      byeTeams: slate.byeTeams || [],
      engine: slate.engine || null,
      _debug: {
        totalGames: slate.games.length,
        engineOk: !!slate.engine?.ok,
        engineReasons: slate.engine?.reasons || [],
        locksRead: locks.ok,
        persist: canPersist(),
      },
    };

    const freshCount = countPicks(freshBoard);
    console.log(
      `[nflPicksBuilder] fresh build: week=${freshBoard.week} fullSlate=${freshCount} ` +
      `t1=${freshBoard.tiers.tier1.length} t2=${freshBoard.tiers.tier2.length} t3=${freshBoard.tiers.tier3.length} ` +
      `locked=${freshBoard.meta?.lockedPicks || 0} engine=${slate.engine?.ok ? 'ok' : 'degraded'}`
    );

    if (freshCount > 0) {
      // Until docs/nfl-picks-v2-migration.sql has been run there is nowhere
      // to store a lock, and trying would leave an empty run row per build.
      const storageReady = locks.reason !== 'migration_missing';
      if (!storageReady) freshBoard._debug.persisted = { hero: 0, tracking: 0, snapshots: 0, reason: 'migration_missing' };
      if (canPersist() && storageReady) {
        // Waited on, with a cap. A serverless function can be frozen the
        // moment it responds, and a write left running in the background
        // was observed never to finish.
        const outcome = await Promise.race([
          persist(freshBoard, locks.rows, slate.seasonYear),
          new Promise((resolve) => setTimeout(() => resolve({ timedOut: true }), PERSIST_WAIT_MS)),
        ]).catch((err) => { console.error(`[nflPicksBuilder] persist: ${err?.message}`); return { error: err?.message }; });
        freshBoard._debug.persisted = {
          hero: outcome?.hero?.locked?.length ?? 0,
          tracking: outcome?.tracking?.locked?.length ?? 0,
          snapshots: outcome?.snapshots?.saved ?? 0,
          reason: outcome?.hero?.reason || outcome?.tracking?.reason || outcome?.snapshots?.reason || outcome?.error || (outcome?.timedOut ? 'timed_out' : null),
        };
        setJson(KV_LATEST, freshBoard, { exSeconds: LATEST_TTL_SEC }).catch(() => {});
        setJson(KV_LASTKNOWN, freshBoard, { exSeconds: LASTKNOWN_TTL_SEC }).catch(() => {});
      }
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
