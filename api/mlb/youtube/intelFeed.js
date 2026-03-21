/**
 * GET /api/mlb/youtube/intelFeed?maxResults=8
 * MLB video feed — curated MLB/baseball videos.
 * Primary: channel-based RSS feeds (zero quota, always works).
 * Optional: YouTube Data API v3 when YOUTUBE_API_KEY is set.
 */

import { ytSearch } from '../../youtube/_yt.js';
import { parseYtRssXml } from '../../youtube/_ytRss.js';
import { getJson, setJson } from '../../_globalCache.js';

const KV_FRESH_KEY     = 'yt:mlb:intelFeed:fresh:v3';
const KV_LASTKNOWN_KEY = 'yt:mlb:intelFeed:lastKnown:v3';
const KV_FRESH_TTL_SEC     = 60 * 60;
const KV_LASTKNOWN_TTL_SEC = 7 * 24 * 60 * 60;
const RSS_TIMEOUT_MS       = 8000;

// Reliable channel-based RSS feeds (no API key needed)
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

function scoreItem(item) {
  let s = 0;
  const t = (item.title || '').toLowerCase();
  const ch = (item.channelTitle || '').toLowerCase();
  if (/mlb|baseball|home run|pitching|batting|inning|spring training/.test(t)) s += 3;
  if (/highlight|recap|top play|walk.?off|grand slam/.test(t)) s += 2;
  if (TRUSTED_CHANNELS.some((tc) => ch.includes(tc))) s += 4;
  if (/espn|mlb/i.test(ch)) s += 2;
  if (/watch live|subscribe|podcast|\bad\b/i.test(t)) s -= 4;
  if (REJECT_RE.test(t)) s -= 5;
  return s;
}

function dedup(items) {
  const seen = new Set();
  return items.filter((it) => {
    if (seen.has(it.videoId)) return false;
    seen.add(it.videoId);
    return true;
  });
}

function processItems(allItems) {
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
    _score:       scoreItem(it),
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
    return parseYtRssXml(xml);
  } catch { return []; }
  finally { clearTimeout(timer); }
}

async function fetchFromChannelFeeds() {
  const results = await Promise.allSettled(
    MLB_CHANNEL_FEEDS.map((f) => fetchChannelRss(f.url))
  );
  const allItems = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
  return processItems(allItems);
}

async function fetchFromDataApi() {
  if (!process.env.YOUTUBE_API_KEY) return [];
  const results = await Promise.allSettled([
    ytSearch({ q: 'MLB highlights today', maxResults: 8 }),
    ytSearch({ q: 'ESPN MLB highlights', maxResults: 6 }),
  ]);
  const allItems = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
  return processItems(allItems);
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

  const maxResults = Math.min(Math.max(parseInt(new URL(req.url, 'http://localhost').searchParams.get('maxResults') || '8', 10), 1), 18);

  // 1. Fresh KV cache
  try {
    const kvFresh = await getJson(KV_FRESH_KEY);
    if (kvFresh?.items?.length > 0) {
      return res.status(200).json({ ...kvFresh, items: kvFresh.items.slice(0, maxResults) });
    }
  } catch {}

  // 2. Fetch from channel feeds (always works) + optional Data API
  let items = [];
  try {
    const [channelItems, apiItems] = await Promise.allSettled([
      fetchFromChannelFeeds(),
      fetchFromDataApi(),
    ]);
    const all = [
      ...(channelItems.status === 'fulfilled' ? channelItems.value : []),
      ...(apiItems.status === 'fulfilled' ? apiItems.value : []),
    ];
    items = processItems(all);
  } catch {}

  if (items.length > 0) {
    const payload = { status: 'ok', updatedAt: new Date().toISOString(), items };
    setJson(KV_FRESH_KEY, payload, { exSeconds: KV_FRESH_TTL_SEC }).catch(() => {});
    setJson(KV_LASTKNOWN_KEY, payload, { exSeconds: KV_LASTKNOWN_TTL_SEC }).catch(() => {});
    return res.status(200).json({ ...payload, items: items.slice(0, maxResults) });
  }

  // 3. Stale cache fallback
  const stale = await tryStaleCache(maxResults);
  if (stale) return res.status(200).json(stale);

  return res.status(200).json({ status: 'error', updatedAt: new Date().toISOString(), items: [] });
}
