/**
 * assembleNbaEmailData — canonical NBA data source for email paths.
 *
 * Mirrors mlbEmailData.js architecture: KV-first for cached data, HTTP
 * fallback only when necessary, no fragile self-fetches.
 *
 * Data sources (current NBA support in this worktree):
 *   - chat:nba:home:summary:v1 (KV) → AI narrative, fresh 15min
 *   - chat:nba:home:lastKnown:v1 (KV) → narrative fallback, 72hr
 *   - odds:championship:nba:v1 (KV) → championship odds, 1hr
 *   - /api/nba/news/headlines (HTTP) → Google News RSS
 *   - /api/nba/team/board (HTTP) → ESPN standings
 *
 * Gaps (not yet built in this worktree, classified as optional):
 *   - NBA leaders endpoint
 *   - NBA picks board
 *   - NBA playoff bracket / season model
 *
 * @param {string} baseUrl — for HTTP fallbacks
 * @param {object} [opts]
 * @param {boolean} [opts.includeSummary=true]
 * @returns {Promise<NbaEmailPayload>}
 */

import { getJson } from '../_globalCache.js';
import { normalizeEvent, ESPN_SCOREBOARD as NBA_ESPN_SCOREBOARD, FETCH_TIMEOUT_MS as NBA_FETCH_TIMEOUT } from '../nba/live/_normalize.js';
import { resolveEmailDateContext, espnDateString } from './emailDateContext.js';

function isValidResult(row) {
  return !!(
    row?.away?.abbrev && row?.home?.abbrev &&
    row?.away?.score != null && row?.home?.score != null
  );
}

/**
 * Fetch yesterday's NBA final games directly from ESPN scoreboard.
 * Uses canonical date context (product TZ, not UTC).
 */
async function fetchYesterdayResults(dateCtx) {
  const dateStr = espnDateString(dateCtx?.yesterdayDate || '');
  if (!dateStr) {
    console.warn('[nbaEmailData] no yesterday date provided to results fetcher');
    return { results: [], totalEvents: 0, finalsCount: 0, validCount: 0, skippedCount: 0 };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NBA_FETCH_TIMEOUT);
  try {
    const r = await fetch(`${NBA_ESPN_SCOREBOARD}?dates=${dateStr}`, { signal: controller.signal });
    if (!r.ok) {
      console.warn(`[nbaEmailData] yesterday results HTTP ${r.status} for ${dateStr}`);
      return { results: [], totalEvents: 0, finalsCount: 0, validCount: 0, skippedCount: 0 };
    }
    const data = await r.json();
    const events = Array.isArray(data.events) ? data.events : [];
    const normalized = events.map(normalizeEvent).filter(Boolean);
    const finals = normalized.filter(g => g.status === 'final');

    // Map using normalizeEvent's actual structure (g.teams.away / g.teams.home)
    const allRows = finals.map(g => ({
      gameId: g.gameId,
      away: {
        slug: g.teams?.away?.slug || null,
        name: g.teams?.away?.name || null,
        abbrev: g.teams?.away?.abbrev || null,
        score: g.teams?.away?.score ?? null,
      },
      home: {
        slug: g.teams?.home?.slug || null,
        name: g.teams?.home?.name || null,
        abbrev: g.teams?.home?.abbrev || null,
        score: g.teams?.home?.score ?? null,
      },
      statusText: g.gameState?.statusText || 'Final',
      seriesNote: g.seriesNote || null,
      completed: true,
    }));

    const validRows = [];
    let skipped = 0;
    for (const row of allRows) {
      if (isValidResult(row)) validRows.push(row);
      else skipped++;
    }
    if (skipped > 0) {
      console.warn(`[nbaEmailData] skipped ${skipped} invalid result rows for ${dateStr}`);
    }

    return {
      results: validRows.slice(0, 6),
      totalEvents: events.length,
      finalsCount: finals.length,
      validCount: validRows.length,
      skippedCount: skipped,
    };
  } catch (err) {
    console.warn(`[nbaEmailData] yesterday's results fetch failed: ${err.message}`);
    return { results: [], totalEvents: 0, finalsCount: 0, validCount: 0, skippedCount: 0 };
  } finally {
    clearTimeout(timer);
  }
}

