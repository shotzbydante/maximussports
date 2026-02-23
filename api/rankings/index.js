/**
 * Vercel Serverless: ESPN AP Top 25 rankings.
 * GET /api/rankings. Cache: 5 min. CDN: s-maxage=120, stale-while-revalidate=300.
 */

import { createCache, coalesce } from '../_cache.js';

const ESPN_RANKINGS_URL =
  'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/rankings';

const CACHE_TTL_MS = 5 * 60 * 1000;
const rankingsCache = createCache(CACHE_TTL_MS);
const RANKINGS_KEY = 'rankings';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const cached = rankingsCache.get(RANKINGS_KEY);
  if (cached) {
    return res.json(cached);
  }

  try {
    const result = await coalesce(RANKINGS_KEY, async () => {
      if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development') {
        console.time('[api/rankings]');
      }
      const espnRes = await fetch(ESPN_RANKINGS_URL);
      if (!espnRes.ok) {
        throw new Error(`ESPN fetch failed: ${espnRes.status}`);
      }
      const data = await espnRes.json();
      const pollList = data?.rankings || [];
      const apPoll = pollList.find((p) => (p.type || '').toLowerCase() === 'ap');
      const poll = apPoll || pollList[0];
      const ranks = poll?.ranks || [];
      const rankings = ranks.map((r) => {
        const team = r.team || {};
        const teamName = [team.location, team.name].filter(Boolean).join(' ');
        return {
          teamName: teamName.trim() || 'Unknown',
          rank: r.current ?? r.rank ?? null,
          teamId: team.id ? String(team.id) : null,
        };
      });
      if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development') {
        console.timeEnd('[api/rankings]');
      }
      return { rankings };
    });

    rankingsCache.set(RANKINGS_KEY, result);
    res.json(result);
  } catch (err) {
    console.error('Rankings API error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to fetch rankings' });
  }
}
