/**
 * Team video feed endpoint.
 * GET /api/youtube/team?teamSlug=...&opponentSlug=...&mode=recent&maxResults=6&debugYT=1&debugVideos=1
 *
 * Reliability strategy (executed in order):
 *   1. KV fresh cache (1 h per team)              → return immediately, zero quota
 *   2. KV stale last-known-good (7 d per team)    → return when breaker is active
 *   3. RSS fallback (zero quota)                  → always available
 *   4. YouTube Data API (1–2 queries)             → skipped when circuit breaker active
 *   5. KV stale last-known-good (absolute rescue) → if all live paths fail
 *
 * Circuit breaker: if a 403 quota error was logged today, the Data API is
 * skipped for the remainder of the UTC day (yt:quota_exhausted:YYYY-MM-DD KV flag).
 *
 * Response 200:
 *   { status:"ok"|"ok_stale", teamSlug, teamName, updatedAt, items:[...] }
 */

import { TEAMS } from '../../data/teams.js';
import {
  ytSearch, ytVideosDetails, scoreItem,
  isItemAllowlisted, classifyBasketballItem,
  isQuotaExhausted,
} from './_yt.js';
import { ytRssSearch, safeRssQuery } from './_ytRss.js';
import { getJson, setJson } from '../_globalCache.js';

const DEFAULT_MAX = 6;
const MIN_MAX     = 1;
const MAX_MAX     = 10;

// KV TTLs
const KV_FRESH_TTL_SEC     = 60 * 60;          // 1 hour
const KV_LASTKNOWN_TTL_SEC = 7 * 24 * 60 * 60; // 7 days

const kvFreshKey     = (slug) => `yt:team:${slug}:fresh:v2`;
const kvLastKnownKey = (slug) => `yt:team:${slug}:lastKnown:v2`;

function resolveTeam(slug) {
  return TEAMS.find((t) => t.slug === slug) ?? null;
}

function dedupeById(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (seen.has(item.videoId)) return false;
    seen.add(item.videoId);
    return true;
  });
}

function promoteAllowlisted(items) {
  const firstIdx = items.findIndex((item) => isItemAllowlisted(item));
  if (firstIdx <= 0) return items;
  const result = items.slice();
  const [promoted] = result.splice(firstIdx, 1);
  result.unshift(promoted);
  return result;
}

function filterBasketball(items) {
  let footballCount = 0, womenCount = 0, noBballCount = 0;
  const filtered = items.filter((item) => {
    const reason = classifyBasketballItem(item);
    if (reason === 'accept') return true;
    if (reason === 'football') footballCount++;
    else if (reason === 'women') womenCount++;
    else noBballCount++;
    return false;
  });
  return { items: filtered, footballCount, womenCount, noBballCount };
}

const DIVERSITY_MIN_SCORE = 55;
const DIVERSITY_MAX_DELTA = 15;

function diversityPass(sorted, maxN, dbg = {}) {
  const top  = sorted.slice(0, maxN);
  const rest = sorted.slice(maxN);
  dbg.swapOccurred = false;
  dbg.swapReason   = 'no_action';
  if (rest.length === 0) { dbg.swapReason = 'rest_empty'; return top; }
  const espnInTop = top.filter((i) => (i.channelTitle ?? '').toLowerCase().includes('espn')).length;
  if (espnInTop <= Math.ceil(maxN / 2)) { dbg.swapReason = `espn_share_ok(${espnInTop}/${maxN})`; return top; }
  const lowestEspnIdx = [...top.keys()].reverse().find((idx) => (top[idx].channelTitle ?? '').toLowerCase().includes('espn'));
  const lowestEspnScore = top[lowestEspnIdx]?._score ?? 0;
  const bestNonEspn = rest.find((i) => !(i.channelTitle ?? '').toLowerCase().includes('espn'));
  if (!bestNonEspn) { dbg.swapReason = 'no_non_espn_candidate'; return top; }
  if (bestNonEspn._score < DIVERSITY_MIN_SCORE || bestNonEspn._score < lowestEspnScore - DIVERSITY_MAX_DELTA) {
    dbg.swapReason = `quality_guard_blocked(nonEspn=${bestNonEspn._score},lowestEspn=${lowestEspnScore})`;
    return top;
  }
  const result = top.slice();
  result[lowestEspnIdx] = bestNonEspn;
  dbg.swapOccurred = true;
  dbg.swapReason = `swapped[${lowestEspnIdx}]:espn(${lowestEspnScore})→${bestNonEspn.channelTitle}(${bestNonEspn._score})`;
  return result;
}

