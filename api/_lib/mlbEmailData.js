/**
 * assembleMlbEmailData — canonical MLB data source for all email paths.
 *
 * CRITICAL: This module avoids HTTP self-fetches wherever possible.
 *
 * On Vercel, serverless functions cannot reliably self-fetch their own API
 * routes (cold starts, timeouts, circular invocations). The prior approach
 * fetched `${baseUrl}/api/mlb/leaders` etc. via HTTP, which silently returned
 * empty data on production while working fine in local test environments.
 *
 * Fix: durable/cached data is now read DIRECTLY from KV or in-memory caches.
 * Only data that requires external API calls (Google News RSS) uses HTTP,
 * and those failures are logged explicitly.
 *
 * Data sources (prioritized):
 *   1. Vercel KV cache  → championship odds, narrative summary
 *   2. HTTP fetch        → headlines (Google News RSS), live feed, leaders, picks
 *   3. Graceful empty    → if all else fails, section renders empty
 *
 * @param {string} baseUrl — e.g. "https://maximussports.ai" (used for HTTP fallbacks)
 * @param {object} [opts]
 * @param {boolean} [opts.includeSummary=true] — include AI narrative
 * @param {boolean} [opts.includePicks=false] — include picks board
 * @returns {Promise<MlbEmailPayload>}
 */

const NCAAM_CONTAMINATION_KEYWORDS = [
  'college basketball', 'ncaa', 'transfer portal', 'ap top 25',
  'final four', 'march madness', 'sweet 16', 'elite eight',
  'ncaam', 'men\'s college basketball', 'cbb',
];

function validateMlbHeadlines(headlines) {
  if (!Array.isArray(headlines) || headlines.length === 0) return headlines;
  const clean = [];
  let contaminated = 0;
  for (const h of headlines) {
    const title = (h.title || '').toLowerCase();
    if (NCAAM_CONTAMINATION_KEYWORDS.some(kw => title.includes(kw))) {
      contaminated++;
    } else {
      clean.push(h);
    }
  }
  if (contaminated > 0) {
    console.warn(`[mlbEmailData] Blocked ${contaminated}/${headlines.length} non-MLB headlines`);
  }
  return clean;
}

function validateMlbScores(scores) {
  if (!Array.isArray(scores) || scores.length === 0) return scores;
  return scores.filter(g => {
    const teams = `${g.homeTeam || ''} ${g.awayTeam || ''}`.toLowerCase();
    return !NCAAM_CONTAMINATION_KEYWORDS.some(kw => teams.includes(kw));
  });
}

import { buildLeadersEditorialHook } from '../../src/data/mlb/seasonLeaders.js';
import { getJson } from '../_globalCache.js';
import { buildPicksBoard } from './mlbPicksBuilder.js';
import { normalizeEvent, ESPN_SCOREBOARD as MLB_ESPN_SCOREBOARD, FETCH_TIMEOUT_MS as MLB_FETCH_TIMEOUT } from '../mlb/live/_normalize.js';
import { resolveEmailDateContext, espnDateString } from './emailDateContext.js';

/**
 * Validate that a normalized result row has the minimum data needed to render.
 * Returns true only if BOTH teams have abbrev AND scores. No partial rows allowed.
 */
function isValidResult(row) {
  return !!(
    row?.away?.abbrev && row?.home?.abbrev &&
    row?.away?.score != null && row?.home?.score != null
  );
}

/**
 * Fetch yesterday's MLB final games directly from ESPN scoreboard.
 * Uses the canonical date context (product timezone, not UTC).
 */
