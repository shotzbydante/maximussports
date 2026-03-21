/**
 * GET /api/mlb/youtube/team?teamSlug=nyy&maxResults=6
 * Team-specific MLB video feed.
 * Primary: MLB channel RSS filtered by team name.
 * Optional: YouTube Data API v3 when YOUTUBE_API_KEY is set.
 */

import { ytSearch } from '../../youtube/_yt.js';
import { parseYtRssXml } from '../../youtube/_ytRss.js';
import { createCache } from '../../_cache.js';
import { getJson, setJson } from '../../_globalCache.js';

const cache = createCache(30 * 60 * 1000);
const kvFreshKey     = (slug) => `yt:mlb:team:${slug}:fresh:v2`;
const kvLastKnownKey = (slug) => `yt:mlb:team:${slug}:lastKnown:v2`;
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

// Channel feeds that contain team-specific content
const CHANNEL_FEEDS = [
  'https://www.youtube.com/feeds/videos.xml?user=MLB',
  'https://www.youtube.com/feeds/videos.xml?channel_id=UCl9E4Zxa8CVr2LBLD0_TaNg', // Jomboy
];

function scoreTeamItem(item, teamName) {
  let s = 0;
  const t = (item.title || '').toLowerCase();
  const ch = (item.channelTitle || '').toLowerCase();
  const nameParts = teamName.toLowerCase().split(' ');

  const matchedParts = nameParts.filter((p) => p.length > 3 && t.includes(p));
  if (matchedParts.length >= 2) s += 10;
  else if (matchedParts.length === 1) s += 5;

  if (/espn|mlb|fox sports|jomboy/i.test(ch)) s += 3;
  if (/highlight|recap|analysis|breakdown/i.test(t)) s += 2;
  if (/\bnba\b|\bnfl\b|\bnhl\b|\bsoccer\b|\bncaa\b|\bcollege basketball\b/i.test(t)) s -= 6;

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
  const relevant = scored.filter((it) => it._score >= 0);
  relevant.sort((a, b) => b._score - a._score);
  return relevant.slice(0, 12).map(({ _score, ...rest }) => rest);
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

async function fetchFromChannelFeeds(teamName) {
  const results = await Promise.allSettled(
    CHANNEL_FEEDS.map((url) => fetchChannelRss(url))
  );
  const allItems = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
  // Pre-filter: keep items that mention any part of the team name
  const nameParts = teamName.toLowerCase().split(' ');
  return allItems.filter((it) => {
    const t = (it.title || '').toLowerCase();
    return nameParts.some((p) => p.length > 3 && t.includes(p));
  });
}

async function fetchFromDataApi(teamName) {
  if (!process.env.YOUTUBE_API_KEY) return [];
  const mascot = teamName.split(' ').slice(-1)[0];
  const results = await Promise.allSettled([
    ytSearch({ q: `${teamName} MLB highlights`, maxResults: 6 }),
    ytSearch({ q: `${mascot} MLB baseball`, maxResults: 4 }),
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

  // 1. Memory cache
  const memKey = `mlb:yt:team:${teamSlug}`;
  const mem = cache.get(memKey);
  if (mem?.items?.length > 0) return res.status(200).json({ ...mem, items: mem.items.slice(0, maxResults) });

  // 2. KV fresh cache
  const kvFresh = await getJson(kvFreshKey(teamSlug)).catch(() => null);
  if (kvFresh?.items?.length > 0) {
    cache.set(memKey, kvFresh);
    return res.status(200).json({ ...kvFresh, items: kvFresh.items.slice(0, maxResults) });
  }

  // 3. Fetch from channel feeds + optional Data API (in parallel)
  try {
    const [channelItems, apiItems] = await Promise.allSettled([
      fetchFromChannelFeeds(teamName),
      fetchFromDataApi(teamName),
    ]);
    const all = [
      ...(channelItems.status === 'fulfilled' ? channelItems.value : []),
      ...(apiItems.status === 'fulfilled' ? apiItems.value : []),
    ];
    const items = processTeamItems(all, teamName);

    if (items.length > 0) {
      const payload = { status: 'ok', teamSlug, teamName, updatedAt: new Date().toISOString(), items };
      cache.set(memKey, payload);
      await Promise.all([
        setJson(kvFreshKey(teamSlug), payload, { exSeconds: KV_FRESH_TTL_SEC }),
        setJson(kvLastKnownKey(teamSlug), payload, { exSeconds: KV_LASTKNOWN_TTL_SEC }),
      ]).catch(() => {});
      return res.status(200).json({ ...payload, items: items.slice(0, maxResults) });
    }
  } catch {}

  // 4. Stale cache fallback
  const stale = await tryStaleCache(teamSlug, maxResults);
  if (stale) return res.status(200).json(stale);

  return res.status(200).json({ status: 'ok', teamSlug, teamName, updatedAt: new Date().toISOString(), items: [] });
}
