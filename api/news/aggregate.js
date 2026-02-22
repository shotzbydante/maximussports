/**
 * Vercel Serverless: Aggregate news from Google News + national feeds + team feeds.
 * GET /api/news/aggregate?teamSlug=&includeNational=&includeTeamFeeds=
 * Returns { items: [...] }. Never returns 500; uses staged fallback:
 * 1) Full stack → 2) Google only → 3) Google + Yahoo → 4) empty array 200.
 * Always applies men's basketball filtering.
 */

import { XMLParser } from 'fast-xml-parser';
import { isMensBasketball, isMensBasketballLoose } from './filters.js';
import { getTeamBySlug } from '../../../src/data/teams.js';
import { NATIONAL_FEEDS, TEAM_FEEDS } from '../../../src/data/newsSources.js';

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

async function fetchRssItems(url, feedId, feedName, feedType, teamSlug = null) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    const parser = new XMLParser({ ignoreAttributes: false });
    const parsed = parser.parse(xml);
    const channel = parsed?.rss?.channel || parsed?.feed;
    const rawItems = channel?.item || channel?.entry;
    const items = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];
    return items.map((item) => {
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
  } catch (err) {
    console.warn(`[aggregate] Feed ${feedId} failed:`, err.message);
    return [];
  }
}

async function fetchGoogleNews(team) {
  try {
    const query = buildGoogleQuery(team);
    const rssUrl = `https://news.google.com/rss/search?q=${query}&hl=en-US&gl=US&ceid=US:en`;
    const res = await fetch(rssUrl, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    const parser = new XMLParser({ ignoreAttributes: false });
    const parsed = parser.parse(xml);
    const items = parsed?.rss?.channel?.item;
    const raw = Array.isArray(items) ? items : items ? [items] : [];
    return raw.map((item) => ({
      title: item.title || 'No title',
      link: item.link || '',
      pubDate: item.pubDate || '',
      source: extractRssSource(item, 'Google News'),
      feedType: 'google',
      teamSlug: team.slug,
    }));
  } catch (err) {
    console.warn('[aggregate] Google News failed:', err.message);
    return [];
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

  let team = teamSlug ? getTeamBySlug(teamSlug) : null;
  if (!team && teamSlug) {
    const fallbackName = teamSlug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    team = { slug: teamSlug, name: fallbackName, keywords: `${fallbackName} basketball` };
  }

  const safeResponse = (items) => {
    const filtered = dedupeAndFilter(items, isMensBasketball);
    res.status(200).json({ items: sortBySource(filtered) });
  };

  try {
    let all = [];
    let googleItems = [];

    if (team) {
      googleItems = await fetchGoogleNews(team);
      all = [...googleItems];
    } else if (teamSlug) {
      const fallbackQuery = encodeURIComponent(`"${teamSlug.replace(/-/g, ' ')}" basketball when:90d`);
      try {
        const rssUrl = `https://news.google.com/rss/search?q=${fallbackQuery}&hl=en-US&gl=US&ceid=US:en`;
        const res = await fetch(rssUrl, { signal: AbortSignal.timeout(8000) });
        if (res.ok) {
          const xml = await res.text();
          const parser = new XMLParser({ ignoreAttributes: false });
          const parsed = parser.parse(xml);
          const items = parsed?.rss?.channel?.item;
          const raw = Array.isArray(items) ? items : items ? [items] : [];
          all = raw.map((item) => ({
            title: item.title || 'No title',
            link: item.link || '',
            pubDate: item.pubDate || '',
            source: extractRssSource(item, 'Google News'),
            feedType: 'google',
            teamSlug,
          }));
        }
      } catch (e) {
        console.warn('[aggregate] Fallback Google query failed:', e.message);
      }
    }

    const nationalItems = includeNational
      ? (await Promise.all(NATIONAL_FEEDS.map((f) => fetchRssItems(f.url, f.id, f.name, 'national')))).flat()
      : [];
    const teamFeedItems =
      includeTeamFeeds && teamSlug && TEAM_FEEDS[teamSlug]
        ? (await Promise.all(TEAM_FEEDS[teamSlug].map((f) => fetchRssItems(f.url, f.id, f.name, 'team', teamSlug)))).flat()
        : [];

    const fullStack = [...all, ...nationalItems, ...teamFeedItems];
    if (fullStack.length > 0) {
      return safeResponse(fullStack);
    }

    if (all.length > 0) {
      return safeResponse(all);
    }

    if (YAHOO_FEED) {
      const yahooItems = await fetchRssItems(YAHOO_FEED.url, YAHOO_FEED.id, YAHOO_FEED.name, 'national');
      const combined = [...all, ...yahooItems];
      if (combined.length > 0) return safeResponse(combined);
    }

    return safeResponse([]);
  } catch (err) {
    console.error('[aggregate] Error:', err.message);
    return res.status(200).json({ items: [] });
  }
}
