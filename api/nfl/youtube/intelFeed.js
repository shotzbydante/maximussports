/**
 * GET /api/nfl/youtube/intelFeed?maxResults=8[&team=<slug>]
 *
 * NFL video feed. Without `team` it is the league feed; with `team` it is
 * narrowed to videos that name that team.
 *
 * Primary source is channel RSS (no quota). The YouTube Data API is used
 * as an enhancement when YOUTUBE_API_KEY is set.
 */

import { parseYtRssXml } from '../../youtube/_ytRss.js';
import { ytSearch } from '../../youtube/_yt.js';
import { createCache } from '../../_cache.js';
import { getJson, setJson } from '../../_globalCache.js';
import { getNflTeamBySlug } from '../../../src/sports/nfl/teams.js';

const cache = createCache(10 * 60 * 1000);
const KV_FRESH_TTL_SEC = 20 * 60;
const KV_LASTKNOWN_TTL_SEC = 3 * 24 * 60 * 60;
const RSS_TIMEOUT_MS = 8000;

const hasYoutubeKey = Boolean(process.env.YOUTUBE_API_KEY);

const CHANNEL_FEEDS = [
  'https://www.youtube.com/feeds/videos.xml?channel_id=UCDVYQ4Zhbm3S2dlz7P1GBDg', // NFL
  'https://www.youtube.com/feeds/videos.xml?channel_id=UCiWLfSweyRNmLpgEHekhoAg', // ESPN
  'https://www.youtube.com/feeds/videos.xml?channel_id=UC9-OpMMVoNP5o10_Iyq7Ndw', // Bleacher Report
];

const NFL_CONTEXT = /\bnfl\b|\bfootball\b|\bquarterback\b|\bqb\b|\btouchdown\b|\bsuper bowl\b|\bweek \d+\b|\bwild.?card\b|\bplayoffs?\b/i;
const HOT_KEYWORDS = /\b(highlights?|recap|breakdown|film|preview|injur|trade|playoff|wild.?card|clinch|game.?winner|comeback|overtime|mic'?d up)\b/i;
const STALE_PATTERNS = /\b(all.?time|throwback|classic|full game|10 years ago|career highlights|every touchdown from 20\d\d|mock draft)\b/i;
const OTHER_SPORTS = /\b(nba|mlb|nhl|mls|soccer|baseball|basketball|hockey|ufc|college football|cfb)\b/i;

function teamAliases(team) {
  const city = team.name.replace(new RegExp(`\\s+${team.nickname}$`), '').toLowerCase();
  const aliases = [team.nickname.toLowerCase(), team.name.toLowerCase()];
  // "New York" and "Los Angeles" each have two teams; the city alone is
  // not enough to attribute a video.
  if (!/^(new york|los angeles)$/.test(city)) aliases.push(city);
  return aliases;
}

function matchesTeam(title, aliases) {
  const t = (title || '').toLowerCase();
  return aliases.some((a) => new RegExp(`(^|[^a-z0-9])${a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`).test(t));
}

function scoreItem(item, aliases) {
  let s = 0;
  const t = item.title || '';
  const ch = (item.channelTitle || '').toLowerCase();

  if (item.publishedAt) {
    const ageH = (Date.now() - new Date(item.publishedAt).getTime()) / 3_600_000;
    if (ageH <= 6) s += 14;
    else if (ageH <= 24) s += 10;
    else if (ageH <= 48) s += 6;
    else if (ageH <= 96) s += 3;
    else if (ageH > 168) s -= 6;
  } else {
    s -= 3;
  }

  if (HOT_KEYWORDS.test(t)) s += 5;
  if (STALE_PATTERNS.test(t)) s -= 10;
  if (/^nfl$/.test(ch) || ch.includes('nfl films') || ch.includes('nfl network')) s += 7;
  else if (ch.includes('espn')) s += 5;
  else if (ch.includes('bleacher report') || ch.includes('cbs sports') || ch.includes('nbc sports') || ch.includes('fox sports')) s += 3;
  if (OTHER_SPORTS.test(t) && !/\bnfl\b/i.test(t)) s -= 12;
  if (aliases && matchesTeam(t, aliases)) s += 8;
  if (item._source === 'api') s += 1;
  return s;
}

function rank(items, aliases, limit) {
  const seen = new Set();
  return items
    .filter((it) => {
      if (!it?.videoId || seen.has(it.videoId)) return false;
      seen.add(it.videoId);
      return true;
    })
    .filter((it) => (aliases ? matchesTeam(it.title, aliases) : true))
    .map((it) => ({
      videoId: it.videoId,
      title: it.title,
      channelTitle: it.channelTitle,
      publishedAt: it.publishedAt,
      thumbUrl: it.thumbUrl || `https://i.ytimg.com/vi/${it.videoId}/mqdefault.jpg`,
      _score: scoreItem(it, aliases),
    }))
    .filter((it) => it._score >= 3)
    .sort((a, b) => b._score - a._score)
    .slice(0, limit)
    .map((it) => ({
      videoId: it.videoId,
      title: it.title,
      channelTitle: it.channelTitle,
      publishedAt: it.publishedAt,
      thumbUrl: it.thumbUrl,
    }));
}

async function fetchChannelRss(feedUrl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RSS_TIMEOUT_MS);
  try {
    const r = await fetch(feedUrl, { headers: { 'User-Agent': 'MaximusSports/1.0' }, signal: controller.signal });
    if (!r.ok) return [];
    return parseYtRssXml(await r.text()).map((it) => ({ ...it, _source: 'rss' }));
  } catch { return []; }
  finally { clearTimeout(timer); }
}