async function processAndEnrich(rawItems, team, maxResults, debug) {
  const f = filterBasketball(rawItems);
  const merged = dedupeById(f.items);
  const withScores = merged.map((item) => ({ ...item, _score: scoreItem(item, team.name) }));
  withScores.sort((a, b) => b._score - a._score);

  const diversityDbg = {};
  const diverse  = diversityPass(withScores, maxResults, diversityDbg);
  const promoted = promoteAllowlisted(diverse);
  // eslint-disable-next-line no-unused-vars
  const scored   = promoted.map(({ _score: _omit, ...item }) => item);

  // Enrich with durations (single videos.list call)
  const videoIds = scored.map((i) => i.videoId);
  const details  = await ytVideosDetails(videoIds, { debug }).catch(() => ({}));
  const items = scored.map((item) => ({
    ...item,
    durationSeconds: details[item.videoId]?.durationSeconds ?? null,
  }));

  if (debug) {
    console.log(
      `[api/youtube/team] processed: raw=${rawItems.length} filtered=${f.items.length} merged=${merged.length} → ${items.length} final`
    );
  }
  return items;
}

/**
 * Fetch from YouTube Data API using a single primary query.
 * A second query is added only for matchup-mode (today vs opponent).
 * Consolidated from the previous 2-query fanout to reduce quota burn.
 */
async function fetchFromDataApi(team, opponent, mode, maxResults, debug) {
  // Single primary query — highlights are the most reliable search term
  const primaryQ = `${team.name} basketball highlights`;

  // Second query only when previewing a specific matchup
  const matchupQ = (opponent && mode === 'today')
    ? `${team.name} vs ${opponent.name} basketball`
    : null;

  if (debug) {
    console.log(`[api/youtube/team] data-api primary="${primaryQ}"${matchupQ ? ` matchup="${matchupQ}"` : ''}`);
  }

  const queries = matchupQ
    ? [
        ytSearch({ q: primaryQ, maxResults: MAX_MAX, debug }).catch((err) => {
          console.error('[api/youtube/team] primary query failed:', err.message);
          return [];
        }),
        ytSearch({ q: matchupQ, maxResults: 5, debug }).catch((err) => {
          console.error('[api/youtube/team] matchup query failed:', err.message);
          return [];
        }),
      ]
    : [
        ytSearch({ q: primaryQ, maxResults: MAX_MAX, debug }).catch((err) => {
          console.error('[api/youtube/team] primary query failed:', err.message);
          return [];
        }),
      ];

  const results = await Promise.all(queries);
  const allRaw  = results.flat();
  if (allRaw.length === 0) throw new Error('data-api returned empty results');
  return allRaw;
}

/**
 * Fetch from YouTube RSS — zero quota, uses progressive query simplification.
 */
