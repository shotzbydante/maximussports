/**
 * Client-side Reddit API wrapper.
 * Calls our Express proxy to avoid CORS and expose Reddit OAuth.
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