async function fetchFromChannelFeeds() {
  const results = await Promise.allSettled(CHANNEL_FEEDS.map(fetchChannelRss));
  return results
    .flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
    .filter((it) => {
      const t = it.title || '';
      const ch = (it.channelTitle || '').toLowerCase();
      // Everything on the NFL channel is in scope; other channels need
      // football context in the title.
      return /^nfl$/.test(ch) || NFL_CONTEXT.test(t);
    });
}

async function fetchFromDataApi(team) {
  if (!hasYoutubeKey) return [];
  try {
    const queries = team
      ? [{ q: `${team.name} highlights`, maxResults: 6 }, { q: `${team.name} news`, maxResults: 4 }]
      : [{ q: 'NFL highlights this week', maxResults: 6 }, { q: 'NFL injury news', maxResults: 4 }];
    const results = await Promise.allSettled(queries.map((q) => ytSearch(q)));
    return results
      .flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
      .map((it) => ({ ...it, _source: 'api' }));
  } catch { return []; }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const params = new URL(req.url, 'http://localhost').searchParams;
  const maxResults = Math.min(Math.max(parseInt(params.get('maxResults') || '8', 10), 1), 14);
  const teamSlug = (params.get('team') || params.get('teamSlug') || '').toLowerCase();
  const team = teamSlug ? getNflTeamBySlug(teamSlug) : null;
  if (teamSlug && !team) return res.status(404).json({ status: 'error', items: [], error: `Unknown team slug: ${teamSlug}` });

  const scope = team ? `team:${team.slug}` : 'league';
  const memKey = `nfl:yt:${scope}`;
  const kvFreshKey = `yt:nfl:${scope}:fresh:v1`;
  const kvLastKnownKey = `yt:nfl:${scope}:lastKnown:v1`;

  const mem = cache.get(memKey);
  if (mem?.items?.length > 0) return res.status(200).json({ ...mem, items: mem.items.slice(0, maxResults) });

  const kvFresh = await getJson(kvFreshKey).catch(() => null);
  if (kvFresh?.items?.length > 0) {
    cache.set(memKey, kvFresh);
    return res.status(200).json({ ...kvFresh, items: kvFresh.items.slice(0, maxResults) });
  }

  const [rss, api] = await Promise.allSettled([fetchFromChannelFeeds(), fetchFromDataApi(team)]);
  const merged = [
    ...(rss.status === 'fulfilled' ? rss.value : []),
    ...(api.status === 'fulfilled' ? api.value : []),
  ];
  const items = rank(merged, team ? teamAliases(team) : null, 14);

  if (items.length > 0) {
    const payload = { status: 'ok', team: team?.slug || null, updatedAt: new Date().toISOString(), items };
    cache.set(memKey, payload);
    await Promise.all([
      setJson(kvFreshKey, payload, { exSeconds: KV_FRESH_TTL_SEC }),
      setJson(kvLastKnownKey, payload, { exSeconds: KV_LASTKNOWN_TTL_SEC }),
    ]).catch(() => {});
    return res.status(200).json({ ...payload, items: items.slice(0, maxResults) });
  }

  const stale = await getJson(kvLastKnownKey).catch(() => null);
  if (stale?.items?.length > 0) {
    return res.status(200).json({ ...stale, status: 'ok_stale', items: stale.items.slice(0, maxResults) });
  }

  return res.status(200).json({ status: 'ok', team: team?.slug || null, updatedAt: new Date().toISOString(), items: [] });
}
