/**
 * GET /api/mlb/youtube/team?teamSlug=nyy&maxResults=6
 * Team-specific MLB video feed via YouTube RSS.
 * Mirrors the NCAAM team video architecture.
 */

import { createCache } from '../../_cache.js';
import { getJson, setJson } from '../../_globalCache.js';

const cache = createCache(30 * 60 * 1000);
const kvFreshKey     = (slug) => `yt:mlb:team:${slug}:fresh:v1`;
const kvLastKnownKey = (slug) => `yt:mlb:team:${slug}:lastKnown:v1`;
const KV_FRESH_TTL_SEC     = 60 * 60;
const KV_LASTKNOWN_TTL_SEC = 7 * 24 * 60 * 60;

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

async function fetchYouTubeRSS(query) {
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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=1200');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const params = new URL(req.url, 'http://localhost').searchParams;
  const teamSlug = params.get('teamSlug') || '';
  const maxResults = Math.min(Math.max(parseInt(params.get('maxResults') || '6', 10), 1), 12);

  const teamName = MLB_TEAMS_SEARCH[teamSlug];
  if (!teamName) return res.status(400).json({ error: 'Unknown teamSlug' });

  const memKey = `mlb:yt:team:${teamSlug}`;
  const mem = cache.get(memKey);
  if (mem) return res.status(200).json({ ...mem, items: mem.items.slice(0, maxResults) });

  const kvFresh = await getJson(kvFreshKey(teamSlug)).catch(() => null);
  if (kvFresh?.items) {
    cache.set(memKey, kvFresh);
    return res.status(200).json({ ...kvFresh, items: kvFresh.items.slice(0, maxResults) });
  }

  try {
    const queries = [
      `${teamName} highlights`,
      `${teamName} baseball`,
    ];
    const results = await Promise.allSettled(queries.map(fetchYouTubeRSS));
    let all = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
    all = dedup(all);

    const scored = all.map((it) => ({ ...it, _score: scoreTeamItem(it, teamName) }));
    scored.sort((a, b) => b._score - a._score);

    const items = scored.slice(0, 12).map(({ _score, ...rest }) => rest);
    const payload = { status: 'ok', teamSlug, teamName, updatedAt: new Date().toISOString(), items };

    cache.set(memKey, payload);
    await Promise.all([
      setJson(kvFreshKey(teamSlug), payload, { exSeconds: KV_FRESH_TTL_SEC }),
      setJson(kvLastKnownKey(teamSlug), payload, { exSeconds: KV_LASTKNOWN_TTL_SEC }),
    ]).catch(() => {});

    return res.status(200).json({ ...payload, items: items.slice(0, maxResults) });
  } catch (err) {
    const stale = await getJson(kvLastKnownKey(teamSlug)).catch(() => null);
    if (stale?.items) return res.status(200).json({ ...stale, status: 'ok_stale', items: stale.items.slice(0, maxResults) });
    return res.status(200).json({ status: 'error', teamSlug, items: [], error: err?.message });
  }
}
