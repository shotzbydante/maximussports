/**
 * mlbPicksBuilder — direct in-process picks board builder.
 *
 * Replaces HTTP self-fetches to /api/mlb/picks/built which are unreliable
 * on Vercel serverless (cold starts, timeouts, circular invocations).
 *
 * Both the HTTP handler (api/mlb/picks/built.js) and the email pipeline
 * should use this function. Single source of truth.
 *
 * Fallback precedence:
 *   1. Fresh build from ESPN scoreboard + odds enrichment
 *   2. KV latest snapshot (mlb:picks:built:latest, 15min TTL)
 *   3. KV last-known-good snapshot (mlb:picks:built:lastknown, 48hr TTL)
 *      — written whenever a fresh build yields ≥1 pick
 *   4. Empty board (true last resort)
 */

import { normalizeEvent, ESPN_SCOREBOARD, FETCH_TIMEOUT_MS } from '../mlb/live/_normalize.js';
import { enrichGamesWithOdds } from '../mlb/live/_odds.js';
import { buildMlbPicksV2 } from '../../src/features/mlb/picks/v2/buildMlbPicksV2.js';
import { MLB_DEFAULT_CONFIG } from '../../src/features/picks/tuning/defaultConfig.js';
import { getJson, setJson } from '../_globalCache.js';
import { writePicksRun, getActiveConfig, getScorecard } from './picksHistory.js';
import { yesterdayET } from './dateWindows.js';

const KV_LATEST = 'mlb:picks:built:latest';
const KV_LASTKNOWN = 'mlb:picks:built:lastknown';
const LATEST_TTL_SEC = 15 * 60;           // 15 min
const LASTKNOWN_TTL_SEC = 48 * 60 * 60;   // 48 hr

function getDateStrings(days = 2) {
  const dates = [];
  for (let i = 0; i <= days; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    dates.push(d.toISOString().slice(0, 10).replace(/-/g, ''));
  }
  return dates;
}

