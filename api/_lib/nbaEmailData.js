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

/**
 * Fetch yesterday's NBA final games directly from ESPN scoreboard.
 * Used for "Yesterday's NBA Results" in Global Daily Briefing.
 * Includes playoff context if ESPN provides series metadata in the event.
 */
async function fetchYesterdayResults() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const dateStr = d.toISOString().slice(0, 10).replace(/-/g, '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NBA_FETCH_TIMEOUT);
  try {
    const r = await fetch(`${NBA_ESPN_SCOREBOARD}?dates=${dateStr}`, { signal: controller.signal });
    if (!r.ok) return [];
    const data = await r.json();
    const events = Array.isArray(data.events) ? data.events : [];
    const finals = events.map(normalizeEvent).filter(g => g && g.status === 'final');
    return finals.slice(0, 6).map(g => ({
      gameId: g.gameId,
      away: { slug: g.awayTeam?.slug, abbrev: g.awayTeam?.abbrev, score: g.awayTeam?.score },
      home: { slug: g.homeTeam?.slug, abbrev: g.homeTeam?.abbrev, score: g.homeTeam?.score },
      statusText: g.statusText || 'Final',
      seriesNote: g.seriesNote || null, // playoff series context if present
    }));
  } catch (err) {
    console.warn(`[nbaEmailData] yesterday's results fetch failed: ${err.message}`);
    return [];
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

  // Yesterday's NBA results (parallel)
  fetchPromises.push(
    fetchYesterdayResults().then(results => ({ data: results, source: 'fresh' }))
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

  // Yesterday's results
  const yesterdayResults = yesterdayResultsResult?.data || [];

  // GAPS (documented):
  // - NBA picks board: no canonical /api/nba/picks/built endpoint exists
  // - NBA picks scorecard: no settled-pick tracking exists
  // The template will render graceful "coming soon" fallbacks.
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
