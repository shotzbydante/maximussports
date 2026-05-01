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

  const results = await Promise.all(fetchPromises);
  const [headlinesResult, standingsResult, champOddsResult, ...rest] = results;
  const summaryResult = includeSummary ? rest.shift() : null;

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

  return {
    narrativeParagraph,
    headlines: headlinesRaw,
    standings: { east, west },
    titleOutlook,
    champOdds,
  };
}
