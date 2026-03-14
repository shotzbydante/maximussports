/**
 * getUserPinnedTeams — canonical resolver for a user's pinned teams.
 *
 * Single source of truth for all email jobs (scheduled, manual, override).
 * Reads exclusively from the `user_teams` table, which is the same table
 * the Settings UI writes to when users pin/unpin teams.
 *
 * NEVER injects fallback, mock, trending, or featured teams.
 * Returns [] if the user has no pinned teams.
 */

/**
 * Fetch raw user_teams rows for a batch of user IDs.
 * Returns a map: { [userId]: [{ team_slug, is_primary }] }
 * Ordered by created_at to match the order shown in Settings.
 *
 * @param {object} sb       - Supabase admin client
 * @param {string[]} userIds
 * @returns {Promise<Record<string, Array<{team_slug: string, is_primary: boolean}>>>}
 */
export async function fetchUserTeamsBatch(sb, userIds) {
  if (!userIds || userIds.length === 0) return {};

  const { data, error } = await sb
    .from('user_teams')
    .select('user_id, team_slug, is_primary')
    .in('user_id', userIds)
    .order('created_at', { ascending: true });

  if (error) {
    console.warn('[getUserPinnedTeams] user_teams fetch error:', error.message);
    return {};
  }

  const map = {};
  for (const row of (data || [])) {
    if (!map[row.user_id]) map[row.user_id] = [];
    map[row.user_id].push(row);
  }
  return map;
}

/**
 * Resolve raw user_teams rows into full team objects using the teams data module.
 * Returns normalized team objects in the same order as Settings UI.
 *
 * @param {Array<{team_slug: string, is_primary: boolean}>} teamRows
 * @param {Function} getTeamBySlug - lookup from src/data/teams.js
 * @returns {Array<{name: string, slug: string, tier: string|null, conference: string|null, is_primary: boolean}>}
 */
export function resolveTeamRows(teamRows, getTeamBySlug) {
  if (!teamRows || teamRows.length === 0) return [];

  return teamRows
    .map(row => {
      const team = getTeamBySlug(row.team_slug);
      if (!team) {
        console.warn(`[getUserPinnedTeams] Unknown team slug: ${row.team_slug} — skipping`);
        return null;
      }
      return {
        name: team.name,
        slug: team.slug,
        tier: team.oddsTier || null,
        conference: team.conference || null,
        is_primary: row.is_primary || false,
      };
    })
    .filter(Boolean);
}

/**
 * Full resolver: fetch + resolve pinned teams for a single user.
 * Used when you need teams for one user (e.g., test sends).
 *
 * @param {object} sb       - Supabase admin client
 * @param {string} userId
 * @returns {Promise<Array<{name: string, slug: string, tier: string|null, conference: string|null, is_primary: boolean}>>}
 */
export async function getUserPinnedTeams(sb, userId) {
  const map = await fetchUserTeamsBatch(sb, [userId]);
  const rows = map[userId] || [];

  let getTeamBySlug;
  try {
    const mod = await import('../../src/data/teams.js');
    getTeamBySlug = mod.getTeamBySlug;
  } catch (err) {
    console.error('[getUserPinnedTeams] Failed to load teams module:', err.message);
    return [];
  }

  return resolveTeamRows(rows, getTeamBySlug);
}

/**
 * Get the slugs for a user's pinned teams — used as input for Team Digest.
 * This replaces the old `profile.preferences.teamDigestTeams` approach,
 * making `user_teams` the single source of truth for all team emails.
 *
 * @param {Array<{team_slug: string}>} teamRows - raw rows from user_teams
 * @returns {string[]} ordered array of team slugs
 */
export function getPinnedTeamSlugs(teamRows) {
  if (!teamRows || teamRows.length === 0) return [];
  return teamRows.map(r => r.team_slug);
}
