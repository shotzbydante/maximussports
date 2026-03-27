/**
 * GET /api/mlb/youtube/team?teamSlug=nyy&maxResults=6
 * Team-specific MLB video feed.
 * Primary: MLB channel RSS filtered by team aliases.
 * Enhancement: YouTube Data API v3 when YOUTUBE_API_KEY is set.
 */

import { ytSearch } from '../../youtube/_yt.js';
import { parseYtRssXml } from '../../youtube/_ytRss.js';
import { createCache } from '../../_cache.js';
import { getJson, setJson } from '../../_globalCache.js';

const cache = createCache(30 * 60 * 1000);
const kvFreshKey     = (slug) => `yt:mlb:team:${slug}:fresh:v3`;
const kvLastKnownKey = (slug) => `yt:mlb:team:${slug}:lastKnown:v3`;
const KV_FRESH_TTL_SEC     = 60 * 60;
const KV_LASTKNOWN_TTL_SEC = 7 * 24 * 60 * 60;
const RSS_TIMEOUT_MS       = 8000;
const DATA_API_TIMEOUT_MS  = 6000;

const hasYoutubeKey = Boolean(process.env.YOUTUBE_API_KEY);

// ─── Team alias map for title matching ────────────────────────────────────────
// Keys: slug. Values: { name, mascot, aliases[] (lowercase, min 4 chars to avoid false positives) }
const TEAM_META = {
  nyy: { name: 'New York Yankees', mascot: 'Yankees', aliases: ['yankees', 'yanks'] },
  bos: { name: 'Boston Red Sox', mascot: 'Red Sox', aliases: ['red sox', 'boston'] },
  tor: { name: 'Toronto Blue Jays', mascot: 'Blue Jays', aliases: ['blue jays', 'toronto'] },
  tb:  { name: 'Tampa Bay Rays', mascot: 'Rays', aliases: ['rays', 'tampa'] },
  bal: { name: 'Baltimore Orioles', mascot: 'Orioles', aliases: ['orioles', 'baltimore'] },
  cle: { name: 'Cleveland Guardians', mascot: 'Guardians', aliases: ['guardians', 'cleveland'] },
  min: { name: 'Minnesota Twins', mascot: 'Twins', aliases: ['twins', 'minnesota'] },
  det: { name: 'Detroit Tigers', mascot: 'Tigers', aliases: ['tigers', 'detroit'] },
  cws: { name: 'Chicago White Sox', mascot: 'White Sox', aliases: ['white sox'] },
  kc:  { name: 'Kansas City Royals', mascot: 'Royals', aliases: ['royals', 'kansas city'] },
  hou: { name: 'Houston Astros', mascot: 'Astros', aliases: ['astros', 'houston'] },
  sea: { name: 'Seattle Mariners', mascot: 'Mariners', aliases: ['mariners', 'seattle'] },
  tex: { name: 'Texas Rangers', mascot: 'Rangers', aliases: ['rangers', 'texas'] },
  laa: { name: 'Los Angeles Angels', mascot: 'Angels', aliases: ['angels', 'shohei', 'ohtani'] },
  oak: { name: 'Oakland Athletics', mascot: 'Athletics', aliases: ['athletics', 'oakland'] },
  atl: { name: 'Atlanta Braves', mascot: 'Braves', aliases: ['braves', 'atlanta'] },
  nym: { name: 'New York Mets', mascot: 'Mets', aliases: ['mets'] },
  phi: { name: 'Philadelphia Phillies', mascot: 'Phillies', aliases: ['phillies', 'philadelphia'] },
  mia: { name: 'Miami Marlins', mascot: 'Marlins', aliases: ['marlins', 'miami'] },
  wsh: { name: 'Washington Nationals', mascot: 'Nationals', aliases: ['nationals', 'washington'] },
  chc: { name: 'Chicago Cubs', mascot: 'Cubs', aliases: ['cubs'] },
  mil: { name: 'Milwaukee Brewers', mascot: 'Brewers', aliases: ['brewers', 'milwaukee'] },
  stl: { name: 'St. Louis Cardinals', mascot: 'Cardinals', aliases: ['cardinals', 'louis'] },
  pit: { name: 'Pittsburgh Pirates', mascot: 'Pirates', aliases: ['pirates', 'pittsburgh'] },
  cin: { name: 'Cincinnati Reds', mascot: 'Reds', aliases: ['reds', 'cincinnati'] },
  lad: { name: 'Los Angeles Dodgers', mascot: 'Dodgers', aliases: ['dodgers'] },
  sd:  { name: 'San Diego Padres', mascot: 'Padres', aliases: ['padres', 'diego'] },
  sf:  { name: 'San Francisco Giants', mascot: 'Giants', aliases: ['giants', 'francisco'] },
  ari: { name: 'Arizona Diamondbacks', mascot: 'Diamondbacks', aliases: ['diamondbacks', 'dbacks', 'arizona'] },
  col: { name: 'Colorado Rockies', mascot: 'Rockies', aliases: ['rockies', 'colorado'] },
};

