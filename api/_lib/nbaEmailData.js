/**
 * assembleNbaEmailData — canonical NBA data source for email paths.
 *
 * Mirrors mlbEmailData.js architecture: KV-first for cached data, in-process
 * builder for picks (no HTTP self-fetch), HTTP fallback only when necessary.
 *
 * Data sources:
 *   - buildNbaPicksBoard()       → picks board (fresh ESPN+odds → KV latest →
 *                                  KV last-known-good → empty). Same builder
 *                                  /api/nba/picks/built calls — single source
 *                                  of truth shared with NBA Home and IG slides.
 *                                  Picks board carries `categories` (the
 *                                  contract resolveSlidePicks consumes for
 *                                  IG) AND `scorecardSummary` (read directly
 *                                  from picks_daily_scorecards Supabase table
 *                                  via picksHistory — same row the scorecard
 *                                  endpoint serves).
 *   - chat:nba:home:summary:v1 (KV)        → AI narrative, fresh 15min
 *   - chat:nba:home:lastKnown:v1 (KV)      → narrative fallback, 72hr
 *   - odds:championship:nba:v1 (KV)        → championship odds, 1hr
 *   - /api/nba/news/headlines (HTTP)       → Google News RSS
 *   - /api/nba/team/board (HTTP)           → ESPN standings
 *   - ESPN scoreboard (HTTP, direct)       → yesterday's results
 *
 * @param {string} baseUrl — for HTTP fallbacks
 * @param {object} [opts]
 * @param {boolean} [opts.includeSummary=true]
 * @param {boolean} [opts.includePicks=false]  — pull canonical NBA picks +
 *                  scorecard via buildNbaPicksBoard() (mirrors MLB).
 * @returns {Promise<NbaEmailPayload>}
 */

import { getJson } from '../_globalCache.js';
import { normalizeEvent, ESPN_SCOREBOARD as NBA_ESPN_SCOREBOARD, FETCH_TIMEOUT_MS as NBA_FETCH_TIMEOUT } from '../nba/live/_normalize.js';
import { resolveEmailDateContext, espnDateString } from './emailDateContext.js';
import { buildNbaPicksBoard } from './nbaPicksBuilder.js';

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

/**
 * Normalize the canonical scorecardSummary attached by buildNbaPicksBoard()
 * (which itself reads picks_daily_scorecards via picksHistory) into the
 * email-friendly shape the Global Briefing template's renderScorecard()
 * expects. Carries both the legacy fields (wins/losses/pushes/summary) AND
 * the canonical fields (overall/byMarket/topPlayResult/streak/note) so
 * downstream renderers can choose either.
 */
function adaptScorecardForEmail(summary) {
  if (!summary || typeof summary !== 'object') return null;
  const overall = summary.overall || {};
  const won = overall.won ?? 0;
  const lost = overall.lost ?? 0;
  const push = overall.push ?? 0;
  const pending = overall.pending ?? 0;
  const graded = won + lost + push;
  if (graded === 0 && pending === 0) return null;

  // Build a one-line summary string for the compact scorecard renderer.
  // Prefer top-play result when graded; otherwise market mix; fallback to
  // the persisted note from the scorecard row.
  const tp = summary.topPlayResult;
  const tpFragment = tp && tp.status && tp.status !== 'pending'
    ? `Top Play ${tp.status === 'won' ? 'cashed' : tp.status === 'push' ? 'pushed' : 'lost'}`
    : null;
  const summaryText = tpFragment
    || summary.note
    || (graded > 0 ? `${graded} pick${graded === 1 ? '' : 's'} graded` : '');

  return {
    // Legacy contract (consumed by globalBriefing renderScorecard)
    date: summary.date || null,
    wins: won,
    losses: lost,
    pushes: push,
    pending,
    summary: summaryText,
    // Canonical contract (passes through unchanged for richer renderers)
    overall: { won, lost, push, pending },
    byMarket: summary.byMarket || null,
    byTier: summary.byTier || null,
    topPickResult: tp || null,
    streak: summary.streak || null,
    note: summary.note || null,
    isFallback: !!summary.isFallback,
  };
}

