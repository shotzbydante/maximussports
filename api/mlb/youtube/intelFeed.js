/**
 * GET /api/mlb/youtube/intelFeed?maxResults=8
 * MLB video feed — curated MLB/baseball videos via YouTube RSS (zero quota).
 * Mirrors the NCAAM intelFeed architecture but uses MLB-specific queries.
 */

import { createCache } from '../../_cache.js';
import { getJson, setJson } from '../../_globalCache.js';

const cache = createCache(30 * 60 * 1000);
const CACHE_KEY = 'mlb:yt:intelFeed';

const KV_FRESH_KEY     = 'yt:mlb:intelFeed:fresh:v1';
const KV_LASTKNOWN_KEY = 'yt:mlb:intelFeed:lastKnown:v1';
const KV_FRESH_TTL_SEC     = 60 * 60;
const KV_LASTKNOWN_TTL_SEC = 7 * 24 * 60 * 60;

const MLB_QUERIES = [
  'MLB highlights today',
  'MLB baseball recap',
  'ESPN MLB highlights',
  'MLB top plays',
];

const TRUSTED_CHANNELS = [
  'espn', 'mlb', 'fox sports', 'jomboy', 'baseball doesn\'t exist',
  'talkin\' baseball', 'sny', 'nesn', 'bally sports', 'yes network',
  'mlb network', 'pitching ninja', 'baseball america', 'foul territory',
];

function scoreItem(item) {
  let s = 0;
  const t = (item.title || '').toLowerCase();
  const ch = (item.channelTitle || '').toLowerCase();
  if (/mlb|baseball|home run|pitching|batting|inning/.test(t)) s += 3;
  if (/highlight|recap|top play|walk.?off|grand slam/.test(t)) s += 2;
  if (TRUSTED_CHANNELS.some((tc) => ch.includes(tc))) s += 4;
  if (/espn|mlb/i.test(ch)) s += 2;
  if (/watch live|subscribe|podcast|ad\b/i.test(t)) s -= 4;
  if (/nba|nfl|nhl|soccer|ncaa|college basketball/i.test(t)) s -= 5;
  return s;
}

async function fetchYouTubeRSS(query) {
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=CAISBAgBEAE%253D`;
  const rssUrl = `https://www.youtube.com/feeds/videos.xml?search_query=${encodeURIComponent(query)}`;

  try {
    const r = await fetch(rssUrl, {
      headers: { 'User-Agent': 'MaximusSports/1.0' },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return [];
    const text = await r.text();
    const items = [];
    const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
    let match;
    while ((match = entryRegex.exec(text)) !== null && items.length < 12) {
      const block = match[1];
      const videoId = (block.match(/<yt:videoId>(.*?)<\/yt:videoId>/) || [])[1] || '';
      const title = (block.match(/<title>(.*?)<\/title>/) || [])[1] || '';
      const channelTitle = (block.match(/<name>(.*?)<\/name>/) || [])[1] || '';
      const published = (block.match(/<published>(.*?)<\/published>/) || [])[1] || '';
      if (!videoId || !title) continue;
      const thumbUrl = `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
      items.push({ videoId, title, channelTitle, publishedAt: published, thumbUrl });
    }
    return items;
  } catch { return []; }
}

function dedup(items) {
  const seen = new Set();
  return items.filter((it) => {
    if (seen.has(it.videoId)) return false;
    seen.add(it.videoId);
    return true;
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=1200');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const maxResults = Math.min(Math.max(parseInt(new URL(req.url, 'http://localhost').searchParams.get('maxResults') || '8', 10), 1), 18);

  const mem = cache.get(CACHE_KEY);
  if (mem) return res.status(200).json({ ...mem, items: mem.items.slice(0, maxResults) });

  const kvFresh = await getJson(KV_FRESH_KEY).catch(() => null);
  if (kvFresh?.items) {
    cache.set(CACHE_KEY, kvFresh);
    return res.status(200).json({ ...kvFresh, items: kvFresh.items.slice(0, maxResults) });
  }

  try {
    const results = await Promise.allSettled(MLB_QUERIES.map(fetchYouTubeRSS));
    let all = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
    all = dedup(all);

    all = all.filter((it) => {
      const t = (it.title || '').toLowerCase();
      return !/nba|nfl|nhl|soccer|ncaa|college basketball/i.test(t);
    });

    const scored = all.map((it) => ({ ...it, _score: scoreItem(it) }));
    scored.sort((a, b) => b._score - a._score);

    const items = scored.slice(0, 18).map(({ _score, ...rest }) => rest);
    const payload = { status: 'ok', updatedAt: new Date().toISOString(), items };

    cache.set(CACHE_KEY, payload);
    await Promise.all([
      setJson(KV_FRESH_KEY, payload, { exSeconds: KV_FRESH_TTL_SEC }),
      setJson(KV_LASTKNOWN_KEY, payload, { exSeconds: KV_LASTKNOWN_TTL_SEC }),
    ]).catch(() => {});

    return res.status(200).json({ ...payload, items: items.slice(0, maxResults) });
  } catch (err) {
    const stale = await getJson(KV_LASTKNOWN_KEY).catch(() => null);
    if (stale?.items) return res.status(200).json({ ...stale, status: 'ok_stale', items: stale.items.slice(0, maxResults) });
    return res.status(200).json({ status: 'error', items: [], error: err?.message });
  }
}
