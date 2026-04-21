/**
 * GET /api/nba/youtube/intelFeed?maxResults=8
 * General NBA video intel feed (not team-specific).
 * Playoff-aware: heavily boosts recent playoff/series content.
 * Deboosts stale generic recaps.
 */

import { parseYtRssXml } from '../../youtube/_ytRss.js';
import { ytSearch } from '../../youtube/_yt.js';
import { createCache } from '../../_cache.js';
import { getJson, setJson } from '../../_globalCache.js';

const cache = createCache(10 * 60 * 1000); // 10min memory cache (was 30min for team)
const kvFreshKey     = 'yt:nba:intel:fresh:v2';
const kvLastKnownKey = 'yt:nba:intel:lastKnown:v2';
const KV_FRESH_TTL_SEC     = 20 * 60;          // 20 min (was 60 min)
const KV_LASTKNOWN_TTL_SEC = 24 * 60 * 60;     // 24h fallback (was 7 days)
const RSS_TIMEOUT_MS       = 8000;
const DATA_API_TIMEOUT_MS  = 6000;

const hasYoutubeKey = Boolean(process.env.YOUTUBE_API_KEY);

/**
 * Official NBA + high-signal editorial channels.
 * NBA.com YouTube + ESPN + House of Highlights + Bleacher Report.
 */
const CHANNEL_FEEDS = [
  'https://www.youtube.com/feeds/videos.xml?channel_id=UCWJ2lWNubArHWmf3FIHbfcQ', // NBA
  'https://www.youtube.com/feeds/videos.xml?channel_id=UCiWLfSweyRNmLpgEHekhoAg', // ESPN
  'https://www.youtube.com/feeds/videos.xml?channel_id=UCoh_z6QB0AGB1oxWufvbDUg', // House of Highlights
  'https://www.youtube.com/feeds/videos.xml?channel_id=UC9-OpMMVoNP5o10_Iyq7Ndw', // Bleacher Report
];

/** Playoff / postseason context keywords — strong boost */
const PLAYOFF_KEYWORDS = /\b(play.?in|playoffs?|bracket|series|finals?|conference.?finals?|semifinals?|elimination|closeout|game.?7|game.?6|clinched?|clinching|matchup.?preview|game.?preview|series.?preview|postseason|title.?odds|injury.?report|probable|questionable|out.?for.?game)\b/i;

/** Stale / filler content — deboost */
const STALE_PATTERNS = /\b(regular.?season.?recap|season.?highlights|year.?in.?review|best.?of.?20\d\d|top.?\d+.?dunks.?of|career.?highlights|all.?time|classic|throwback|flashback|10.?years.?ago|20\d\d.?season)\b/i;

/** Non-basketball negatives */
const NON_BBALL = /\b(mlb|nfl|nhl|soccer|baseball|football|hockey|cricket)\b/i;

function scoreIntelItem(item) {
  let s = 0;
  const t = (item.title || '').toLowerCase();
  const ch = (item.channelTitle || '').toLowerCase();

  // Recency — strongly weighted for playoff content (was: softer curve)
  if (item.publishedAt) {
    const ageH = (Date.now() - new Date(item.publishedAt).getTime()) / 3_600_000;
    if      (ageH <= 6)   s += 14;   // last 6h — red-hot
    else if (ageH <= 24)  s += 10;   // today
    else if (ageH <= 48)  s += 6;    // yesterday
    else if (ageH <= 96)  s += 3;    // last 4 days
    else if (ageH <= 168) s += 0;    // last week — neutral
    else                  s -= 6;    // older — penalized
  } else {
    s -= 3; // no date = suspicious
  }

  // Playoff / postseason boost — this is the main editorial signal
  if (PLAYOFF_KEYWORDS.test(t)) s += 10;
  if (/\bnba.?finals?\b/i.test(t)) s += 4; // extra boost for Finals mentions

  // Stale content deboost
  if (STALE_PATTERNS.test(t)) s -= 10;

  // Premium content signals
  if (/highlight|recap|breakdown|analysis|preview/i.test(t)) s += 3;
  if (/buzzer.?beater|game.?winner|triple.?double|poster|clutch/i.test(t)) s += 2;

  // Channel trust
  if (/^nba$/i.test(ch) || ch.includes('nba highlights')) s += 7;
  else if (/espn/i.test(ch)) s += 6;
  else if (/house of highlights|bleacher report/i.test(ch)) s += 4;
  else if (/cbs sports|nbc sports|tnt|tsn/i.test(ch)) s += 2;

  // Metadata present
  if (item.thumbUrl) s += 1;
  if (item._source === 'api') s += 1;

  // Non-basketball penalty
  if (NON_BBALL.test(t)) s -= 12;

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

function mergeAndRank(allItems) {
  const deduped = dedup(allItems);
  const scored = deduped.map((it) => ({
    videoId:      it.videoId,
    title:        it.title,
    channelTitle: it.channelTitle,
    publishedAt:  it.publishedAt,
    thumbUrl:     it.thumbUrl || `https://i.ytimg.com/vi/${it.videoId}/mqdefault.jpg`,
    _score:       scoreIntelItem(it),
  }));
  // Filter out the clearly stale — must have positive score to make cut
  const relevant = scored.filter((it) => it._score >= 3);
  relevant.sort((a, b) => b._score - a._score);
  return relevant.slice(0, 14).map(({ _score, ...rest }) => rest);
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
  const results = await Promise.allSettled(CHANNEL_FEEDS.map((url) => fetchChannelRss(url)));
  const allItems = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
  // Only items with basketball context
  return allItems.filter((it) => {
    const t = (it.title || '').toLowerCase();
    if (NON_BBALL.test(t)) return false;
    // Require NBA/basketball/playoff/series/etc.
    return /\bnba\b|\bbasketball\b|\bplayoffs?\b|\bseries\b|\bfinals?\b|\bdunk\b|\bthree.?pointer\b/i.test(t);
  });
}

async function fetchFromDataApi() {
  if (!hasYoutubeKey) return [];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DATA_API_TIMEOUT_MS);
  try {
    const results = await Promise.allSettled([
      ytSearch({ q: 'NBA playoffs 2026 highlights', maxResults: 6 }),
      ytSearch({ q: 'NBA play-in game', maxResults: 4 }),
      ytSearch({ q: 'NBA playoff series preview', maxResults: 4 }),
    ]);
    return results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
      .map((it) => ({ ...it, _source: 'api' }));
  } catch { return []; }
  finally { clearTimeout(timer); }
}

