/**
 * Client-side news API wrapper.
 * Fetches team headlines from /api/news/team/:slug (Google News RSS, no API key).
 */

export async function fetchTeamNews(teamSlug) {
  const res = await fetch(`/api/news/team/${teamSlug}`);

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  return res.json();
}
