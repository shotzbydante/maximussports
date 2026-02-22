/**
 * Client-side scores API wrapper.
 * Fetches college basketball scores from /api/scores (proxies ESPN).
 * No API key required.
 */

export async function fetchScores() {
  const res = await fetch('/api/scores');

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  return res.json();
}