async function fetchYesterdayResults(dateCtx) {
  const dateStr = espnDateString(dateCtx?.yesterdayDate || '');
  if (!dateStr) {
    console.warn('[mlbEmailData] no yesterday date provided to results fetcher');
    return { results: [], totalEvents: 0, finalsCount: 0, validCount: 0, skippedCount: 0 };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MLB_FETCH_TIMEOUT);
  try {
    const r = await fetch(`${MLB_ESPN_SCOREBOARD}?dates=${dateStr}`, { signal: controller.signal });
    if (!r.ok) {
      console.warn(`[mlbEmailData] yesterday results HTTP ${r.status} for ${dateStr}`);
      return { results: [], totalEvents: 0, finalsCount: 0, validCount: 0, skippedCount: 0 };
    }
    const data = await r.json();
    const events = Array.isArray(data.events) ? data.events : [];
    const normalized = events.map(normalizeEvent).filter(Boolean);
    const finals = normalized.filter(g => g.status === 'final');

    // Map to email-friendly shape using normalizeEvent's actual structure
    // (g.teams.away / g.teams.home, NOT g.awayTeam / g.homeTeam)
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
      completed: true,
    }));

    // Defensive: only return rows where both teams + scores are present.
    // Any row missing data gets skipped (and logged) to prevent "?? ? @ ?? ?".
    const validRows = [];
    let skipped = 0;
    for (const row of allRows) {
      if (isValidResult(row)) {
        validRows.push(row);
      } else {
        skipped++;
      }
    }
    if (skipped > 0) {
      console.warn(`[mlbEmailData] skipped ${skipped} invalid result rows for ${dateStr}`);
    }

    return {
      results: validRows.slice(0, 6),
      totalEvents: events.length,
      finalsCount: finals.length,
      validCount: validRows.length,
      skippedCount: skipped,
    };
  } catch (err) {
    console.warn(`[mlbEmailData] yesterday's results fetch failed: ${err.message}`);
    return { results: [], totalEvents: 0, finalsCount: 0, validCount: 0, skippedCount: 0 };
  } finally {
    clearTimeout(timer);
  }
}

// ── KV keys for direct cache reads (bypass HTTP self-fetch) ────────
const KV_CHAMP_ODDS = 'odds:championship:mlb:v1';
const KV_SUMMARY_FRESH = 'chat:mlb:home:summary:v2';
const KV_SUMMARY_LASTKNOWN = 'chat:mlb:home:lastKnown:v2';
const KV_LEADERS = 'mlb:leaders:latest';
const KV_HEADLINES = 'mlb:headlines:latest';
const KV_PICKS = 'mlb:picks:built:latest';

/**
 * Fetch with explicit timeout and detailed error logging.
 * Returns { data, source, error } — never throws.
 */
async function safeFetch(url, label, fallback, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!r.ok) {
      console.warn(`[mlbEmailData] ${label}: HTTP ${r.status} ${r.statusText} — using fallback`);
      return { data: fallback, source: 'http_error' };
    }
    const data = await r.json();
    return { data, source: 'fresh' };
  } catch (err) {
    clearTimeout(timer);
    const reason = err.name === 'AbortError' ? 'timeout' : err.message;
    console.warn(`[mlbEmailData] ${label}: fetch failed (${reason}) — using fallback`);
    return { data: fallback, source: 'fetch_error', error: reason };
  }
}

/**
 * Read from KV with HTTP fallback. Prefers KV (instant, reliable on Vercel)
 * but falls back to HTTP fetch if KV is empty/stale.
 */
async function kvThenHttp(kvKey, kvLabel, httpUrl, httpLabel, httpFallback) {
  try {
    const cached = await getJson(kvKey);
    if (cached && typeof cached === 'object' && Object.keys(cached).length > 0) {
      return { data: cached, source: `kv:${kvLabel}` };
    }
  } catch (err) {
    console.warn(`[mlbEmailData] KV read failed for ${kvLabel}: ${err.message}`);
  }
  // KV miss — fall back to HTTP
  if (httpUrl) {
    return safeFetch(httpUrl, httpLabel, httpFallback);
  }
  return { data: httpFallback, source: 'kv_miss_no_http' };
}

/**
 * Read championship odds directly from KV (bypasses HTTP self-fetch).
 */
async function readChampOddsFromKV() {
  try {
    const cached = await getJson(KV_CHAMP_ODDS);
    if (cached?.odds && Object.keys(cached.odds).length > 0) {
      return { data: cached.odds, source: 'kv_cache' };
    }
  } catch (err) {
    console.warn(`[mlbEmailData] champOdds KV read failed: ${err.message}`);
  }
  return { data: {}, source: 'kv_miss' };
}

