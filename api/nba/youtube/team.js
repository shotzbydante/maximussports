/**
 * GET /api/nba/youtube/team?teamSlug=bos&maxResults=6
 * Team-specific NBA video feed.
 * Primary: NBA channel RSS filtered by team aliases.
 * Enhancement: YouTube Data API v3 when YOUTUBE_API_KEY is set.
 */

import { ytSearch } from '../../youtube/_yt.js';
import { parseYtRssXml } from '../../youtube/_ytRss.js';
import { createCache } from '../../_cache.js';
import { getJson, setJson } from '../../_globalCache.js';

const cache = createCache(30 * 60 * 1000);
const kvFreshKey     = (slug) => `yt:nba:team:${slug}:fresh:v1`;
const kvLastKnownKey = (slug) => `yt:nba:team:${slug}:lastKnown:v1`;
const KV_FRESH_TTL_SEC     = 60 * 60;
const KV_LASTKNOWN_TTL_SEC = 7 * 24 * 60 * 60;
const RSS_TIMEOUT_MS       = 8000;
const DATA_API_TIMEOUT_MS  = 6000;

const hasYoutubeKey = Boolean(process.env.YOUTUBE_API_KEY);

const TEAM_META = {
  atl: { name: 'Atlanta Hawks', mascot: 'Hawks', aliases: ['hawks', 'atlanta hawks', 'trae young'] },
  bos: { name: 'Boston Celtics', mascot: 'Celtics', aliases: ['celtics', 'boston celtics', 'jayson tatum'] },
  bkn: { name: 'Brooklyn Nets', mascot: 'Nets', aliases: ['nets', 'brooklyn nets'] },
  cha: { name: 'Charlotte Hornets', mascot: 'Hornets', aliases: ['hornets', 'charlotte'] },
  chi: { name: 'Chicago Bulls', mascot: 'Bulls', aliases: ['bulls', 'chicago bulls'] },
  cle: { name: 'Cleveland Cavaliers', mascot: 'Cavaliers', aliases: ['cavaliers', 'cavs', 'cleveland'] },
  dal: { name: 'Dallas Mavericks', mascot: 'Mavericks', aliases: ['mavericks', 'mavs', 'dallas', 'luka doncic'] },
  den: { name: 'Denver Nuggets', mascot: 'Nuggets', aliases: ['nuggets', 'denver', 'jokic'] },
  det: { name: 'Detroit Pistons', mascot: 'Pistons', aliases: ['pistons', 'detroit'] },
  gsw: { name: 'Golden State Warriors', mascot: 'Warriors', aliases: ['warriors', 'golden state', 'curry'] },
  hou: { name: 'Houston Rockets', mascot: 'Rockets', aliases: ['rockets', 'houston'] },
  ind: { name: 'Indiana Pacers', mascot: 'Pacers', aliases: ['pacers', 'indiana'] },
  lac: { name: 'LA Clippers', mascot: 'Clippers', aliases: ['clippers'] },
  lal: { name: 'Los Angeles Lakers', mascot: 'Lakers', aliases: ['lakers', 'lebron'] },
  mem: { name: 'Memphis Grizzlies', mascot: 'Grizzlies', aliases: ['grizzlies', 'memphis', 'morant'] },
  mia: { name: 'Miami Heat', mascot: 'Heat', aliases: ['heat', 'miami heat'] },
  mil: { name: 'Milwaukee Bucks', mascot: 'Bucks', aliases: ['bucks', 'milwaukee', 'giannis'] },
  min: { name: 'Minnesota Timberwolves', mascot: 'Timberwolves', aliases: ['timberwolves', 'wolves', 'minnesota', 'anthony edwards'] },
  nop: { name: 'New Orleans Pelicans', mascot: 'Pelicans', aliases: ['pelicans', 'new orleans', 'zion'] },
  nyk: { name: 'New York Knicks', mascot: 'Knicks', aliases: ['knicks', 'new york knicks'] },
  okc: { name: 'Oklahoma City Thunder', mascot: 'Thunder', aliases: ['thunder', 'oklahoma', 'shai'] },
  orl: { name: 'Orlando Magic', mascot: 'Magic', aliases: ['magic', 'orlando'] },
  phi: { name: 'Philadelphia 76ers', mascot: '76ers', aliases: ['76ers', 'sixers', 'philadelphia', 'embiid'] },
  phx: { name: 'Phoenix Suns', mascot: 'Suns', aliases: ['suns', 'phoenix', 'durant'] },
  por: { name: 'Portland Trail Blazers', mascot: 'Trail Blazers', aliases: ['trail blazers', 'blazers', 'portland'] },
  sac: { name: 'Sacramento Kings', mascot: 'Kings', aliases: ['kings', 'sacramento'] },
  sas: { name: 'San Antonio Spurs', mascot: 'Spurs', aliases: ['spurs', 'san antonio', 'wembanyama'] },
  tor: { name: 'Toronto Raptors', mascot: 'Raptors', aliases: ['raptors', 'toronto'] },
  uta: { name: 'Utah Jazz', mascot: 'Jazz', aliases: ['jazz', 'utah'] },
  was: { name: 'Washington Wizards', mascot: 'Wizards', aliases: ['wizards', 'washington'] },
};

