/**
 * GET /api/mlb/youtube/intelFeed?maxResults=8
 * MLB video feed — curated MLB/baseball videos.
 * Primary: channel-based RSS feeds (zero quota, always works).
 * Enhancement: YouTube Data API v3 when YOUTUBE_API_KEY is set.
 */

import { ytSearch } from '../../youtube/_yt.js';
import { parseYtRssXml } from '../../youtube/_ytRss.js';
import { getJson, setJson } from '../../_globalCache.js';

const KV_FRESH_KEY     = 'yt:mlb:intelFeed:fresh:v3';
const KV_LASTKNOWN_KEY = 'yt:mlb:intelFeed:lastKnown:v3';
const KV_FRESH_TTL_SEC     = 60 * 60;
const KV_LASTKNOWN_TTL_SEC = 7 * 24 * 60 * 60;
const RSS_TIMEOUT_MS       = 8000;
const DATA_API_TIMEOUT_MS  = 6000;

const hasYoutubeKey = Boolean(process.env.YOUTUBE_API_KEY);

const MLB_CHANNEL_FEEDS = [
  { url: 'https://www.youtube.com/feeds/videos.xml?user=MLB', label: 'MLB' },
  { url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCl9E4Zxa8CVr2LBLD0_TaNg', label: 'Jomboy Media' },
];

const REJECT_RE = /\bnba\b|\bnfl\b|\bnhl\b|\bsoccer\b|\bncaa\b|\bcollege basketball\b|\bncaab\b/i;

const TRUSTED_CHANNELS = [
  'espn', 'mlb', 'fox sports', 'jomboy', 'baseball doesn\'t exist',
  'talkin\' baseball', 'sny', 'nesn', 'bally sports', 'yes network',
  'mlb network', 'pitching ninja', 'baseball america', 'foul territory',
];

function scoreVideoItem(item) {
  let s = 0;
  const t = (item.title || '').toLowerCase();
  const ch = (item.channelTitle || '').toLowerCase();

  // Recency (high weight)
  if (item.publishedAt) {
    const ageH = (Date.now() - new Date(item.publishedAt).getTime()) / 3_600_000;
    if      (ageH <= 6)  s += 12;
    else if (ageH <= 24) s += 8;
    else if (ageH <= 72) s += 4;
    else if (ageH <= 168) s += 2;
  }

  // Title keywords
  if (/highlight|recap/i.test(t)) s += 5;
  if (/walk.?off|grand slam|home run|no.?hitter|perfect game/i.test(t)) s += 4;
  if (/top play|breakdown|analysis/i.test(t)) s += 3;
  if (/mlb|baseball|pitching|batting|inning|spring training/i.test(t)) s += 2;

  // Source trust (light boost)
  if (TRUSTED_CHANNELS.some((tc) => ch.includes(tc))) s += 3;
  if (/espn|mlb/i.test(ch)) s += 2;

  // Metadata completeness
  if (item.thumbUrl) s += 1;
  if (item.publishedAt) s += 1;

  // Penalties
  if (/watch live|subscribe|podcast|\bad\b/i.test(t)) s -= 4;
  if (REJECT_RE.test(t)) s -= 8;

  // Source bonus — Data API items tend to have richer metadata
  if (item._source === 'api') s += 1;

  return s;
}

function dedup(items) {
  const seen = new Set();
  return items.filter((it) => {
    const key = it.videoId;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mergeAndRank(allItems) {
  const filtered = allItems.filter((it) => {
    const t = (it.title || '').toLowerCase();
    return !REJECT_RE.test(t);
  });
  const deduped = dedup(filtered);
  const scored = deduped.map((it) => ({
    videoId:      it.videoId,
    title:        it.title,
    channelTitle: it.channelTitle,
    publishedAt:  it.publishedAt,
    thumbUrl:     it.thumbUrl || `https://i.ytimg.com/vi/${it.videoId}/mqdefault.jpg`,
    _score:       scoreVideoItem(it),
  }));
  scored.sort((a, b) => b._score - a._score);
  return scored.slice(0, 18).map(({ _score, ...rest }) => rest);
}

async function fetchChannelRss(feedUrl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RSS_TIMEOUT_MS);
  try {
    const r = await fetch(feedUrl, {
      headers: { 'User-Agent': 'MaximusSports/1.0' },
      signal: controller.signal,
    });
    if (!r.ok) return [];
    const xml = await r.text();
    return parseYtRssXml(xml).map((it) => ({ ...it, _source: 'rss' }));
  } catch { return []; }
  finally { clearTimeout(timer); }
}

async function fetchFromChannelFeeds() {
  const results = await Promise.allSettled(
    MLB_CHANNEL_FEEDS.map((f) => fetchChannelRss(f.url))
  );
  return results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
}

async function fetchFromDataApi() {
  if (!hasYoutubeKey) return [];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DATA_API_TIMEOUT_MS);
  try {
    const results = await Promise.allSettled([
      ytSearch({ q: 'MLB highlights today', maxResults: 8 }),
      ytSearch({ q: 'ESPN MLB highlights', maxResults: 6 }),
    ]);
    return results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
      .map((it) => ({ ...it, _source: 'api' }));
  } catch { return []; }
  finally { clearTimeout(timer); }
}

async function tryStaleCache(maxResults) {
  try {
    const lastKnown = await getJson(KV_LASTKNOWN_KEY);
    if (lastKnown?.items?.length > 0) {
      return { ...lastKnown, status: 'ok_stale', items: lastKnown.items.slice(0, maxResults) };
    }
  } catch {}
  return null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=1200');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const t0 = Date.now();
  const maxResults = Math.min(Math.max(parseInt(new URL(req.url, 'http://localhost').searchParams.get('maxResults') || '8', 10), 1), 18);
  const log = { endpoint: 'mlb/youtube/intelFeed', hasYoutubeKey };

  // 1. Fresh KV cache
  try {
    const kvFresh = await getJson(KV_FRESH_KEY);
    if (kvFresh?.items?.length > 0) {
      log.usedCache = 'fresh'; log.finalCount = Math.min(kvFresh.items.length, maxResults); log.durationMs = Date.now() - t0;
      console.log('[mlb/yt/intelFeed]', JSON.stringify(log));
      return res.status(200).json({ ...kvFresh, items: kvFresh.items.slice(0, maxResults) });
    }
  } catch {}

  // 2. Parallel fetch: channel RSS + optional Data API
  let rssItems = [], apiItems = [];
  const [rssResult, apiResult] = await Promise.allSettled([
    fetchFromChannelFeeds(),
    fetchFromDataApi(),
  ]);

  log.rssAttempted = true;
  log.rssSucceeded = rssResult.status === 'fulfilled';
  rssItems = rssResult.status === 'fulfilled' ? rssResult.value : [];
  log.rssCount = rssItems.length;

  log.dataApiAttempted = hasYoutubeKey;
  log.dataApiSucceeded = apiResult.status === 'fulfilled';
  apiItems = apiResult.status === 'fulfilled' ? apiResult.value : [];
  log.dataApiCount = apiItems.length;

  const merged = [...rssItems, ...apiItems];
  log.mergedCount = merged.length;

  const items = mergeAndRank(merged);
  log.finalCount = items.length;

  if (items.length > 0) {
    const payload = { status: 'ok', updatedAt: new Date().toISOString(), items };
    setJson(KV_FRESH_KEY, payload, { exSeconds: KV_FRESH_TTL_SEC }).catch(() => {});
    setJson(KV_LASTKNOWN_KEY, payload, { exSeconds: KV_LASTKNOWN_TTL_SEC }).catch(() => {});
    log.durationMs = Date.now() - t0;
    console.log('[mlb/yt/intelFeed]', JSON.stringify(log));
    return res.status(200).json({ ...payload, items: items.slice(0, maxResults) });
  }

  // 3. Stale cache fallback — never cache empty
  const stale = await tryStaleCache(maxResults);
  if (stale) {
    log.usedStale = true; log.durationMs = Date.now() - t0;
    console.log('[mlb/yt/intelFeed]', JSON.stringify(log));
    return res.status(200).json(stale);
  }

  log.usedStale = false; log.durationMs = Date.now() - t0;
  console.log('[mlb/yt/intelFeed]', JSON.stringify(log));
  return res.status(200).json({ status: 'error', updatedAt: new Date().toISOString(), items: [] });
}