async function fetchFromRss(team, debug) {
  // Use a safe sanitized query to prevent HTTP 400
  const q = safeRssQuery(`${team.name} basketball highlights`);
  if (debug) console.log(`[api/youtube/team] RSS fallback q="${q}"`);
  const items = await ytRssSearch({ q, debug });
  if (items.length === 0) throw new Error('RSS returned empty results');
  return items;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ status: 'error', message: 'Method not allowed' });
  }

  const {
    teamSlug,
    opponentSlug,
    mode = 'recent',
    maxResults: rawMax,
    debugYT,
    debugVideos,
  } = req.query ?? {};

  const debug = debugYT === '1' || debugVideos === '1';
  const t0    = debug ? Date.now() : 0;

  if (!teamSlug || typeof teamSlug !== 'string') {
    return res.status(400).json({ status: 'error', message: 'Missing required param: teamSlug' });
  }

  const team = resolveTeam(teamSlug.trim());
  if (!team) {
    return res.status(400).json({ status: 'error', message: `Unknown teamSlug: ${teamSlug}` });
  }

  const opponent   = opponentSlug ? resolveTeam(opponentSlug.trim()) : null;
  const parsedMax  = parseInt(rawMax, 10);
  const maxResults = isNaN(parsedMax)
    ? DEFAULT_MAX
    : Math.min(MAX_MAX, Math.max(MIN_MAX, parsedMax));

  const freshKey     = kvFreshKey(teamSlug);
  const lastKnownKey = kvLastKnownKey(teamSlug);

  // ── Layer 1: KV fresh cache ─────────────────────────────────────────────
  try {
    const cached = await getJson(freshKey);
    if (cached?.items?.length > 0) {
      if (debug) console.log(`[api/youtube/team] KV fresh HIT for ${teamSlug} — ${cached.items.length} items, elapsed=${Date.now()-t0}ms`);
      return res.status(200).json({
        ...cached,
        _path:  debug ? 'kv_fresh' : undefined,
        _debug: debug ? { elapsedMs: Date.now() - t0 } : undefined,
      });
    }
    if (debug) console.log(`[api/youtube/team] KV fresh MISS for ${teamSlug}`);
  } catch (kvErr) {
    if (debug) console.log(`[api/youtube/team] KV read error: ${kvErr.message}`);
  }

  // ── Check circuit breaker ───────────────────────────────────────────────
  const quotaActive = await isQuotaExhausted();
  if (debug && quotaActive) console.log(`[api/youtube/team] quota circuit breaker ACTIVE — skipping Data API`);

  // ── Layer 2: KV stale last-known-good (prioritised when breaker active) ─
  // Serving stale cached content is safer than risky live fetches when quota is gone.
  if (quotaActive) {
    try {
      const lastKnown = await getJson(lastKnownKey);
      if (lastKnown?.items?.length > 0) {
        if (debug) console.log(`[api/youtube/team] breaker active → stale HIT for ${teamSlug} — ${lastKnown.items.length} items from ${lastKnown.updatedAt}`);
        return res.status(200).json({
          ...lastKnown,
          status: 'ok_stale',
          _path:  debug ? 'kv_stale_breaker' : undefined,
          _debug: debug ? { elapsedMs: Date.now() - t0, quotaActive: true } : undefined,
        });
      }
      if (debug) console.log(`[api/youtube/team] breaker active → stale MISS for ${teamSlug}`);
    } catch (kvErr) {
      if (debug) console.log(`[api/youtube/team] stale read error (breaker path): ${kvErr.message}`);
    }
  }

  // ── Layer 3: RSS fallback — zero quota ──────────────────────────────────
  // Attempt RSS before Data API when breaker is active; fall through to Data API otherwise.
  let items = null;
  let apiPath = 'unknown';

  if (quotaActive) {
    // Breaker active: try RSS only
    try {
      const rssItems = await fetchFromRss(team, debug);
      items   = await processAndEnrich(rssItems, team, maxResults, debug);
      apiPath = 'rss_fallback_breaker';
      if (debug) console.log(`[api/youtube/team] RSS fallback SUCCESS (breaker active) — ${items.length} items`);
    } catch (rssErr) {
      if (debug) console.log(`[api/youtube/team] RSS fallback FAILED (breaker active): ${rssErr.message}`);
      console.error('[api/youtube/team] RSS fallback error (breaker active):', rssErr.message);
    }
  } else {
    // ── Layer 4 (normal path): YouTube Data API ──────────────────────────
    try {
      const rawItems = await fetchFromDataApi(team, opponent, mode, maxResults, debug);
      items   = await processAndEnrich(rawItems, team, maxResults, debug);
      apiPath = 'data-api';
      if (debug) console.log(`[api/youtube/team] data-api SUCCESS — ${items.length} items`);
    } catch (apiErr) {
      const isQuota = /quota/i.test(apiErr.message) || /429/.test(apiErr.message) || /403/.test(apiErr.message);
      if (debug) console.log(`[api/youtube/team] data-api FAILED (${isQuota ? 'quota' : 'error'}): ${apiErr.message}`);
      console.error('[api/youtube/team] data-api error:', apiErr.message);

      // ── Layer 5 (Data API failed): RSS fallback ──────────────────────
      try {
        const rssItems = await fetchFromRss(team, debug);
        items   = await processAndEnrich(rssItems, team, maxResults, debug);
        apiPath = 'rss_fallback';
        if (debug) console.log(`[api/youtube/team] RSS fallback SUCCESS — ${items.length} items`);
      } catch (rssErr) {
        if (debug) console.log(`[api/youtube/team] RSS fallback FAILED: ${rssErr.message}`);
        console.error('[api/youtube/team] RSS fallback error:', rssErr.message);
      }
    }
  }

  // ── Write cache on success ──────────────────────────────────────────────
  if (items && items.length > 0) {
    const payload = {
      status:    'ok',
      teamSlug,
      teamName:  team.name,
      updatedAt: new Date().toISOString(),
      items,
    };
    setJson(freshKey, payload, { exSeconds: KV_FRESH_TTL_SEC }).catch(() => {});
    setJson(lastKnownKey, payload, { exSeconds: KV_LASTKNOWN_TTL_SEC }).catch(() => {});

    return res.status(200).json({
      ...payload,
      _path:  debug ? apiPath : undefined,
      _debug: debug ? { elapsedMs: Date.now() - t0, quotaActive } : undefined,
    });
  }

  // ── Absolute rescue: KV stale last-known-good ───────────────────────────
  // (when breaker was NOT active but all live paths still failed)
  try {
    const lastKnown = await getJson(lastKnownKey);
    if (lastKnown?.items?.length > 0) {
      if (debug) console.log(`[api/youtube/team] rescue stale HIT for ${teamSlug} — ${lastKnown.items.length} items from ${lastKnown.updatedAt}`);
      return res.status(200).json({
        ...lastKnown,
        status: 'ok_stale',
        _path:  debug ? 'kv_stale_rescue' : undefined,
        _debug: debug ? { elapsedMs: Date.now() - t0, quotaActive } : undefined,
      });
    }
  } catch (kvErr) {
    if (debug) console.log(`[api/youtube/team] rescue stale read error: ${kvErr.message}`);
  }

  // ── Complete failure ────────────────────────────────────────────────────
  if (debug) console.log(`[api/youtube/team] all layers exhausted for ${teamSlug} in ${Date.now()-t0}ms`);
  return res.status(200).json({
    status:    'error',
    teamSlug,
    teamName:  team.name,
    updatedAt: new Date().toISOString(),
    items:     [],
    _path:     debug ? 'exhausted' : undefined,
    _debug:    debug ? { elapsedMs: Date.now() - t0, quotaActive } : undefined,
  });
}
