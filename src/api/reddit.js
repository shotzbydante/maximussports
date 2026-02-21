/**
 * Client-side Reddit API wrapper.
 * Calls Vercel serverless endpoint /api/reddit/team/:slug
 */

const API_BASE = import.meta.env.VITE_REDDIT_PROXY_URL || '';

export async function fetchTeamPosts(teamSlug) {
  const res = await fetch(`${API_BASE}/api/reddit/team/${teamSlug}`);

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  return res.json();
}