const KV_CHAMP_ODDS = 'odds:championship:nba:v1';
const KV_SUMMARY_FRESH = 'chat:nba:home:summary:v1';
const KV_SUMMARY_LASTKNOWN = 'chat:nba:home:lastKnown:v1';

async function safeFetch(url, label, fallback, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!r.ok) {
      console.warn(`[nbaEmailData] ${label}: HTTP ${r.status} — using fallback`);
      return { data: fallback, source: 'http_error' };
    }
    return { data: await r.json(), source: 'fresh' };
  } catch (err) {
    clearTimeout(timer);
    const reason = err.name === 'AbortError' ? 'timeout' : err.message;
    console.warn(`[nbaEmailData] ${label}: fetch failed (${reason})`);
    return { data: fallback, source: 'fetch_error' };
  }
}

async function readChampOddsFromKV() {
  try {
    const cached = await getJson(KV_CHAMP_ODDS);
    if (cached?.odds && Object.keys(cached.odds).length > 0) {
      return { data: cached.odds, source: 'kv_cache' };
    }
  } catch (err) {
    console.warn(`[nbaEmailData] champOdds KV read failed: ${err.message}`);
  }
  return { data: {}, source: 'kv_miss' };
}

async function readSummaryFromKV() {
  try {
    const fresh = await getJson(KV_SUMMARY_FRESH);
    if (fresh?.summary) return { data: fresh, source: 'kv_fresh' };
    const lastKnown = await getJson(KV_SUMMARY_LASTKNOWN);
    if (lastKnown?.summary) return { data: lastKnown, source: 'kv_lastknown' };
  } catch (err) {
    console.warn(`[nbaEmailData] summary KV read failed: ${err.message}`);
  }
  return { data: {}, source: 'kv_miss' };
}