const CHANNEL_FEEDS = [
  'https://www.youtube.com/feeds/videos.xml?channel_id=UCWJ2lWNubArHWmf3FIHbfcQ', // NBA
  'https://www.youtube.com/feeds/videos.xml?channel_id=UCoh_z6QB0AGB1oxWufvbDUg', // House of Highlights
];

function matchesTeam(text, meta) {
  const t = text.toLowerCase();
  return meta.aliases.some((a) => a.length >= 4 && t.includes(a));
}

function scoreTeamVideoItem(item, meta) {
  let s = 0;
  const t = (item.title || '').toLowerCase();
  const ch = (item.channelTitle || '').toLowerCase();

  const matched = meta.aliases.filter((a) => a.length >= 4 && t.includes(a));
  if (matched.length >= 2) s += 12;
  else if (matched.length === 1) s += 7;

  if (item.publishedAt) {
    const ageH = (Date.now() - new Date(item.publishedAt).getTime()) / 3_600_000;
    if      (ageH <= 6)  s += 8;
    else if (ageH <= 24) s += 5;
    else if (ageH <= 72) s += 3;
    else if (ageH <= 168) s += 1;
  }

  if (/highlight|recap|breakdown|analysis|dunk/i.test(t)) s += 3;
  if (/buzzer.?beater|game.?winner|triple.?double|poster/i.test(t)) s += 2;

  if (/^nba$/i.test(ch) || ch.includes('nba highlights')) s += 6;
  else if (/espn/i.test(ch)) s += 5;
  else if (/house of highlights|bleacher report/i.test(ch)) s += 3;
  else if (/cbs sports|nbc sports|tnt/i.test(ch)) s += 2;

  if (item.thumbUrl) s += 1;
  if (item._source === 'api') s += 1;

  // Non-basketball penalty
  if (/\bmlb\b|\bnfl\b|\bnhl\b|\bsoccer\b|\bbaseball\b|\bfootball\b/i.test(t)) s -= 8;

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
      ytSearch({ q: `${meta.name} NBA highlights`, maxResults: 6 }),
      ytSearch({ q: `${meta.mascot} NBA basketball`, maxResults: 4 }),
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

  const log = { endpoint: 'nba/youtube/team', teamSlug, hasYoutubeKey };

  // 1. Memory cache
  const memKey = `nba:yt:team:${teamSlug}`;
  const mem = cache.get(memKey);
  if (mem?.items?.length > 0) {
    log.usedCache = 'memory'; log.finalCount = Math.min(mem.items.length, maxResults); log.durationMs = Date.now() - t0;
    console.log('[nba/yt/team]', JSON.stringify(log));
    return res.status(200).json({ ...mem, items: mem.items.slice(0, maxResults) });
  }

  // 2. KV fresh cache
  const kvFresh = await getJson(kvFreshKey(teamSlug)).catch(() => null);
  if (kvFresh?.items?.length > 0) {
    cache.set(memKey, kvFresh);
    log.usedCache = 'fresh'; log.finalCount = Math.min(kvFresh.items.length, maxResults); log.durationMs = Date.now() - t0;
    console.log('[nba/yt/team]', JSON.stringify(log));
    return res.status(200).json({ ...kvFresh, items: kvFresh.items.slice(0, maxResults) });
  }

  // 3. Parallel fetch
  const [rssResult, apiResult] = await Promise.allSettled([
    fetchFromChannelFeeds(meta),
    fetchFromDataApi(meta),
  ]);

  const rssItems = rssResult.status === 'fulfilled' ? rssResult.value : [];
  const apiItems = apiResult.status === 'fulfilled' ? apiResult.value : [];
  const merged = [...rssItems, ...apiItems];
  const items = mergeAndRankTeam(merged, meta);

  log.rssCount = rssItems.length;
  log.dataApiCount = apiItems.length;
  log.finalCount = items.length;

  if (items.length > 0) {
    const payload = { status: 'ok', teamSlug, teamName: meta.name, updatedAt: new Date().toISOString(), items };
    cache.set(memKey, payload);
    await Promise.all([
      setJson(kvFreshKey(teamSlug), payload, { exSeconds: KV_FRESH_TTL_SEC }),
      setJson(kvLastKnownKey(teamSlug), payload, { exSeconds: KV_LASTKNOWN_TTL_SEC }),
    ]).catch(() => {});
    log.durationMs = Date.now() - t0;
    console.log('[nba/yt/team]', JSON.stringify(log));
    return res.status(200).json({ ...payload, items: items.slice(0, maxResults) });
  }

  // 4. Stale cache
  const stale = await tryStaleCache(teamSlug, maxResults);
  if (stale) {
    log.usedStale = true; log.durationMs = Date.now() - t0;
    console.log('[nba/yt/team]', JSON.stringify(log));
    return res.status(200).json(stale);
  }

  log.durationMs = Date.now() - t0;
  console.log('[nba/yt/team]', JSON.stringify(log));
  return res.status(200).json({ status: 'ok', teamSlug, teamName: meta.name, updatedAt: new Date().toISOString(), items: [] });
}
