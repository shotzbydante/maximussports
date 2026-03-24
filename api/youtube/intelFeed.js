/**
 * Intel Feed endpoint — curated NCAAM men's basketball videos for /news page.
 * GET /api/youtube/intelFeed
 *
 * Supports optional ?conference= param for conference-specific video filtering.
 *
 * Reliability strategy (executed in order):
 *   1. KV fresh cache (1 h)                  → return immediately, zero quota
 *   2. KV stale last-known-good (7 d)         → prioritised when circuit breaker active
 *   3. RSS fallback (zero quota)              → always available
 *   4. YouTube Data API (3 queries)           → skipped when circuit breaker active
 *   5. KV stale last-known-good (absolute)    → rescue when all live paths fail
 *
 * Response: { status, updatedAt, items: [{videoId, title, channelTitle, publishedAt, thumbUrl, score}] }
 */

import { TEAMS } from '../../data/teams.js';
import { ytSearch, ytVideosDetails, scoreItem, classifyBasketballItem, isQuotaExhausted, parseISO8601Duration } from './_yt.js';
import { ytRssSearch, safeRssQuery, fetchChannelRssFeeds } from './_ytRss.js';
import { getJson, setJson } from '../_globalCache.js';
import { CONF_NETWORK_MAP } from './_conferenceNetworks.js';

const LOCK_TEAMS = TEAMS.filter((t) => t.oddsTier === 'Lock');

const KV_FRESH_KEY     = 'yt:intelFeed:fresh:v3';
const KV_LASTKNOWN_KEY = 'yt:intelFeed:lastKnown:v3';
const KV_FRESH_TTL_SEC     = 60 * 60;
const KV_LASTKNOWN_TTL_SEC = 7 * 24 * 60 * 60;

const MIN_DURATION_SEC = 30;
const MAX_DURATION_SEC = 45 * 60;

function dedupeById(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (seen.has(item.videoId)) return false;
    seen.add(item.videoId);
    return true;
  });
}

async function filterByDuration(items, debug) {
  if (items.length === 0) return items;
  try {
    const ids = items.map((i) => i.videoId).filter(Boolean);
    if (ids.length === 0) return items;
    const details = await ytVideosDetails(ids, { debug });
    return items.filter((item) => {
      const d = details[item.videoId];
      if (!d || d.durationSeconds == null) return true;
      return d.durationSeconds >= MIN_DURATION_SEC && d.durationSeconds <= MAX_DURATION_SEC;
    });
  } catch {
    return items;
  }
}

