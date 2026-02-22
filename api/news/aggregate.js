/**
 * Vercel Serverless: Aggregate news from Google News + national feeds + team feeds.
 * GET /api/news/aggregate?teamSlug=&includeNational=&includeTeamFeeds=
 * Returns { items, sourcesTried, errors }. Never returns 500.
 * Priority: Google first (10s), then other feeds (3-5s) via allSettled.
 * Per-source cache (10 min TTL) for timeouts.
 */

import { XMLParser } from 'fast-xml-parser';
import { isMensBasketball, isMensBasketballLoose } from './filters.js';
import { getTeamBySlug } from '../../src/data/teams.js';
import { NATIONAL_FEEDS, TEAM_FEEDS } from '../../src/data/newsSources.js';

const SOURCE_PRIORITY = {
  espn: 1,
  'ncaa.com': 2,
  ncaa: 2,
  cbs: 3,
  cbssports: 3,
  yahoo: 4,
  yahoosports: 4,
};

const YAHOO_FEED = NATIONAL_FEEDS.find((f) => f.id === 'yahoo') || NATIONAL_FEEDS[0];

const GOOGLE_TIMEOUT_MS = 10_000;
const FEED_TIMEOUT_MS = 5_000;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 min

const HEADERS = {
  'User-Agent': 'MaximusSports/1.0 (+https://maximussports.vercel.app)',
  Accept: 'application/rss+xml, application/xml, text/xml',
};

const cache = new Map();

function getCacheKey(feedId, extra = '') {
  return `${feedId}${extra}`;
}

function getCached(key) {
  const entry = cache.get(key);
  if (!entry || Date.now() > entry.expires) return null;
  return entry.data;
}

function setCache(key, data) {
  cache.set(key, { data, expires: Date.now() + CACHE_TTL_MS });
}

function parseBool(val) {
  if (val === 'true' || val === '1') return true;
  if (val === 'false' || val === '0') return false;
  return false;
}

function buildGoogleQuery(team) {
  const keywords = team.keywords || team.name;
  return encodeURIComponent(`"${team.name}" OR "${keywords}" when:90d`);
}

function extractRssSource(item, feedName) {
  const src = item?.source;
  if (typeof src === 'string') return src;
  if (src?.['#text']) return src['#text'];
  const url = item?.link;
  if (!url) return feedName;
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '').split('.')[0] || feedName;
  } catch {
    return feedName;
  }
}

function safeParseXml(xml, fallback = {}) {
  try {
    const parser = new XMLParser({ ignoreAttributes: false });
    return parser.parse(xml) || fallback;
  } catch (e) {
    return fallback;
  }
}

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: HEADERS });
    clearTimeout(id);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

async function fetchRssItems(url, feedId, feedName, feedType, teamSlug = null, timeoutMs = FEED_TIMEOUT_MS) {
  const cacheKey = getCacheKey(feedId, url);
  const cached = getCached(cacheKey);
  if (cached) return { items: cached, ok: true };

  try {
    const xml = await fetchWithTimeout(url, timeoutMs);
    const parsed = safeParseXml(xml);
    const channel = parsed?.rss?.channel || parsed?.feed;
    const rawItems = channel?.item || channel?.entry;
    const items = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];
    const result = items.map((item) => {
      const link = item?.link?.['#text'] || item?.link?.['@_href'] || item?.link || '';
      const title = item?.title?.['#text'] || item?.title || 'No title';
      const pubDate = item?.pubDate || item?.published || item?.updated || '';
      const source = extractRssSource(item, feedName);
      return {
        title: typeof title === 'string' ? title : (title?.['#text'] || 'No title'),
        link: typeof link === 'string' ? link : '',
        pubDate,
        source,
        feedType,
        teamSlug,
      };
    });
    if (result.length > 0) setCache(cacheKey, result);
    return { items: result, ok: true };
  } catch (err) {
    const stale = getCached(cacheKey);
    if (stale) return { items: stale, ok: true };
    return { items: [], ok: false, error: err.message };
  }
}

async function fetchGoogleNews(team, timeoutMs = GOOGLE_TIMEOUT_MS) {
  const query = buildGoogleQuery(team);
  const rssUrl = `https://news.google.com/rss/search?q=${query}&hl=en-US&gl=US&ceid=US:en`;
  const cacheKey = getCacheKey('google', rssUrl);
  const cached = getCached(cacheKey);
  if (cached) return { items: cached, ok: true };

  try {
    const xml = await fetchWithTimeout(rssUrl, timeoutMs);
    const parsed = safeParseXml(xml);
    const items = parsed?.rss?.channel?.item;
    const raw = Array.isArray(items) ? items : items ? [items] : [];
    const result = raw.map((item) => ({
      title: item.title || 'No title',
      link: item.link || '',
      pubDate: item.pubDate || '',
      source: extractRssSource(item, 'Google News'),
      feedType: 'google',
      teamSlug: team.slug,
    }));
    if (result.length > 0) setCache(cacheKey, result);
    return { items: result, ok: true };
  } catch (err) {
    const stale = getCached(cacheKey);
    if (stale) return { items: stale, ok: true };
    return { items: [], ok: false, error: err.message };
  }
}

