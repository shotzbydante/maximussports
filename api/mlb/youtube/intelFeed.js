/**
 * GET /api/mlb/youtube/intelFeed?maxResults=8
 * MLB video feed — curated MLB/baseball videos.
 * Uses YouTube Data API v3 as primary, RSS as fallback (mirrors NCAAM architecture).
 */

import { ytSearch, isQuotaExhausted } from '../../youtube/_yt.js';
import { ytRssSearch, safeRssQuery } from '../../youtube/_ytRss.js';
import { getJson, setJson } from '../../_globalCache.js';

const KV_FRESH_KEY     = 'yt:mlb:intelFeed:fresh:v2';
const KV_LASTKNOWN_KEY = 'yt:mlb:intelFeed:lastKnown:v2';
const KV_FRESH_TTL_SEC     = 60 * 60;
const KV_LASTKNOWN_TTL_SEC = 7 * 24 * 60 * 60;

const MLB_QUERIES_API = [
  { q: 'MLB highlights today 2026', maxResults: 8 },
  { q: 'MLB baseball recap top plays 2026', maxResults: 8 },
  { q: 'ESPN MLB highlights', maxResults: 6 },
];

const MLB_QUERIES_RSS = [
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

const REJECT_RE = /\bnba\b|\bnfl\b|\bnhl\b|\bsoccer\b|\bncaa\b|\bcollege basketball\b|\bncaab\b/i;

function scoreItem(item) {
  let s = 0;
  const t = (item.title || '').toLowerCase();
  const ch = (item.channelTitle || '').toLowerCase();
  if (/mlb|baseball|home run|pitching|batting|inning/.test(t)) s += 3;
  if (/highlight|recap|top play|walk.?off|grand slam/.test(t)) s += 2;
  if (TRUSTED_CHANNELS.some((tc) => ch.includes(tc))) s += 4;
  if (/espn|mlb/i.test(ch)) s += 2;
  if (/watch live|subscribe|podcast|ad\b/i.test(t)) s -= 4;
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

async function fetchFromDataApi() {
  const results = await Promise.allSettled(
    MLB_QUERIES_API.map(({ q, maxResults }) => ytSearch({ q, maxResults }))
  );
  const allItems = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
  if (allItems.length === 0) throw new Error('data-api returned empty results');
  return processItems(allItems);
}

async function fetchFromRss() {
  const results = await Promise.allSettled(
    MLB_QUERIES_RSS.map((q) => ytRssSearch({ q: safeRssQuery(q), sport: 'baseball' }))
  );
  const allItems = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
  if (allItems.length === 0) throw new Error('RSS returned empty results');
  return processItems(allItems);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=1200');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const maxResults = Math.min(Math.max(parseInt(new URL(req.url, 'http://localhost').searchParams.get('maxResults') || '8', 10), 1), 18);

  try {
    const kvFresh = await getJson(KV_FRESH_KEY);
    if (kvFresh?.items?.length > 0) {
      return res.status(200).json({ ...kvFresh, items: kvFresh.items.slice(0, maxResults) });
    }
  } catch {}

  const quotaActive = await isQuotaExhausted();

  if (quotaActive) {
    try {
      const lastKnown = await getJson(KV_LASTKNOWN_KEY);
      if (lastKnown?.items?.length > 0) {
        return res.status(200).json({ ...lastKnown, status: 'ok_stale', items: lastKnown.items.slice(0, maxResults) });
      }
    } catch {}
  }

  let items = null;

  if (quotaActive) {
    try { items = await fetchFromRss(); } catch {}
  } else {
    try {
      items = await fetchFromDataApi();
    } catch {
      try { items = await fetchFromRss(); } catch {}
    }
  }

  if (items && items.length > 0) {
    const payload = { status: 'ok', updatedAt: new Date().toISOString(), items };
    setJson(KV_FRESH_KEY, payload, { exSeconds: KV_FRESH_TTL_SEC }).catch(() => {});
    setJson(KV_LASTKNOWN_KEY, payload, { exSeconds: KV_LASTKNOWN_TTL_SEC }).catch(() => {});
    return res.status(200).json({ ...payload, items: items.slice(0, maxResults) });
  }

  if (!quotaActive) {
    try {
      const lastKnown = await getJson(KV_LASTKNOWN_KEY);
      if (lastKnown?.items?.length > 0) {
        return res.status(200).json({ ...lastKnown, status: 'ok_stale', items: lastKnown.items.slice(0, maxResults) });
      }
    } catch {}
  }

  return res.status(200).json({ status: 'error', updatedAt: new Date().toISOString(), items: [] });
}