async function tryStaleCache(maxResults) {
  try {
    const stale = await getJson(kvLastKnownKey);
    if (stale?.items?.length > 0) {
      return { ...stale, status: 'ok_stale', items: stale.items.slice(0, maxResults) };
    }
  } catch {}
  return null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const t0 = Date.now();
  const params = new URL(req.url, 'http://localhost').searchParams;
  const maxResults = Math.min(Math.max(parseInt(params.get('maxResults') || '8', 10), 1), 14);

  const log = { endpoint: 'nba/youtube/intelFeed', hasYoutubeKey };

  // 1. Memory cache
  const memKey = 'nba:yt:intel';
  const mem = cache.get(memKey);
  if (mem?.items?.length > 0) {
    log.usedCache = 'memory'; log.finalCount = Math.min(mem.items.length, maxResults); log.durationMs = Date.now() - t0;
    console.log('[nba/yt/intel]', JSON.stringify(log));
    return res.status(200).json({ ...mem, items: mem.items.slice(0, maxResults) });
  }

  // 2. KV fresh cache (shorter TTL for playoff freshness)
  const kvFresh = await getJson(kvFreshKey).catch(() => null);
  if (kvFresh?.items?.length > 0) {
    cache.set(memKey, kvFresh);
    log.usedCache = 'fresh'; log.finalCount = Math.min(kvFresh.items.length, maxResults); log.durationMs = Date.now() - t0;
    console.log('[nba/yt/intel]', JSON.stringify(log));
    return res.status(200).json({ ...kvFresh, items: kvFresh.items.slice(0, maxResults) });
  }

  // 3. Parallel fetch
  const [rssResult, apiResult] = await Promise.allSettled([
    fetchFromChannelFeeds(),
    fetchFromDataApi(),
  ]);

  const rssItems = rssResult.status === 'fulfilled' ? rssResult.value : [];
  const apiItems = apiResult.status === 'fulfilled' ? apiResult.value : [];
  const merged = [...rssItems, ...apiItems];
  const items = mergeAndRank(merged);

  log.rssCount = rssItems.length;
  log.dataApiCount = apiItems.length;
  log.finalCount = items.length;

  if (items.length > 0) {
    const payload = { status: 'ok', updatedAt: new Date().toISOString(), items };
    cache.set(memKey, payload);
    await Promise.all([
      setJson(kvFreshKey, payload, { exSeconds: KV_FRESH_TTL_SEC }),
      setJson(kvLastKnownKey, payload, { exSeconds: KV_LASTKNOWN_TTL_SEC }),
    ]).catch(() => {});
    log.durationMs = Date.now() - t0;
    console.log('[nba/yt/intel]', JSON.stringify(log));
    return res.status(200).json({ ...payload, items: items.slice(0, maxResults) });
  }

  // 4. Stale cache fallback
  const stale = await tryStaleCache(maxResults);
  if (stale) {
    log.usedStale = true; log.durationMs = Date.now() - t0;
    console.log('[nba/yt/intel]', JSON.stringify(log));
    return res.status(200).json(stale);
  }

  log.durationMs = Date.now() - t0;
  console.log('[nba/yt/intel]', JSON.stringify(log));
  return res.status(200).json({ status: 'ok', updatedAt: new Date().toISOString(), items: [] });
}
