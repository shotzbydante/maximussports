/**
 * Intel Feed endpoint — curated NCAAM men's basketball videos for /news page.
 * GET /api/youtube/intelFeed
 *
 * 3-layer reliability strategy:
 *   1. KV fresh cache (1-hour TTL) → return immediately, zero quota
 *   2. YouTube Data API (2 queries max, reduced from 4)
 *   3. RSS fallback (zero quota) → used when quota is exhausted or API fails
 *   4. KV stale last-known-good (7-day TTL) → absolute fallback
 *
 * ?debugVideos=1  logs which path was used (data-api / cached / rss / last-known-good)
 *
 * Response: { status, updatedAt, items: [{videoId, title, channelTitle, publishedAt, thumbUrl, score}] }
 */

import { TEAMS } from '../../data/teams.js';
import { ytSearch, scoreItem, classifyBasketballItem } from './_yt.js';
import { ytRssSearch } from './_ytRss.js';
import { getJson, setJson } from '../_globalCache.js';

const LOCK_TEAMS = TEAMS.filter((t) => t.oddsTier === 'Lock');

// KV keys
const KV_FRESH_KEY     = 'yt:intelFeed:fresh:v2';
const KV_LASTKNOWN_KEY = 'yt:intelFeed:lastKnown:v2';
const KV_FRESH_TTL_SEC     = 60 * 60;          // 1 hour
const KV_LASTKNOWN_TTL_SEC = 7 * 24 * 60 * 60; // 7 days

function dedupeById(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (seen.has(item.videoId)) return false;
    seen.add(item.videoId);
    return true;
  });
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
  return scored.slice(0, 15);
}

async function fetchFromDataApi(debug) {
  const currentYear = new Date().getFullYear();

  // Reduced to 2 queries (down from 4) to cut quota burn by ~50%
  // Query 1: general NCAAM highlights
  // Query 2: one lock team spotlight (most prominent)
  const lockTeam = LOCK_TEAMS[0];
  const queries = [
    {
      q: `men's college basketball highlights ${currentYear}`,
      maxResults: 10,
      lockBonus: 0,
    },
    ...(lockTeam
      ? [{
          q: `${lockTeam.keywords || lockTeam.name + ' basketball'} highlights`,
          maxResults: 5,
          lockBonus: 20,
        }]
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

  if (debug) console.log(`[intelFeed] data-api raw count: ${allItems.length}`);

  if (allItems.length === 0) {
    throw new Error('data-api returned empty results');
  }

  return processItems(allItems, debug);
}

async function fetchFromRss(debug) {
  // Single RSS query covering general NCAAM highlights — zero quota
  const q = "college basketball highlights NCAA men";
  if (debug) console.log(`[intelFeed] trying RSS fallback q="${q}"`);

  const items = await ytRssSearch({ q, debug });
  if (debug) console.log(`[intelFeed] RSS raw count: ${items.length}`);

  if (items.length === 0) {
    throw new Error('RSS returned empty results');
  }

  return processItems(items, debug);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  // CDN-level caching preserved; KV handles server-side cost reduction
  res.setHeader('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=3600');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const urlObj = new URL(req.url || '/', 'http://localhost');
  const debug = urlObj.searchParams.get('debugYT') === '1'
    || urlObj.searchParams.get('debugVideos') === '1';

  // ── Layer 1: KV fresh cache ──────────────────────────────────────────────
  try {
    const cached = await getJson(KV_FRESH_KEY);
    if (cached?.items?.length > 0) {
      if (debug) console.log(`[intelFeed] KV fresh cache HIT — ${cached.items.length} items, age=${Math.round((Date.now() - new Date(cached.updatedAt).getTime()) / 60000)}m`);
      return res.status(200).json({
        ...cached,
        _path: debug ? 'kv_fresh' : undefined,
      });
    }
    if (debug) console.log(`[intelFeed] KV fresh cache MISS`);
  } catch (kvErr) {
    if (debug) console.log(`[intelFeed] KV read error: ${kvErr.message}`);
  }

  // ── Layer 2: YouTube Data API ────────────────────────────────────────────
  let items = null;
  let apiPath = 'unknown';

  try {
    items = await fetchFromDataApi(debug);
    apiPath = 'data-api';
    if (debug) console.log(`[intelFeed] data-api SUCCESS — ${items.length} items`);
  } catch (apiErr) {
    const isQuota = /quota/i.test(apiErr.message) || /429/.test(apiErr.message) || /403/.test(apiErr.message);
    const isMissingKey = /YOUTUBE_API_KEY/.test(apiErr.message);
    if (debug) console.log(`[intelFeed] data-api FAILED (${isMissingKey ? 'missing_key' : isQuota ? 'quota' : 'error'}): ${apiErr.message}`);
    console.error(`[intelFeed] data-api error (${isMissingKey ? 'missing_key' : isQuota ? 'quota_exceeded' : 'unknown'}):`, apiErr.message);

    // ── Layer 3: RSS fallback ────────────────────────────────────────────
    try {
      items = await fetchFromRss(debug);
      apiPath = 'rss_fallback';
      if (debug) console.log(`[intelFeed] RSS fallback SUCCESS — ${items.length} items`);
    } catch (rssErr) {
      if (debug) console.log(`[intelFeed] RSS fallback FAILED: ${rssErr.message}`);
      console.error(`[intelFeed] RSS fallback error:`, rssErr.message);
    }
  }

  // ── Write cache on success (before returning last-known-good) ────────────
  if (items && items.length > 0) {
    const payload = {
      status:    'ok',
      updatedAt: new Date().toISOString(),
      items,
    };
    // Write fresh (fire-and-forget)
    setJson(KV_FRESH_KEY, payload, { exSeconds: KV_FRESH_TTL_SEC }).catch(() => {});
    // Write last-known-good (fire-and-forget)
    setJson(KV_LASTKNOWN_KEY, payload, { exSeconds: KV_LASTKNOWN_TTL_SEC }).catch(() => {});

    return res.status(200).json({
      ...payload,
      _path: debug ? apiPath : undefined,
    });
  }

  // ── Layer 4: KV stale last-known-good ────────────────────────────────────
  try {
    const lastKnown = await getJson(KV_LASTKNOWN_KEY);
    if (lastKnown?.items?.length > 0) {
      if (debug) console.log(`[intelFeed] last-known-good HIT — ${lastKnown.items.length} items from ${lastKnown.updatedAt}`);
      return res.status(200).json({
        ...lastKnown,
        status: 'ok_stale',
        _path: debug ? 'last_known_good' : undefined,
      });
    }
  } catch (kvErr) {
    if (debug) console.log(`[intelFeed] last-known-good read error: ${kvErr.message}`);
  }

  // ── Complete failure — return empty with error status ────────────────────
  if (debug) console.log(`[intelFeed] all layers exhausted — returning empty`);
  return res.status(200).json({
    status:    'error',
    updatedAt: new Date().toISOString(),
    items:     [],
    _path:     debug ? 'exhausted' : undefined,
  });
}
