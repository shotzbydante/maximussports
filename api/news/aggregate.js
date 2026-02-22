/**
 * Vercel Serverless: Aggregate news from Google News + national feeds + team feeds.
 * GET /api/news/aggregate?teamSlug=&includeNational=&includeTeamFeeds=
 * Returns { items: [{ title, link, pubDate, source, feedType, teamSlug? }] }.
 * Filters for men's basketball; sorts by source priority then recency.
 */

import { XMLParser } from 'fast-xml-parser';
import { isMensBasketball, isMensBasketballLoose } from './filters.js';

const SOURCE_PRIORITY = {
  espn: 1,
  'ncaa.com': 2,
  ncaa: 2,
  cbs: 3,
  cbssports: 3,
  yahoo: 4,
  yahoosports: 4,
};
import { getTeamBySlug } from '../../../src/data/teams.js';
import { NATIONAL_FEEDS, TEAM_FEEDS } from '../../../src/data/newsSources.js';

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
    return items.map((item, i) => {
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
    console.warn(`Feed ${feedId} failed:`, err.message);
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
    return raw.map((item, i) => ({
      title: item.title || 'No title',
      link: item.link || '',
      pubDate: item.pubDate || '',
      source: extractRssSource(item, 'Google News'),
      feedType: 'google',
      teamSlug: team.slug,
    }));
  } catch (err) {
    console.warn('Google News fetch failed:', err.message);
    return [];
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const teamSlug = req.query?.teamSlug || null;
  const includeNational = parseBool(req.query?.includeNational);
  const includeTeamFeeds = parseBool(req.query?.includeTeamFeeds);

  const promises = [];

  if (teamSlug) {
    const team = getTeamBySlug(teamSlug);
    if (team) {
      promises.push(fetchGoogleNews(team));
    }
  }

  if (includeNational) {
    for (const feed of NATIONAL_FEEDS) {
      promises.push(
        fetchRssItems(feed.url, feed.id, feed.name, 'national')
      );
    }
  }

  if (includeTeamFeeds && teamSlug && TEAM_FEEDS[teamSlug]) {
    for (const feed of TEAM_FEEDS[teamSlug]) {
      promises.push(
        fetchRssItems(feed.url, feed.id, feed.name, 'team', teamSlug)
      );
    }
  }

  try {
    const results = await Promise.all(promises);
    const all = results.flat();
    const seen = new Set();
    const deduped = all.filter((item) => {
      const key = item.link || `${item.title}-${item.pubDate}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    let mbbFiltered = deduped.filter((item) => isMensBasketball(item.title));
    if (mbbFiltered.length === 0 && deduped.length > 0) {
      mbbFiltered = deduped.filter((item) => isMensBasketballLoose(item.title));
    }
    const sourcePriority = (src) => {
      const k = (src || '').toLowerCase().replace(/\s+/g, '');
      for (const [key, p] of Object.entries(SOURCE_PRIORITY)) {
        if (k.includes(key)) return p;
      }
      return 99;
    };
    mbbFiltered.sort((a, b) => {
      const pa = sourcePriority(a.source);
      const pb = sourcePriority(b.source);
      if (pa !== pb) return pa - pb;
      const da = new Date(a.pubDate || 0).getTime();
      const db = new Date(b.pubDate || 0).getTime();
      return db - da;
    });
    res.json({ items: mbbFiltered });
  } catch (err) {
    console.error('Aggregate news error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to fetch news' });
  }
}