export async function assembleNbaEmailData(baseUrl, opts = {}) {
  const { includeSummary = true } = opts;

  console.log(`[nbaEmailData] Assembling baseUrl=${baseUrl} summary=${includeSummary}`);

  const fetchPromises = [
    // 0: Headlines (HTTP — Google News RSS, in-memory cache only)
    safeFetch(`${baseUrl}/api/nba/news/headlines`, 'headlines', { headlines: [] }),
    // 1: Standings/Board (HTTP — ESPN standings)
    safeFetch(`${baseUrl}/api/nba/team/board`, 'standings', { board: [] }),
    // 2: Championship odds (KV direct)
    readChampOddsFromKV(),
  ];

  if (includeSummary) {
    // 3: Narrative summary (KV direct with last-known-good fallback)
    fetchPromises.push(readSummaryFromKV());
  }

  // Yesterday's NBA results — uses canonical date context (product TZ)
  const dateCtx = opts.dateCtx || resolveEmailDateContext();
  console.log(`[nbaEmailData] dateCtx: yesterday=${dateCtx.yesterdayDate} tz=${dateCtx.timezone}`);
  fetchPromises.push(
    fetchYesterdayResults(dateCtx).then(r => ({ data: r, source: 'fresh' }))
  );

  const results = await Promise.all(fetchPromises);
  const [headlinesResult, standingsResult, champOddsResult, ...rest] = results;
  const summaryResult = includeSummary ? rest.shift() : null;
  const yesterdayResultsResult = rest.shift();

  const sources = {
    headlines: headlinesResult.source,
    standings: standingsResult.source,
    champOdds: champOddsResult.source,
  };
  if (summaryResult) sources.summary = summaryResult.source;
  console.log(`[nbaEmailData] Data sources:`, JSON.stringify(sources));

  // Headlines
  const headlinesRaw = (headlinesResult.data?.headlines || []).map(h => ({
    title: h.title,
    link: h.link,
    source: h.source || 'NBA News',
    pubDate: h.time || null,
  }));

  // Standings — split into Eastern / Western, top 8 by confRank
  const board = standingsResult.data?.board || [];
  const east = board
    .filter(t => t.conference === 'Eastern' && t.confRank > 0)
    .sort((a, b) => a.confRank - b.confRank)
    .slice(0, 8);
  const west = board
    .filter(t => t.conference === 'Western' && t.confRank > 0)
    .sort((a, b) => a.confRank - b.confRank)
    .slice(0, 8);

  // Title outlook — top 5 teams by championship odds
  const champOdds = champOddsResult.data || {};
  const titleOutlook = Object.entries(champOdds)
    .map(([slug, odds]) => ({
      slug,
      bestChanceAmerican: odds.bestChanceAmerican ?? odds.american ?? null,
      booksCount: odds.booksCount ?? 0,
    }))
    .filter(t => t.bestChanceAmerican != null)
    .sort((a, b) => {
      // Lower (more negative or smaller positive) = better odds
      const ap = a.bestChanceAmerican;
      const bp = b.bestChanceAmerican;
      // Convert to implied probability for sorting
      const impProb = v => v < 0 ? -v / (-v + 100) : 100 / (v + 100);
      return impProb(bp) - impProb(ap);
    })
    .slice(0, 5);

  // Narrative
  let narrativeParagraph = '';
  if (includeSummary && summaryResult?.data?.summary) {
    narrativeParagraph = summaryResult.data.summary;
  }

  console.log(`[nbaEmailData] Final: ${headlinesRaw.length} headlines, ${east.length}+${west.length} teams in standings, ${titleOutlook.length} title-outlook teams, narrative=${narrativeParagraph.length}ch`);

  // Yesterday's results — already validated in the fetcher (no malformed rows)
  const yesterdayResultsData = yesterdayResultsResult?.data || { results: [], totalEvents: 0, finalsCount: 0, validCount: 0, skippedCount: 0 };
  const yesterdayResults = yesterdayResultsData.results;
  console.log(`[nbaEmailData] yesterday results: events=${yesterdayResultsData.totalEvents} finals=${yesterdayResultsData.finalsCount} valid=${yesterdayResultsData.validCount} skipped=${yesterdayResultsData.skippedCount}`);

  // ═══════════════════════════════════════════════════════════════
  // BACKEND GAP: NBA picks board + scorecard
  // ═══════════════════════════════════════════════════════════════
  // As of this commit, this worktree has NO canonical NBA picks engine.
  // The MLB equivalents (buildMlbPicks + classifyMlbPick + scoreMlbMatchup
  // in src/features/mlb/picks/) do not have NBA counterparts. NbaHome.jsx
  // and NbaPicks.jsx both render live games / odds, NOT a categorized
  // picks board.
  //
  // To wire real NBA picks into the email, the following needs to be built
  // FIRST in the canonical app pipeline (not in the email layer):
  //   1. src/features/nba/picks/buildNbaPicks.js (parallel to MLB)
  //   2. src/features/nba/picks/scoreNbaMatchup.js + classifyNbaPick.js
  //   3. api/nba/picks/built.js (HTTP handler that writes KV)
  //   4. api/_lib/nbaPicksBuilder.js (direct in-process builder, like
  //      mlbPicksBuilder.js — to avoid Vercel self-fetch)
  //   5. KV keys: nba:picks:built:latest + nba:picks:built:lastknown
  //   6. Settled-pick tracking for scorecard (yesterday's W/L/P)
  //
  // Once that exists, this assembler should call buildNbaPicksBoard()
  // the same way mlbEmailData uses buildPicksBoard() — and the template
  // will automatically render TODAY'S NBA PICKS instead of MODEL WATCH.
  //
  // Until then, the email gracefully falls back to the deterministic
  // NBA Model Watch (built from existing championship odds + results).
  // No fake picks, no fabricated spreads/edges.
  const picksBoard = null;
  const picksScorecard = null;

  return {
    narrativeParagraph,
    headlines: headlinesRaw,
    standings: { east, west },
    titleOutlook,
    champOdds,
    yesterdayResults,
    picksBoard,
    picksScorecard,
  };
}