const CHANNEL_FEEDS = [
  'https://www.youtube.com/feeds/videos.xml?user=MLB',
  'https://www.youtube.com/feeds/videos.xml?channel_id=UCl9E4Zxa8CVr2LBLD0_TaNg', // Jomboy
];

function matchesTeam(text, meta) {
  const t = text.toLowerCase();
  return meta.aliases.some((a) => a.length >= 4 && t.includes(a));
}

function scoreTeamVideoItem(item, meta) {
  let s = 0;
  const t = (item.title || '').toLowerCase();
  const ch = (item.channelTitle || '').toLowerCase();

  // Team relevance (highest weight)
  const matched = meta.aliases.filter((a) => a.length >= 4 && t.includes(a));
  if (matched.length >= 2) s += 12;
  else if (matched.length === 1) s += 7;

  // Recency
  if (item.publishedAt) {
    const ageH = (Date.now() - new Date(item.publishedAt).getTime()) / 3_600_000;
    if      (ageH <= 6)  s += 8;
    else if (ageH <= 24) s += 5;
    else if (ageH <= 72) s += 3;
    else if (ageH <= 168) s += 1;
  }

  // Content keywords
  if (/highlight|recap|breakdown|analysis/i.test(t)) s += 3;
  if (/walk.?off|grand slam|home run|no.?hitter/i.test(t)) s += 2;

  // Source trust (premium sources get strong preference)
  if (/^mlb$/i.test(ch) || ch.includes('mlb highlights')) s += 6;
  else if (/espn/i.test(ch)) s += 5;
  else if (/fox sports|jomboy/i.test(ch)) s += 3;
  else if (/cbs sports|nbc sports|sns?y|nesn|yes network/i.test(ch)) s += 2;

  // Metadata
  if (item.thumbUrl) s += 1;
  if (item._source === 'api') s += 1;

  // Non-baseball penalty
  if (/\bnba\b|\bnfl\b|\bnhl\b|\bsoccer\b|\bncaa\b|\bcollege basketball\b/i.test(t)) s -= 8;

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

function mergeAndRankTeam(allItems, meta) {
  const deduped = dedup(allItems);
  const scored = deduped.map((it) => ({
    videoId:      it.videoId,
    title:        it.title,
    channelTitle: it.channelTitle,
    publishedAt:  it.publishedAt,
    thumbUrl:     it.thumbUrl || `https://i.ytimg.com/vi/${it.videoId}/mqdefault.jpg`,
    _score:       scoreTeamVideoItem(it, meta),
  }));
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
    return parseYtRssXml(xml).map((it) => ({ ...it, _source: 'rss' }));
  } catch { return []; }
  finally { clearTimeout(timer); }
}

