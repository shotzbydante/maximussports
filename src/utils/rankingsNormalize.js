/**
 * ESPN rankings name normalization for matching to teams.js.
 * Rules: lowercase, remove punctuation, remove "university"/"college"/"the",
 * collapse whitespace, apply alias map.
 */

import { getTeamSlug } from './teamSlug';

const RANKINGS_ALIAS = {
  uconn: 'connecticut',
  'miami fl': 'miami',
  'miami florida': 'miami',
  'miami oh': 'miami ohio',
  'miami ohio': 'miami ohio',
  'nc state': 'north carolina state',
  "st johns": "st john's",
  lsu: 'louisiana state',
  usc: 'southern california',
};

function removeWords(s) {
  return s
    .replace(/\buniversity\b/gi, '')
    .replace(/\bcollege\b/gi, '')
    .replace(/\bthe\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalize ESPN team name for matching to teams.js names.
 * @param {string} name - ESPN display name (e.g., "Miami (FL)", "UConn", "NC State")
 * @returns {string} - Normalized key for lookup
 */
export function normalizeRankingsName(name) {
  if (!name || typeof name !== 'string') return '';
  let s = name
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[.,()\-&]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  s = removeWords(s);
  return RANKINGS_ALIAS[s] ?? s;
}

/**
 * Find teams.js slug from ESPN rankings teamName.
 * Uses both direct name match and alias normalization.
 */
export function getSlugFromRankingsName(espnName, teams) {
  if (!espnName || !Array.isArray(teams)) return null;
  const key = normalizeRankingsName(espnName);
  if (!key) return null;

  for (const t of teams) {
    const teamKey = normalizeRankingsName(t.name);
    if (teamKey === key) return t.slug;
  }
  // Try partial match for edge cases (e.g., "Connecticut" vs "UConn Huskies")
  const keyParts = key.split(/\s+/);
  for (const t of teams) {
    const teamKey = normalizeRankingsName(t.name);
    if (teamKey.includes(key) || key.includes(teamKey)) return t.slug;
  }
  return null;
}

/**
 * Build map of slug -> rank from rankings API response.
 * Uses getTeamSlug first (handles ESPN names), then getSlugFromRankingsName.
 */
export function buildSlugToRankMap(data, teams) {
  const map = {};
  const list = data?.rankings || [];
  for (const r of list) {
    const slug = getTeamSlug(r.teamName) ?? getSlugFromRankingsName(r.teamName, teams);
    if (slug && r.rank != null) map[slug] = r.rank;
  }
  return map;
}
