/**
 * Client-side schedule API wrapper.
 * Fetches team schedule from /api/schedule/:teamId.
 */

export async function fetchTeamSchedule(teamId) {
  const res = await fetch(`/api/schedule/${teamId}`);

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  return res.json();
}