async function fetchScoreboardForDate(dateStr) {
  const url = `${ESPN_SCOREBOARD}?dates=${dateStr}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: controller.signal });
    if (!r.ok) return [];
    const data = await r.json();
    return (Array.isArray(data.events) ? data.events : []).map(normalizeEvent).filter(Boolean);
  } catch (err) {
    console.warn(`[mlbPicksBuilder] scoreboard fetch failed for ${dateStr}: ${err.message}`);
    return [];
  } finally {
    clearTimeout(timer);
  }
}

function countPicks(board) {
  // v2 shape
  if (board?.tiers) {
    return (board.tiers.tier1?.length || 0)
      + (board.tiers.tier2?.length || 0)
      + (board.tiers.tier3?.length || 0);
  }
  // legacy v1 shape
  const c = board?.categories || {};
  return (c.pickEms?.length || 0) + (c.ats?.length || 0)
       + (c.leans?.length || 0) + (c.totals?.length || 0);
}

/**
 * Build picks board directly (no HTTP self-fetch).
 * Uses KV fallback chain: fresh → latest → lastknown → empty.
 *
 * @param {object} [opts]
 * @param {boolean} [opts.preferFresh=false] — force fresh rebuild, ignore KV latest
 * @returns {Promise<{ board, source, counts }>}
 */
export async function buildPicksBoard(opts = {}) {
  const { preferFresh = false } = opts;

  // Try fresh build first
  let freshBoard = null;
  let freshError = null;
  try {
    const dateStrings = getDateStrings(2);
    const allGamesArrays = await Promise.all(dateStrings.map(fetchScoreboardForDate));
    let allGames = allGamesArrays.flat();

    // Dedupe
    const seen = new Set();
    allGames = allGames.filter(g => {
      if (seen.has(g.gameId)) return false;
      seen.add(g.gameId);
      return true;
    });

    // Upcoming only (not live/final)
    const upcoming = allGames.filter(g =>
      g.status === 'upcoming' && !g.gameState?.isLive && !g.gameState?.isFinal
    );

    // Enrich with odds
    let enriched = upcoming;
    try {
      enriched = await enrichGamesWithOdds(upcoming);
    } catch (err) {
      console.warn(`[mlbPicksBuilder] odds enrichment failed: ${err.message}`);
    }

    // ── V2 canonical build ────────────────────────────────────────────────
    // Resolve active tuning config (DB > default); never fail the build on
    // config read.
    let activeConfig = MLB_DEFAULT_CONFIG;
    try {
      const dbCfg = await getActiveConfig({ sport: 'mlb' });
      if (dbCfg) activeConfig = dbCfg;
    } catch (e) { console.warn(`[mlbPicksBuilder] getActiveConfig failed: ${e?.message}`); }

    // Attach yesterday's scorecard summary when available.
    // CRITICAL: must use ET date — picks_daily_scorecards.slate_date is ET.
    let scorecardSummary = null;
    try {
      const ymd = yesterdayET();
      const card = await getScorecard({ sport: 'mlb', slateDate: ymd });
      if (card) {
        scorecardSummary = {
          date: ymd,
          overall: card.record,
          byMarket: card.by_market,
          byTier: card.by_tier,
          topPlayResult: card.top_play_result,
          streak: card.streak,
          note: card.note,
        };
      }
    } catch (e) { /* non-fatal */ }

    const result = buildMlbPicksV2({ games: enriched, config: activeConfig, scorecardSummary });
    freshBoard = {
      ...result,
      _debug: { totalGames: allGames.length, upcoming: upcoming.length, enriched: enriched.length, engine: 'v2' },
    };

    const freshCount = countPicks(freshBoard);
    console.log(
      `[mlbPicksBuilder] fresh V2 build: total=${freshCount} ` +
      `t1=${freshBoard.tiers?.tier1?.length || 0} ` +
      `t2=${freshBoard.tiers?.tier2?.length || 0} ` +
      `t3=${freshBoard.tiers?.tier3?.length || 0} ` +
      `coverage=${freshBoard.coverage?.length || 0} ` +
      `upcoming=${upcoming.length} enriched=${enriched.length}`
    );

    // Persist fresh to KV
    if (freshCount > 0) {
      setJson(KV_LATEST, freshBoard, { exSeconds: LATEST_TTL_SEC }).catch(() => {});
      setJson(KV_LASTKNOWN, freshBoard, { exSeconds: LASTKNOWN_TTL_SEC }).catch(() => {});

      // Best-effort DB persistence (non-blocking). Any failure just logs.
      Promise.resolve()
        .then(() => writePicksRun(freshBoard))
        .then(r => {
          if (!r) return;
          if (!r.ok) {
            console.error(
              `[mlbPicksBuilder] ⚠ persist failed reason=${r.reason} ` +
              `inserted=${r.picksInserted ?? 0}/${r.picksAttempted ?? 0} ` +
              `first="${r.failures?.[0]?.message || 'n/a'}"`
            );
          }
        })
        .catch(err => console.error(`[mlbPicksBuilder] persist threw: ${err?.message}`));

      return { board: freshBoard, source: 'fresh', counts: getCounts(freshBoard) };
    }
  } catch (err) {
    freshError = err.message;
    console.warn(`[mlbPicksBuilder] fresh build failed: ${err.message}`);
  }

  // Fresh build failed or empty — try KV latest
  if (!preferFresh) {
    try {
      const latest = await getJson(KV_LATEST);
      const latestCount = countPicks(latest);
      if (latestCount > 0) {
        console.log(`[mlbPicksBuilder] using KV latest snapshot: total=${latestCount}`);
        return { board: latest, source: 'kv_latest', counts: getCounts(latest) };
      }
    } catch (err) {
      console.warn(`[mlbPicksBuilder] KV latest read failed: ${err.message}`);
    }
  }

  // Try last-known-good (48hr TTL)
  try {
    const lastknown = await getJson(KV_LASTKNOWN);
    const lastknownCount = countPicks(lastknown);
    if (lastknownCount > 0) {
      console.log(`[mlbPicksBuilder] using KV last-known-good: total=${lastknownCount}`);
      return { board: lastknown, source: 'kv_lastknown', counts: getCounts(lastknown) };
    }
  } catch (err) {
    console.warn(`[mlbPicksBuilder] KV lastknown read failed: ${err.message}`);
  }

  // Return the empty fresh board if we built one, else a structured empty board
  const emptyBoard = freshBoard || {
    categories: { pickEms: [], ats: [], leans: [], totals: [] },
    meta: { totalCandidates: 0, qualifiedGames: 0, skippedGames: 0 },
    generatedAt: new Date().toISOString(),
    _error: freshError || 'no data available',
  };
  console.warn(`[mlbPicksBuilder] all sources empty — returning empty board (last resort)`);
  return { board: emptyBoard, source: 'empty', counts: getCounts(emptyBoard) };
}

function getCounts(board) {
  // v2 payload: surface tier counts alongside legacy categories
  if (board?.tiers) {
    const c = board.categories || {};
    return {
      tier1: board.tiers.tier1?.length || 0,
      tier2: board.tiers.tier2?.length || 0,
      tier3: board.tiers.tier3?.length || 0,
      coverage: board.coverage?.length || 0,
      pickEms: c.pickEms?.length || 0,
      ats: c.ats?.length || 0,
      leans: c.leans?.length || 0,
      totals: c.totals?.length || 0,
      total: countPicks(board),
    };
  }
  const c = board?.categories || {};
  return {
    pickEms: c.pickEms?.length || 0,
    ats: c.ats?.length || 0,
    leans: c.leans?.length || 0,
    totals: c.totals?.length || 0,
    total: countPicks(board),
  };
}
