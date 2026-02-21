/**
 * Vercel Serverless Function: fetch top 5 Reddit posts for a team.
 * GET /api/reddit/team/:slug
 */

import { getTeamBySlug } from '../../../src/data/teams.js';

async function getRedditToken() {
  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;
  const userAgent = process.env.REDDIT_USER_AGENT || 'MaximusSports/1.0';

  if (!clientId || !clientSecret) {
    throw new Error('REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET must be set');
  }

  const res = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': userAgent,
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: 'grant_type=client_credentials',
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Reddit token error: ${res.status} ${text}`);
  }

  const data = await res.json();
  return data.access_token;
}

async function fetchReddit(url, token) {
  const userAgent = process.env.REDDIT_USER_AGENT || 'MaximusSports/1.0';
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'User-Agent': userAgent,
    },
  });

  if (!res.ok) {
    throw new Error(`Reddit API error: ${res.status}`);
  }

  return res.json();
}

function parseSlug(req) {
  const slug = req.query?.slug;
  if (slug) return slug;
  const url = req.url || '';
  const match = url.match(/\/api\/reddit\/team\/([^/?]+)/);
  return match ? match[1] : null;
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
    const token = await getRedditToken();
    const posts = [];
    const limit = 5;

    if (team.subreddit && team.subreddit !== 'CollegeBasketball') {
      const url = `https://oauth.reddit.com/r/${team.subreddit}/search.json?q=${encodeURIComponent(team.keywords)}&sort=relevance&limit=${limit}&restrict_sr=on`;
      const data = await fetchReddit(url, token);
      const listing = data?.data?.children || [];
      for (const child of listing) {
        const p = child.data;
        posts.push({
          id: p.id,
          title: p.title,
          subreddit: p.subreddit,
          author: p.author,
          upvotes: p.ups,
          numComments: p.num_comments,
          url: p.url,
          permalink: `https://reddit.com${p.permalink}`,
          created: p.created_utc,
        });
      }
    }

    if (posts.length < limit) {
      const searchUrl = `https://oauth.reddit.com/r/CollegeBasketball/search.json?q=${encodeURIComponent(team.keywords)}&sort=relevance&limit=${limit}&restrict_sr=on`;
      const data = await fetchReddit(searchUrl, token);
      const listing = data?.data?.children || [];
      const seen = new Set(posts.map((p) => p.id));
      for (const child of listing) {
        if (posts.length >= limit) break;
        const p = child.data;
        if (seen.has(p.id)) continue;
        seen.add(p.id);
        posts.push({
          id: p.id,
          title: p.title,
          subreddit: p.subreddit,
          author: p.author,
          upvotes: p.ups,
          numComments: p.num_comments,
          url: p.url,
          permalink: `https://reddit.com${p.permalink}`,
          created: p.created_utc,
        });
      }
    }

    posts.sort((a, b) => b.upvotes - a.upvotes);
    const topPosts = posts.slice(0, limit);

    res.json({ team: team.name, posts: topPosts });
  } catch (err) {
    console.error('Reddit API error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to fetch Reddit posts' });
  }
}
