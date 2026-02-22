/**
 * Vercel Serverless Function: fetch top 10 Google News headlines for a team.
 * GET /api/news/team/:slug
 * Filters for men's basketball; sorts by recency.
 */

import { XMLParser } from 'fast-xml-parser';
import { isMensBasketball } from '../filters.js';
import { getTeamBySlug } from '../../../src/data/teams.js';

function parseSlug(req) {
  const slug = req.query?.slug;
  if (slug) return slug;
  const url = req.url || '';
  const match = url.match(/\/api\/news\/team\/([^/?]+)/);
  return match ? match[1] : null;
}

function buildQuery(team) {
  const name = team.name;
  const keywords = team.keywords || team.name;
  return encodeURIComponent(`"${name}" OR "${keywords}" when:90d`);
}

function extractSource(item) {
  const src = item?.source;
  if (typeof src === 'string') return src;
  if (src?.['#text']) return src['#text'];
  const url = src?.['@_url'] || item?.link;
  if (!url) return 'News';
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '').split('.')[0] || 'News';
  } catch {
    return 'News';
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

  const slug = parseSlug(req);
  if (!slug) {
    return res.status(400).json({ error: 'Missing slug' });
  }

  const team = getTeamBySlug(slug);
  if (!team) {
    return res.status(404).json({ error: 'Team not found' });
  }

  try {
    const query = buildQuery(team);
    const rssUrl = `https://news.google.com/rss/search?q=${query}&hl=en-US&gl=US&ceid=US:en`;
    const rssRes = await fetch(rssUrl);
    if (!rssRes.ok) {
      throw new Error(`News fetch failed: ${rssRes.status}`);
    }
    const xml = await rssRes.text();
    const parser = new XMLParser({ ignoreAttributes: false });
    const parsed = parser.parse(xml);
    const items = parsed?.rss?.channel?.item;
    const raw = Array.isArray(items) ? items : items ? [items] : [];
    const mbbFiltered = raw.filter((item) => isMensBasketball(item.title || ''));
    mbbFiltered.sort((a, b) => {
      const da = new Date(a.pubDate || 0).getTime();
      const db = new Date(b.pubDate || 0).getTime();
      return db - da;
    });
    const limit = 10;
    const headlines = mbbFiltered.slice(0, limit).map((item, i) => ({
      id: item.guid?.['#text'] || item.link || `news-${i}`,
      title: item.title || 'No title',
      link: item.link || '',
      pubDate: item.pubDate || '',
      source: extractSource(item),
    }));

    res.json({ team: team.name, headlines });
  } catch (err) {
    console.error('News API error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to fetch news' });
  }
}
