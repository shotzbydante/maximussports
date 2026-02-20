/**
 * Express proxy server for Reddit API.
 * Handles OAuth and proxies requests to avoid CORS.
 */
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { getTeamBySlug } from '../src/data/teams.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: ['http://localhost:5173', 'http://127.0.0.1:5173'] }));
app.use(express.json());

async function getRedditToken() {
  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;
  const userAgent = process.env.REDDIT_USER_AGENT || 'MaximusSports/1.0';

  if (!clientId || !clientSecret) {
    throw new Error('REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET must be set in .env');
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

app.get('/api/reddit/team/:slug', async (req, res) => {
  const { slug } = req.params;
  const team = getTeamBySlug(slug);

  if (!team) {
    return res.status(404).json({ error: 'Team not found' });
  }

  try {
    const token = await getRedditToken();
    const posts = [];
    const limit = 5;

    // Try subreddit first (if not CollegeBasketball - that's our fallback)
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

    // Fallback or supplement: search r/CollegeBasketball
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

    // Sort by upvotes and take top 5
    posts.sort((a, b) => b.upvotes - a.upvotes);
    const topPosts = posts.slice(0, limit);

    res.json({ team: team.name, posts: topPosts });
  } catch (err) {
    console.error('Reddit proxy error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to fetch Reddit posts' });
  }
});

app.listen(PORT, () => {
  console.log(`Reddit proxy server running on http://localhost:${PORT}`);
});
