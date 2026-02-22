/**
 * Client-side rankings API wrapper.
 * Fetches AP Top 25 from /api/rankings (proxies ESPN).
 */

export async function fetchRankings() {
  const res = await fetch('/api/rankings');

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  return res.json();
}
