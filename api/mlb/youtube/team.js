/**
 * GET /api/mlb/youtube/team?teamSlug=nyy&maxResults=6
 * Team-specific MLB video feed.
 * Uses YouTube Data API v3 as primary, RSS as fallback.
 */

import { ytSearch, isQuotaExhausted } from '../../youtube/_yt.js';
import { createCache } from '../../_cache.js';
import { getJson, setJson } from '../../_globalCache.js';

const cache = createCache(30 * 60 * 1000);
const kvFreshKey     = (slug) => `yt:mlb:team:${slug}:fresh:v1`;
const kvLastKnownKey = (slug) => `yt:mlb:team:${slug}:lastKnown:v1`;
const KV_FRESH_TTL_SEC     = 60 * 60;
const KV_LASTKNOWN_TTL_SEC = 7 * 24 * 60 * 60;
const RSS_TIMEOUT_MS       = 8000;

const MLB_TEAMS_SEARCH = {
  nyy: 'New York Yankees', bos: 'Boston Red Sox', tor: 'Toronto Blue Jays',
  tb: 'Tampa Bay Rays', bal: 'Baltimore Orioles', cle: 'Cleveland Guardians',
  min: 'Minnesota Twins', det: 'Detroit Tigers', cws: 'Chicago White Sox',
  kc: 'Kansas City Royals', hou: 'Houston Astros', sea: 'Seattle Mariners',
  tex: 'Texas Rangers', laa: 'Los Angeles Angels', oak: 'Oakland Athletics',
  atl: 'Atlanta Braves', nym: 'New York Mets', phi: 'Philadelphia Phillies',
  mia: 'Miami Marlins', wsh: 'Washington Nationals', chc: 'Chicago Cubs',
  mil: 'Milwaukee Brewers', stl: 'St. Louis Cardinals', pit: 'Pittsburgh Pirates',
  cin: 'Cincinnati Reds', lad: 'Los Angeles Dodgers', sd: 'San Diego Padres',
  sf: 'San Francisco Giants', ari: 'Arizona Diamondbacks', col: 'Colorado Rockies',
};

function decodeEntities(str) {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'").replace(/&apos;/g, "'").replace(/&quot;/g, '"');
}

async function fetchYouTubeRSS(query) {
  const rssUrl = `https://www.youtube.com/feeds/videos.xml?search_query=${encodeURIComponent(query)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RSS_TIMEOUT_MS);
  try {
    const r = await fetch(rssUrl, {
      headers: { 'User-Agent': 'MaximusSports/1.0' },
      signal: controller.signal,
    });
    if (!r.ok) return [];
    const text = await r.text();
    const items = [];
    const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
    let match;
    while ((match = entryRegex.exec(text)) !== null && items.length < 12) {
      const block = match[1];
      const videoId = (block.match(/<yt:videoId>(.*?)<\/yt:videoId>/) || [])[1] || '';
      const title = decodeEntities((block.match(/<title>(.*?)<\/title>/) || [])[1] || '');
      const channelTitle = decodeEntities((block.match(/<name>(.*?)<\/name>/) || [])[1] || '');
      const published = (block.match(/<published>(.*?)<\/published>/) || [])[1] || '';
      if (!videoId || !title) continue;
      const thumbUrl = `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
      items.push({ videoId, title, channelTitle, publishedAt: published, thumbUrl });
    }
    return items;
  } catch { return []; }
  finally { clearTimeout(timer); }
}