function processItems(allItems, debug) {
  const filtered = allItems.filter((item) => classifyBasketballItem(item) === 'accept');
  if (debug) console.log(`[intelFeed] after NCAAM filter: ${filtered.length}`);

  const deduped = dedupeById(filtered);
  const scored = deduped.map((item) => ({
    videoId:      item.videoId,
    title:        item.title,
    channelTitle: item.channelTitle,
    publishedAt:  item.publishedAt,
    thumbUrl:     item.thumbUrl,
    score:        scoreItem(item) + (item._lockBonus || 0),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 18);
}

async function fetchFromDataApi(debug, conference) {
  const currentYear = new Date().getFullYear();
  const lockTeam = LOCK_TEAMS[0];

  const queries = conference
    ? [
        { q: `${conference} basketball highlights ${currentYear}`, maxResults: 10, lockBonus: 0 },
        { q: `${CONF_NETWORK_MAP[conference] || conference} basketball ${currentYear}`, maxResults: 8, lockBonus: 0 },
      ]
    : [
        { q: `men's college basketball highlights ${currentYear}`, maxResults: 10, lockBonus: 0 },
        { q: `NCAAB top plays recap ${currentYear}`, maxResults: 8, lockBonus: 0 },
        ...(lockTeam
          ? [{ q: `${lockTeam.keywords || lockTeam.name + ' basketball'} highlights`, maxResults: 5, lockBonus: 20 }]
          : []),
      ];

  const results = await Promise.allSettled(
    queries.map(async ({ q, maxResults, lockBonus }) => {
      const items = await ytSearch({ q, maxResults, debug });
      return items.map((item) => ({ ...item, _lockBonus: lockBonus }));
    })
  );

  const allItems = results
    .filter((r) => r.status === 'fulfilled')
    .flatMap((r) => r.value);

  if (debug) console.log(`[intelFeed] data-api raw count: ${allItems.length}${conference ? ` (conf=${conference})` : ''}`);
  if (allItems.length === 0) throw new Error('data-api returned empty results');

  const processed = processItems(allItems, debug);
  return filterByDuration(processed, debug);
}

async function fetchFromRss(debug, conference) {
  const q = safeRssQuery(conference ? `${conference} basketball highlights` : 'college basketball highlights');
  if (debug) console.log(`[intelFeed] trying RSS fallback q="${q}"`);
  const items = await ytRssSearch({ q, debug });
  if (debug) console.log(`[intelFeed] RSS raw count: ${items.length}`);
  if (items.length === 0) throw new Error('RSS returned empty results');
  return processItems(items, debug);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=3600');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const urlObj = new URL(req.url || '/', 'http://localhost');
  const debug = urlObj.searchParams.get('debugYT') === '1'
    || urlObj.searchParams.get('debugVideos') === '1';
  const conference = urlObj.searchParams.get('conference') || null;

  const freshKey = conference ? `${KV_FRESH_KEY}:conf:${conference}` : KV_FRESH_KEY;
  const lastKnownKey = conference ? `${KV_LASTKNOWN_KEY}:conf:${conference}` : KV_LASTKNOWN_KEY;

  try {
    const cached = await getJson(freshKey);
    if (cached?.items?.length > 0) {
      if (debug) console.log(`[intelFeed] KV fresh HIT — ${cached.items.length} items`);
      return res.status(200).json({ ...cached, _path: debug ? 'kv_fresh' : undefined });
    }
  } catch (kvErr) {
    if (debug) console.log(`[intelFeed] KV read error: ${kvErr.message}`);
  }

  const quotaActive = await isQuotaExhausted();
  if (debug && quotaActive) console.log('[intelFeed] quota circuit breaker ACTIVE');

  if (quotaActive) {
    try {
      const lastKnown = await getJson(lastKnownKey);
      if (lastKnown?.items?.length > 0) {
        return res.status(200).json({ ...lastKnown, status: 'ok_stale', _path: debug ? 'kv_stale_breaker' : undefined });
      }
    } catch {}
  }

  let items = null;
  let apiPath = 'unknown';

  if (quotaActive) {
    try {
      items = await fetchFromRss(debug, conference);
      apiPath = 'rss_fallback_breaker';
    } catch (rssErr) {
      if (debug) console.log(`[intelFeed] RSS search FAILED (breaker): ${rssErr.message}`);
    }
  } else {
    try {
      items = await fetchFromDataApi(debug, conference);
      apiPath = 'data-api';
    } catch (apiErr) {
      if (debug) console.log(`[intelFeed] data-api FAILED: ${apiErr.message}`);
      try {
        items = await fetchFromRss(debug, conference);
        apiPath = 'rss_fallback';
      } catch (rssErr) {
        if (debug) console.log(`[intelFeed] RSS search FAILED: ${rssErr.message}`);
      }
    }
  }

  // Channel-based RSS fallback — always works, never returns 400
  if (!items || items.length === 0) {
    try {
      if (debug) console.log('[intelFeed] trying channel RSS feeds (reliable fallback)');
      const channelItems = await fetchChannelRssFeeds({ debug });
      const channelProcessed = processItems(channelItems, debug);
      if (channelProcessed.length > 0) {
        items = channelProcessed;
        apiPath = 'channel_rss';
      }
    } catch (chErr) {
      if (debug) console.log(`[intelFeed] channel RSS FAILED: ${chErr.message}`);
    }
  }

  if (items && items.length > 0) {
    const payload = { status: 'ok', updatedAt: new Date().toISOString(), items };
    setJson(freshKey, payload, { exSeconds: KV_FRESH_TTL_SEC }).catch(() => {});
    setJson(lastKnownKey, payload, { exSeconds: KV_LASTKNOWN_TTL_SEC }).catch(() => {});
    return res.status(200).json({ ...payload, _path: debug ? apiPath : undefined });
  }

  // Rescue: always try lastKnown before returning empty (regardless of quota state)
  try {
    const lastKnown = await getJson(lastKnownKey);
    if (lastKnown?.items?.length > 0) {
      if (debug) console.log(`[intelFeed] rescue from lastKnown — ${lastKnown.items.length} items`);
      return res.status(200).json({ ...lastKnown, status: 'ok_stale', _path: debug ? 'kv_stale_rescue' : undefined });
    }
  } catch {}

  // Truly no data anywhere — set short cache so ISR retries soon
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
  return res.status(200).json({
    status: 'error', updatedAt: new Date().toISOString(), items: [],
    _path: debug ? 'exhausted' : undefined,
  });
}
