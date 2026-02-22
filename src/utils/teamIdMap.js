/**
 * Maps team slug → ESPN team ID for schedule API.
 * Built from rankings data (Top 25) + ESPN teams list.
 */

import { getTeamSlug } from './teamSlug.js';
import { getSlugFromRankingsName } from './rankingsNormalize.js';
import { TEAMS } from '../data/teams.js';

/**
 * Build slug → ESPN team ID map from rankings API response.
 * Rankings include teamId for Top 25.
 * @param {{ rankings: Array<{ teamName: string, rank: number, teamId?: string }> }} data
 * @returns {Record<string, string>}
 */
export function buildSlugToIdFromRankings(data) {
  const map = {};
  const list = data?.rankings || [];
  for (const r of list) {
    const slug = getTeamSlug(r.teamName) ?? getSlugFromRankingsName(r.teamName, TEAMS);
    const id = r.teamId;
    if (slug && id) map[slug] = String(id);
  }
  return map;
}
