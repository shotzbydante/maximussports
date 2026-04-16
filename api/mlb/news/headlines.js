/**
 * GET /api/mlb/news/headlines — MLB headlines via Google News RSS.
 * Mirrors the CBB news aggregation pattern from api/_sources.js.
 */

import { createCache } from '../../_cache.js';
import { setJson } from '../../_globalCache.js';

const cache = createCache(15 * 60 * 1000);
const CACHE_KEY = 'mlb:headlines';
const MAX_ITEMS = 30;

const MLB_QUERIES = [
  'MLB baseball',
  'Major League Baseball',
  'MLB trade rumors',
  'MLB standings',
];

function scoreItem(item) {
  let s = 0;
  const t = (item.title || '').toLowerCase();
  if (/mlb|baseball|world series|home run|pitcher|trade/.test(t)) s += 3;
  if (/espn|fox sports|ap news|yahoo|cbs|the athletic|mlb\.com/.test((item.source || '').toLowerCase())) s += 2;
  if (/watch|stream|live|subscribe|podcast/.test(t)) s -= 3;
  return s;
}

async function fetchGoogleNewsRSS(query) {
  const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(`"${query}" when:7d`)}&hl=en-US&gl=US&ceid=US:en`;
  const r = await fetch(rssUrl, { headers: { 'User-Agent': 'MaximusSports/1.0' } });
  if (!r.ok) return [];
  const text = await r.text();
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(text)) !== null) {
    const block = match[1];
    const title = (block.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/) || [])[1] || '';
    const link = (block.match(/<link>(.*?)<\/link>/) || [])[1] || '';
    const pubDate = (block.match(/<pubDate>(.*?)<\/pubDate>/) || [])[1] || '';
    const source = (block.match(/<source[^>]*>(.*?)<\/source>/) || [])[1] || '';
    if (!title) continue;
    items.push({ title: title.trim(), link: link.trim(), pubDate, source: source.trim() });
  }
  return items;
}

function dedup(items) {
  const seen = new Set();
  return items.filter((it) => {
    const key = it.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 60);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function formatTime(pubDate) {
  if (!pubDate) return '';
  try {
    const d = new Date(pubDate);
    const now = new Date();
    const diffH = Math.floor((now - d) / (1000 * 60 * 60));
    if (diffH < 1) return 'Just now';
    if (diffH < 24) return `${diffH}h ago`;
    const diffD = Math.floor(diffH / 24);
    return `${diffD}d ago`;
  } catch { return ''; }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=1200');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const cached = cache.get(CACHE_KEY);
  if (cached) return res.status(200).json(cached);

  try {
    const results = await Promise.allSettled(MLB_QUERIES.map(fetchGoogleNewsRSS));
    let all = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
    all = dedup(all);
    all.forEach((it) => { it._score = scoreItem(it); });
    all.sort((a, b) => b._score - a._score);

    const headlines = all.slice(0, MAX_ITEMS).map((it, i) => ({
      id: `mlb-news-${i}`,
      title: it.title,
      link: it.link,
      source: it.source || 'News',
      time: formatTime(it.pubDate),
    }));

    const payload = { headlines, fetchedAt: new Date().toISOString() };
    cache.set(CACHE_KEY, payload);
    // Persist to KV so email pipeline can read directly (avoid self-fetch)
    setJson('mlb:headlines:latest', payload, { exSeconds: 1800 }).catch(() => {});
    return res.status(200).json(payload);
  } catch (err) {
    return res.status(200).json({ headlines: [], error: err?.message });
  }
}
