/**
 * Team video feed endpoint.
 * GET /api/youtube/team?teamSlug=...&opponentSlug=...&mode=recent&maxResults=6&debugYT=1&debugVideos=1
 *
 * 3-layer reliability strategy:
 *   1. KV fresh cache (1h per team) → return immediately, zero quota
 *   2. YouTube Data API (2 queries max, reduced from 3)
 *   3. RSS fallback (zero quota) → used when quota is exhausted
 *   4. KV stale last-known-good (7d per team) → absolute fallback
 *
 * Response 200:
 *   { status:"ok", teamSlug, teamName, updatedAt, items:[...] }
 */

import { TEAMS } from '../../data/teams.js';
import { ytSearch, ytVideosDetails, scoreItem, isItemAllowlisted, classifyBasketballItem } from './_yt.js';
import { ytRssSearch } from './_ytRss.js';
import { getConferenceNetwork } from './_conferenceNetworks.js';
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
  const scored   = promoted.map(({ _score: _s, ...item }) => item);

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

async function fetchFromDataApi(team, opponent, mode, maxResults, debug) {
  // Reduced to 2 queries (down from 3) to cut quota burn by ~33%
  const q1 = `${team.name} basketball highlights`;
  const confNetwork = getConferenceNetwork(team.conference);
  let q2;
  if (opponent && mode === 'today') {
    q2 = `${team.name} vs ${opponent.name} basketball highlights`;
  } else if (confNetwork) {
    q2 = `${team.name} ${confNetwork} basketball`;
  } else {
    q2 = `${team.name} basketball analysis preview`;
  }

  if (debug) console.log(`[api/youtube/team] data-api q1="${q1}" q2="${q2}"`);

  const [raw1, raw2] = await Promise.all([
    ytSearch({ q: q1, maxResults: MAX_MAX, debug }).catch((err) => {
      console.error('[api/youtube/team] q1 failed:', err.message);
      return [];
    }),
    ytSearch({ q: q2, maxResults: MAX_MAX, debug }).catch((err) => {
      console.error('[api/youtube/team] q2 failed:', err.message);
      return [];
    }),
  ]);

  const allRaw = [...raw1, ...raw2];
  if (allRaw.length === 0) throw new Error('data-api returned empty results');
  return allRaw;
}

async function fetchFromRss(team, debug) {
  const q = `${team.name} basketball highlights`;
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

  // ── Layer 1: KV fresh cache ──────────────────────────────────────────────
  try {
    const cached = await getJson(freshKey);
    if (cached?.items?.length > 0) {
      if (debug) console.log(`[api/youtube/team] KV fresh HIT for ${teamSlug} — ${cached.items.length} items, elapsed=${Date.now()-t0}ms`);
      return res.status(200).json({
        ...cached,
        _path: debug ? 'kv_fresh' : undefined,
        _debug: debug ? { elapsedMs: Date.now() - t0 } : undefined,
      });
    }
    if (debug) console.log(`[api/youtube/team] KV fresh MISS for ${teamSlug}`);
  } catch (kvErr) {
    if (debug) console.log(`[api/youtube/team] KV read error: ${kvErr.message}`);
  }

  // ── Layer 2: YouTube Data API ────────────────────────────────────────────
  let items = null;
  let apiPath = 'unknown';

  try {
    const rawItems = await fetchFromDataApi(team, opponent, mode, maxResults, debug);
    items    = await processAndEnrich(rawItems, team, maxResults, debug);
    apiPath  = 'data-api';
    if (debug) console.log(`[api/youtube/team] data-api SUCCESS — ${items.length} items`);
  } catch (apiErr) {
    const isQuota = /quota/i.test(apiErr.message) || /429/.test(apiErr.message) || /403/.test(apiErr.message);
    if (debug) console.log(`[api/youtube/team] data-api FAILED (${isQuota ? 'quota' : 'error'}): ${apiErr.message}`);
    console.error('[api/youtube/team] data-api error:', apiErr.message);

    // ── Layer 3: RSS fallback ──────────────────────────────────────────────
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

  // ── Write cache on success ───────────────────────────────────────────────
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
      _path: debug ? apiPath : undefined,
      _debug: debug ? { elapsedMs: Date.now() - t0 } : undefined,
    });
  }

  // ── Layer 4: KV stale last-known-good ────────────────────────────────────
  try {
    const lastKnown = await getJson(lastKnownKey);
    if (lastKnown?.items?.length > 0) {
      if (debug) console.log(`[api/youtube/team] last-known-good HIT for ${teamSlug} — ${lastKnown.items.length} items from ${lastKnown.updatedAt}`);
      return res.status(200).json({
        ...lastKnown,
        status: 'ok_stale',
        _path: debug ? 'last_known_good' : undefined,
        _debug: debug ? { elapsedMs: Date.now() - t0 } : undefined,
      });
    }
  } catch (kvErr) {
    if (debug) console.log(`[api/youtube/team] last-known-good read error: ${kvErr.message}`);
  }

  // ── Complete failure ─────────────────────────────────────────────────────
  if (debug) console.log(`[api/youtube/team] all layers exhausted for ${teamSlug} in ${Date.now()-t0}ms`);
  return res.status(200).json({
    status:    'error',
    teamSlug,
    teamName:  team.name,
    updatedAt: new Date().toISOString(),
    items:     [],
    _path:     debug ? 'exhausted' : undefined,
  });
}