async function fetchFromChannelFeeds(meta) {
  const results = await Promise.allSettled(
    CHANNEL_FEEDS.map((url) => fetchChannelRss(url))
  );
  const allItems = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
  return allItems.filter((it) => matchesTeam(it.title || '', meta));
}

async function fetchFromDataApi(meta) {
  if (!hasYoutubeKey) return [];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DATA_API_TIMEOUT_MS);
  try {
    const results = await Promise.allSettled([
      ytSearch({ q: `${meta.name} MLB highlights`, maxResults: 6 }),
      ytSearch({ q: `${meta.mascot} MLB baseball`, maxResults: 4 }),
    ]);
    return results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
      .map((it) => ({ ...it, _source: 'api' }));
  } catch { return []; }
  finally { clearTimeout(timer); }
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

  const t0 = Date.now();
  const params = new URL(req.url, 'http://localhost').searchParams;
  const teamSlug = params.get('teamSlug') || '';
  const maxResults = Math.min(Math.max(parseInt(params.get('maxResults') || '6', 10), 1), 12);

  const meta = TEAM_META[teamSlug];
  if (!meta) return res.status(400).json({ error: 'Unknown teamSlug' });

  const log = { endpoint: 'mlb/youtube/team', teamSlug, hasYoutubeKey };

  // 1. Memory cache
  const memKey = `mlb:yt:team:${teamSlug}`;
  const mem = cache.get(memKey);
  if (mem?.items?.length > 0) {
    log.usedCache = 'memory'; log.finalCount = Math.min(mem.items.length, maxResults); log.durationMs = Date.now() - t0;
    console.log('[mlb/yt/team]', JSON.stringify(log));
    return res.status(200).json({ ...mem, items: mem.items.slice(0, maxResults) });
  }

  // 2. KV fresh cache
  const kvFresh = await getJson(kvFreshKey(teamSlug)).catch(() => null);
  if (kvFresh?.items?.length > 0) {
    cache.set(memKey, kvFresh);
    log.usedCache = 'fresh'; log.finalCount = Math.min(kvFresh.items.length, maxResults); log.durationMs = Date.now() - t0;
    console.log('[mlb/yt/team]', JSON.stringify(log));
    return res.status(200).json({ ...kvFresh, items: kvFresh.items.slice(0, maxResults) });
  }

  // 3. Parallel fetch: channel RSS + optional Data API
  let rssItems = [], apiItems = [];
  const [rssResult, apiResult] = await Promise.allSettled([
    fetchFromChannelFeeds(meta),
    fetchFromDataApi(meta),
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

  const items = mergeAndRankTeam(merged, meta);
  log.finalCount = items.length;

  if (items.length > 0) {
    const payload = { status: 'ok', teamSlug, teamName: meta.name, updatedAt: new Date().toISOString(), items };
    cache.set(memKey, payload);
    await Promise.all([
      setJson(kvFreshKey(teamSlug), payload, { exSeconds: KV_FRESH_TTL_SEC }),
      setJson(kvLastKnownKey(teamSlug), payload, { exSeconds: KV_LASTKNOWN_TTL_SEC }),
    ]).catch(() => {});
    log.durationMs = Date.now() - t0;
    console.log('[mlb/yt/team]', JSON.stringify(log));
    return res.status(200).json({ ...payload, items: items.slice(0, maxResults) });
  }

  // 4. Stale cache — never cache empty
  const stale = await tryStaleCache(teamSlug, maxResults);
  if (stale) {
    log.usedStale = true; log.durationMs = Date.now() - t0;
    console.log('[mlb/yt/team]', JSON.stringify(log));
    return res.status(200).json(stale);
  }

  log.usedStale = false; log.durationMs = Date.now() - t0;
  console.log('[mlb/yt/team]', JSON.stringify(log));
  return res.status(200).json({ status: 'ok', teamSlug, teamName: meta.name, updatedAt: new Date().toISOString(), items: [] });
}