/**
 * Read narrative summary directly from KV (bypasses HTTP self-fetch).
 * Falls back to last-known-good if fresh is unavailable.
 */
async function readSummaryFromKV() {
  try {
    const fresh = await getJson(KV_SUMMARY_FRESH);
    if (fresh?.summary) {
      return { data: fresh, source: 'kv_fresh' };
    }
    const lastKnown = await getJson(KV_SUMMARY_LASTKNOWN);
    if (lastKnown?.summary) {
      return { data: lastKnown, source: 'kv_lastknown' };
    }
  } catch (err) {
    console.warn(`[mlbEmailData] summary KV read failed: ${err.message}`);
  }
  return { data: {}, source: 'kv_miss' };
}

export async function assembleMlbEmailData(baseUrl, opts = {}) {
  const { includeSummary = true, includePicks = false } = opts;

  console.log(`[mlbEmailData] Assembling with baseUrl=${baseUrl} summary=${includeSummary} picks=${includePicks}`);

  // ── Parallel fetch: KV-first reads with HTTP fallback ──────────
  // KV reads are instant and reliable on Vercel. HTTP self-fetches are
  // the fallback for when KV hasn't been populated yet.
  const fetchPromises = [
    // 0: Headlines — KV first, HTTP fallback
    kvThenHttp(KV_HEADLINES, 'headlines', `${baseUrl}/api/mlb/news/headlines`, 'headlines', { headlines: [] }),
    // 1: Live feed — HTTP only (30s cache, no KV persistence)
    safeFetch(`${baseUrl}/api/mlb/live/homeFeed`, 'liveFeed', {}),
    // 2: Leaders — KV first, HTTP fallback
    kvThenHttp(KV_LEADERS, 'leaders', `${baseUrl}/api/mlb/leaders`, 'leaders', { categories: {} }),
    // 3: Championship odds — KV direct (already persisted by odds endpoint)
    readChampOddsFromKV(),
  ];

  if (includeSummary) {
    // 4: Narrative summary — KV direct with last-known-good fallback
    fetchPromises.push(readSummaryFromKV());
  }

  if (includePicks) {
    // 5: Picks board — DIRECT in-process build (no HTTP self-fetch)
    // Uses mlbPicksBuilder with fresh → KV latest → KV lastknown → empty chain
    fetchPromises.push(
      buildPicksBoard().then(({ board, source, counts }) => {
        console.log(`[mlbEmailData] picks board from: ${source} counts:`, JSON.stringify(counts));
        return { data: board, source: `picks:${source}` };
      }).catch(err => {
        console.warn(`[mlbEmailData] picks build failed: ${err.message}`);
        return { data: null, source: 'picks:error' };
      })
    );
  }

  // Yesterday's MLB results — uses canonical date context (product TZ)
  const dateCtx = opts.dateCtx || resolveEmailDateContext();
  console.log(`[mlbEmailData] dateCtx: yesterday=${dateCtx.yesterdayDate} tz=${dateCtx.timezone}`);
  fetchPromises.push(
    fetchYesterdayResults(dateCtx).then(r => ({ data: r, source: 'fresh' }))
  );

  const results = await Promise.all(fetchPromises);
  const [headlinesResult, liveResult, leadersResult, champOddsResult, ...rest] = results;
  const summaryResult = includeSummary ? rest.shift() : null;
  const picksResult = includePicks ? rest.shift() : null;
  const yesterdayResultsResult = rest.shift();

  // ── Diagnostic logging ────────────────────────────────────────
  const sources = {
    headlines: headlinesResult.source,
    liveFeed: liveResult.source,
    leaders: leadersResult.source,
    champOdds: champOddsResult.source,
  };
  if (summaryResult) sources.summary = summaryResult.source;
  if (picksResult) sources.picks = picksResult.source;
  console.log(`[mlbEmailData] Data sources:`, JSON.stringify(sources));

  // ── Parse results ─────────────────────────────────────────────

  // Headlines
  const mlbNews = headlinesResult.data || {};
  const rawHeadlines = (mlbNews.headlines || []).map(h => ({
    title: h.title, link: h.link, source: h.source, pubDate: h.time || null,
  }));
  const headlines = validateMlbHeadlines(rawHeadlines);

  // Live scores
  const mlbLive = liveResult.data || {};
  const liveGames = [...(mlbLive.liveNow || []), ...(mlbLive.startingSoon || [])];
  const rawScores = liveGames.map(g => ({
    homeTeam: g.homeTeam || g.home?.name || '',
    awayTeam: g.awayTeam || g.away?.name || '',
    homeScore: g.homeScore ?? g.home?.score ?? null,
    awayScore: g.awayScore ?? g.away?.score ?? null,
    gameStatus: g.status || g.gameStatus || 'Scheduled',
    statusType: g.statusType || '',
    spread: g.spread || null,
    overUnder: g.overUnder || g.total || null,
    moneylineHome: g.moneylineHome || null,
  }));
  const scoresToday = validateMlbScores(rawScores);

  // AI narrative summary
  let narrativeParagraph = '';
  let botIntelBullets = [];
  if (includeSummary && summaryResult) {
    const mlbSummary = summaryResult.data;
    if (mlbSummary?.summary) {
      narrativeParagraph = mlbSummary.summary;
      botIntelBullets = mlbSummary.summary
        .split(/\n+/)
        .map(l => l.trim())
        .filter(l => l.length > 30 && l.length < 300)
        .slice(0, 4);
    }
  }

  // Picks board
  let picksBoard = null;
  if (includePicks && picksResult) {
    const builtData = picksResult.data;
    if (builtData?.categories) {
      picksBoard = builtData;
      const c = builtData.categories;
      const total = (c.pickEms?.length || 0) + (c.ats?.length || 0) + (c.leans?.length || 0) + (c.totals?.length || 0);
      console.log(`[mlbEmailData] Picks received: total=${total} pickEms=${c.pickEms?.length || 0} ats=${c.ats?.length || 0} leans=${c.leans?.length || 0} totals=${c.totals?.length || 0}`);
    } else {
      console.warn(`[mlbEmailData] Picks: no categories in response`);
    }
  }

  // Season leaders
  const mlbLeadersData = leadersResult.data || {};
  const leadersEditorial = buildLeadersEditorialHook(mlbLeadersData) || null;

  // Championship odds (already resolved from KV)
  const champOdds = champOddsResult.data || {};

  console.log(`[mlbEmailData] Final: ${headlines.length} headlines, ${scoresToday.length} games, narrative=${narrativeParagraph.length > 0 ? narrativeParagraph.length + 'ch' : 'empty'}, picks=${!!picksBoard}, leaders=${Object.keys(mlbLeadersData?.categories || {}).length} cats, champOdds=${Object.keys(champOdds).length} teams`);

  // Yesterday's results — already validated (skipped invalid rows in fetcher)
  const yesterdayResultsData = yesterdayResultsResult?.data || { results: [], totalEvents: 0, finalsCount: 0, validCount: 0, skippedCount: 0 };
  const yesterdayResults = yesterdayResultsData.results;
  console.log(`[mlbEmailData] yesterday results: events=${yesterdayResultsData.totalEvents} finals=${yesterdayResultsData.finalsCount} valid=${yesterdayResultsData.validCount} skipped=${yesterdayResultsData.skippedCount}`);

  // Picks scorecard — placeholder until canonical scorecard pipeline lands.
  // Documented gap: no KV/source for settled-pick outcomes yet.
  const picksScorecard = null;

  return {
    headlines,
    scoresToday,
    narrativeParagraph,
    botIntelBullets,
    picksBoard,
    leadersEditorial,
    leadersCategories: mlbLeadersData?.categories || {},
    champOdds,
    yesterdayResults,
    picksScorecard,
    // Empty NCAAM-specific fields so templates don't break
    rankingsTop25: [],
    atsLeaders: { best: [], worst: [] },
    oddsGames: [],
    modelSignals: [],
    tournamentMeta: {},
  };
}