function scoreTeamItem(item, teamName) {
  let s = 0;
  const t = (item.title || '').toLowerCase();
  const ch = (item.channelTitle || '').toLowerCase();
  const nameParts = teamName.toLowerCase().split(' ');
  if (nameParts.some((p) => p.length > 3 && t.includes(p))) s += 5;
  if (/espn|mlb|fox sports/i.test(ch)) s += 3;
  if (/highlight|recap|analysis/i.test(t)) s += 2;
  if (/nba|nfl|nhl|soccer|ncaa|college basketball/i.test(t)) s -= 6;
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

function processTeamItems(allItems, teamName) {
  const deduped = dedup(allItems);
  const scored = deduped.map((it) => ({ ...it, _score: scoreTeamItem(it, teamName) }));
  scored.sort((a, b) => b._score - a._score);
  return scored.slice(0, 12).map(({ _score, ...rest }) => rest);
}

async function fetchFromDataApi(teamName) {
  const mascot = teamName.split(' ').slice(-1)[0]; // e.g. "Yankees"
  const results = await Promise.allSettled([
    ytSearch({ q: `${teamName} highlights`, maxResults: 6 }),
    ytSearch({ q: `${mascot} MLB baseball`, maxResults: 4 }),
  ]);
  return results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
}

async function fetchFromRss(teamName) {
  const mascot = teamName.split(' ').slice(-1)[0];
  const results = await Promise.allSettled([
    fetchYouTubeRSS(`${teamName} highlights`),
    fetchYouTubeRSS(`${mascot} MLB baseball`),
  ]);
  return results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
}

async function tryStaleCache(teamSlug, maxResults) {
  try {
    const stale = await getJson(kvLastKnownKey(teamSlug));
    if (stale?.items?.length > 0) {
      return { ...stale, status: 'ok_stale', items: stale.items.slice(0, maxResults) };
    }
  } catch {}
  return null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=1200');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const params = new URL(req.url, 'http://localhost').searchParams;
  const teamSlug = params.get('teamSlug') || '';
  const maxResults = Math.min(Math.max(parseInt(params.get('maxResults') || '6', 10), 1), 12);

  const teamName = MLB_TEAMS_SEARCH[teamSlug];
  if (!teamName) return res.status(400).json({ error: 'Unknown teamSlug' });

  // Memory cache
  const memKey = `mlb:yt:team:${teamSlug}`;
  const mem = cache.get(memKey);
  if (mem?.items?.length > 0) return res.status(200).json({ ...mem, items: mem.items.slice(0, maxResults) });

  // KV fresh cache
  const kvFresh = await getJson(kvFreshKey(teamSlug)).catch(() => null);
  if (kvFresh?.items?.length > 0) {
    cache.set(memKey, kvFresh);
    return res.status(200).json({ ...kvFresh, items: kvFresh.items.slice(0, maxResults) });
  }

  try {
    let allItems = [];
    const quotaActive = await isQuotaExhausted();

    if (!quotaActive) {
      try {
        allItems = await fetchFromDataApi(teamName);
      } catch {
        allItems = await fetchFromRss(teamName);
      }
    } else {
      allItems = await fetchFromRss(teamName);
    }

    const items = processTeamItems(allItems, teamName);

    // Don't cache empty results — fall through to stale cache instead
    if (items.length === 0) {
      const stale = await tryStaleCache(teamSlug, maxResults);
      if (stale) return res.status(200).json(stale);
      return res.status(200).json({ status: 'ok', teamSlug, teamName, updatedAt: new Date().toISOString(), items: [] });
    }

    const payload = { status: 'ok', teamSlug, teamName, updatedAt: new Date().toISOString(), items };
    cache.set(memKey, payload);
    await Promise.all([
      setJson(kvFreshKey(teamSlug), payload, { exSeconds: KV_FRESH_TTL_SEC }),
      setJson(kvLastKnownKey(teamSlug), payload, { exSeconds: KV_LASTKNOWN_TTL_SEC }),
    ]).catch(() => {});

    return res.status(200).json({ ...payload, items: items.slice(0, maxResults) });
  } catch (err) {
    const stale = await tryStaleCache(teamSlug, maxResults);
    if (stale) return res.status(200).json(stale);
    return res.status(200).json({ status: 'error', teamSlug, items: [], error: err?.message });
  }
}
