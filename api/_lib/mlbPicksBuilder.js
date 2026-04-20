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
import { buildMlbPicks } from '../../src/features/mlb/picks/buildMlbPicks.js';
import { getJson, setJson } from '../_globalCache.js';

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

    const result = buildMlbPicks({ games: enriched });
    freshBoard = {
      ...result,
      generatedAt: new Date().toISOString(),
      _debug: { totalGames: allGames.length, upcoming: upcoming.length, enriched: enriched.length },
    };

    const freshCount = countPicks(freshBoard);
    console.log(`[mlbPicksBuilder] fresh build: total=${freshCount} upcoming=${upcoming.length} enriched=${enriched.length}`);

    // Persist fresh to KV
    if (freshCount > 0) {
      setJson(KV_LATEST, freshBoard, { exSeconds: LATEST_TTL_SEC }).catch(() => {});
      // Only update lastknown when we have a substantive board
      setJson(KV_LASTKNOWN, freshBoard, { exSeconds: LASTKNOWN_TTL_SEC }).catch(() => {});
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
  const c = board?.categories || {};
  return {
    pickEms: c.pickEms?.length || 0,
    ats: c.ats?.length || 0,
    leans: c.leans?.length || 0,
    totals: c.totals?.length || 0,
    total: countPicks(board),
  };
}
