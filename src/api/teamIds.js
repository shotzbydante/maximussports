/**
 * Client-side team IDs API wrapper.
 * Fetches slug→ESPN team ID map from /api/teamIds.
 */

export async function fetchTeamIds() {
  const res = await fetch('/api/teamIds');

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  return res.json();
}