export async function assembleNbaEmailData(baseUrl, opts = {}) {
  const { includeSummary = true, includePicks = false } = opts;

  console.log(`[nbaEmailData] Assembling baseUrl=${baseUrl} summary=${includeSummary} picks=${includePicks}`);

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

  if (includePicks) {
    // 4: Picks board — DIRECT in-process build (no HTTP self-fetch).
    // Same builder /api/nba/picks/built calls. Returns:
    //   { board: { categories, tiers, topPick, scorecardSummary, ... },
    //     source: 'fresh' | 'kv_latest' | 'kv_lastknown' | 'empty',
    //     counts: { pickEms, ats, leans, totals, total } }
    // The scorecardSummary attached to the board is read from
    // picks_daily_scorecards (Supabase) via picksHistory — same row the
    // /api/nba/picks/scorecard endpoint serves, so email and app stay
    // in sync without an extra fetch.
    fetchPromises.push(
      buildNbaPicksBoard().then(({ board, source, counts }) => {
        console.log(`[nbaEmailData] picks board from: ${source} counts:`, JSON.stringify(counts));
        return { data: board, source: `picks:${source}`, counts };
      }).catch(err => {
        console.warn(`[nbaEmailData] picks build failed: ${err.message}`);
        return { data: null, source: 'picks:error' };
      })
    );
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
  const picksResult = includePicks ? rest.shift() : null;
  const yesterdayResultsResult = rest.shift();

  const sources = {
    headlines: headlinesResult.source,
    standings: standingsResult.source,
    champOdds: champOddsResult.source,
  };
  if (summaryResult) sources.summary = summaryResult.source;
  if (picksResult) sources.picks = picksResult.source;
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
  // NBA PICKS BOARD + SCORECARD (canonical, shared with NBA Home + IG)
  // ═══════════════════════════════════════════════════════════════
  // Both pulled from buildNbaPicksBoard() above. Same source of truth
  // /api/nba/picks/built and the IG slide pipeline consume — zero drift.
  //
  // picksBoard.categories  → consumed by globalBriefing renderTodaysPicks
  //                          (identical contract to MLB picks)
  // picksBoard.scorecardSummary → adapted into email-friendly shape for
  //                               renderScorecard
  let picksBoard = null;
  let picksScorecard = null;
  let picksSource = includePicks ? 'missing' : 'not_requested';
  let picksCounts = null;
  let scorecardSource = 'missing';

  if (includePicks && picksResult) {
    const builtData = picksResult.data;
    if (builtData?.categories) {
      picksBoard = builtData;
      picksCounts = picksResult.counts || null;
      // Picks source: 'picks:fresh' | 'picks:kv_latest' | 'picks:kv_lastknown' | 'picks:empty' | 'picks:error'
      picksSource = picksResult.source || 'picks:unknown';
      const totalPicks = picksCounts?.total ?? 0;
      console.log(
        `[nbaEmailData] picks: source=${picksSource} total=${totalPicks} ` +
        `pickEms=${picksCounts?.pickEms ?? 0} ats=${picksCounts?.ats ?? 0} ` +
        `leans=${picksCounts?.leans ?? 0} totals=${picksCounts?.totals ?? 0}`
      );

      // Scorecard is attached to the board by the picks builder. Adapt to
      // the email-friendly shape only when graded data exists; otherwise
      // leave null so the template renders its compact placeholder.
      const adapted = adaptScorecardForEmail(builtData.scorecardSummary);
      if (adapted) {
        picksScorecard = adapted;
        scorecardSource = adapted.isFallback
          ? 'picks_history:fallback_slate'
          : 'picks_history:yesterday';
        console.log(
          `[nbaEmailData] scorecard: source=${scorecardSource} date=${adapted.date} ` +
          `record=${adapted.wins}-${adapted.losses}${adapted.pushes ? `-${adapted.pushes}` : ''} ` +
          `topPlay=${adapted.topPickResult?.status || 'n/a'}`
        );
      } else {
        scorecardSource = 'no_graded_history';
        console.log(`[nbaEmailData] scorecard: no graded history yet`);
      }
    } else {
      console.warn(`[nbaEmailData] picks: no categories in response (source=${picksResult.source})`);
      picksSource = picksResult.source || 'picks:error';
    }
  }

  return {
    narrativeParagraph,
    headlines: headlinesRaw,
    standings: { east, west },
    titleOutlook,
    champOdds,
    yesterdayResults,
    picksBoard,
    picksScorecard,
    // Diagnostics — surface why a pick or scorecard fell back. The pipeline
    // and template log these so a missing section never goes unexplained.
    picksSource,
    picksCounts,
    scorecardSource,
  };
}