function dedupeAndFilter(items, isMbb) {
  const seen = new Set();
  const deduped = items.filter((item) => {
    const key = item.link || `${item.title}-${item.pubDate}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  let mbb = deduped.filter((item) => isMbb(item.title));
  if (mbb.length === 0 && deduped.length > 0) mbb = deduped.filter((item) => isMensBasketballLoose(item.title));
  return mbb;
}

function sortBySource(items) {
  const priority = (src) => {
    const k = (src || '').toLowerCase().replace(/\s+/g, '');
    for (const [key, p] of Object.entries(SOURCE_PRIORITY)) {
      if (k.includes(key)) return p;
    }
    return 99;
  };
  return [...items].sort((a, b) => {
    const pa = priority(a.source);
    const pb = priority(b.source);
    if (pa !== pb) return pa - pb;
    const da = new Date(a.pubDate || 0).getTime();
    const db = new Date(b.pubDate || 0).getTime();
    return db - da;
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const rawTeamSlug = req.query?.teamSlug || null;
  const teamSlug = typeof rawTeamSlug === 'string' ? decodeURIComponent(rawTeamSlug).trim() : null;
  const includeNational = parseBool(req.query?.includeNational);
  const includeTeamFeeds = parseBool(req.query?.includeTeamFeeds);

  const sourcesTried = [];
  const errors = [];

  const safeResponse = (items) => {
    const filtered = dedupeAndFilter(items, isMensBasketball);
    return res.status(200).json({
      items: sortBySource(filtered),
      sourcesTried,
      errors: errors.length ? errors : [],
    });
  };

  try {
    let team = teamSlug ? getTeamBySlug(teamSlug) : null;
    if (!team && teamSlug) {
      const fallbackName = teamSlug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      team = { slug: teamSlug, name: fallbackName, keywords: `${fallbackName} basketball` };
    }

    let baseline = [];

    // 1) Fetch Google News FIRST (10s)
    if (team) {
      sourcesTried.push('google');
      const result = await fetchGoogleNews(team, GOOGLE_TIMEOUT_MS);
      if (result.ok && result.items.length > 0) {
        baseline = [...result.items];
      } else if (result.error) {
        errors.push(`google: ${result.error}`);
      }
    } else if (teamSlug) {
      sourcesTried.push('google-fallback');
      const fallbackQuery = encodeURIComponent(`"${teamSlug.replace(/-/g, ' ')}" basketball when:90d`);
      const rssUrl = `https://news.google.com/rss/search?q=${fallbackQuery}&hl=en-US&gl=US&ceid=US:en`;
      const cacheKey = getCacheKey('google-fallback', rssUrl);
      const cachedFallback = getCached(cacheKey);
      if (cachedFallback) baseline = cachedFallback;
      else {
        try {
          const xml = await fetchWithTimeout(rssUrl, GOOGLE_TIMEOUT_MS);
          const parsed = safeParseXml(xml);
          const items = parsed?.rss?.channel?.item;
          const raw = Array.isArray(items) ? items : items ? [items] : [];
          baseline = raw.map((item) => ({
            title: item.title || 'No title',
            link: item.link || '',
            pubDate: item.pubDate || '',
            source: extractRssSource(item, 'Google News'),
            feedType: 'google',
            teamSlug,
          }));
          if (baseline.length > 0) setCache(cacheKey, baseline);
        } catch (e) {
          errors.push(`google-fallback: ${e.message}`);
          const stale = getCached(cacheKey);
          if (stale) baseline = stale;
        }
      }
    }

    if (baseline.length > 0) {
      const otherTasks = [];

      if (includeNational) {
        for (const f of NATIONAL_FEEDS) {
          sourcesTried.push(f.id);
          otherTasks.push(fetchRssItems(f.url, f.id, f.name, 'national', null));
        }
      }
      if (includeTeamFeeds && teamSlug && TEAM_FEEDS[teamSlug]) {
        for (const f of TEAM_FEEDS[teamSlug]) {
          sourcesTried.push(`team-${f.id}`);
          otherTasks.push(fetchRssItems(f.url, f.id, f.name, 'team', teamSlug));
        }
      }

      const settled = otherTasks.length > 0 ? await Promise.allSettled(otherTasks) : [];
      const extra = settled.flatMap((s) => {
        if (s.status === 'fulfilled' && s.value?.ok && s.value?.items?.length > 0) return s.value.items;
        if (s.status === 'rejected') errors.push(s.reason?.message || 'unknown');
        if (s.status === 'fulfilled' && !s.value?.ok && s.value?.error) errors.push(s.value.error);
        return [];
      });

      return safeResponse([...baseline, ...extra]);
    }

    // 2) Fallback: Yahoo only (5s)
    if (YAHOO_FEED) {
      sourcesTried.push('yahoo');
      const result = await fetchRssItems(YAHOO_FEED.url, YAHOO_FEED.id, YAHOO_FEED.name, 'national', null);
      if (result.ok && result.items.length > 0) return safeResponse(result.items);
      if (result.error) errors.push(`yahoo: ${result.error}`);
    }

    return safeResponse([]);
  } catch (err) {
    console.error('[aggregate] Error:', err.message);
    errors.push(err.message);
    return res.status(200).json({ items: [], sourcesTried: sourcesTried || [], errors });
  }
}
