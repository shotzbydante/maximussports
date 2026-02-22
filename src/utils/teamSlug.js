/**
 * Maps ESPN/API team names to teams.js slugs.
 * Used for linking scores/matchups to team pages.
 */

import { TEAMS } from '../data/teams';

/** Normalize for matching: lowercase, remove punctuation, collapse whitespace */
function normalize(s) {
  if (!s || typeof s !== 'string') return '';
  return s
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[.,()\-&]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Build slug-like token from name for fuzzy match */
function toToken(name) {
  const n = normalize(name);
  return n
    .replace(/\bstate\b/g, '')
    .replace(/\bst\b\.?/g, 'saint')
    .replace(/\b(fl|florida)\b/g, '')
    .replace(/\b(oh|ohio)\b/g, '')
    .replace(/\buniversity\b/g, '')
    .replace(/\b(college|of)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Common ESPN display name variants → our team names */
const ALIASES = {
  'uconn': 'UConn Huskies',
  'connecticut': 'UConn Huskies',
  'miami (fl)': 'Miami Hurricanes',
  'miami (florida)': 'Miami Hurricanes',
  'miami fl': 'Miami Hurricanes',
  'miami (oh)': 'Miami (Ohio) RedHawks',
  'miami (ohio)': 'Miami (Ohio) RedHawks',
  'miami oh': 'Miami (Ohio) RedHawks',
  'miami ohio': 'Miami (Ohio) RedHawks',
  'nc state': 'NC State Wolfpack',
  'north carolina state': 'NC State Wolfpack',
  "st. john's": "St. John's Red Storm",
  "st john's": "St. John's Red Storm",
  "saint john's": "St. John's Red Storm",
  "st. johns": "St. John's Red Storm",
  "seton hall": "Seton Hall Pirates",
  "saint mary's": "Saint Mary's Gaels",
  "st. mary's": "Saint Mary's Gaels",
  "st marys": "Saint Mary's Gaels",
  "saint louis": "Saint Louis Billikens",
  "st. louis": "Saint Louis Billikens",
  "st louis": "Saint Louis Billikens",
  "texas a&m": "Texas A&M Aggies",
  "texas am": "Texas A&M Aggies",
  "tamu": "Texas A&M Aggies",
  "lsu": "LSU Tigers",
  "louisiana state": "LSU Tigers",
  "louisiana st": "LSU Tigers",
  "unc": "North Carolina Tar Heels",
  "north carolina": "North Carolina Tar Heels",
  "ucf": "UCF Knights",
  "central florida": "UCF Knights",
  "smu": "SMU Mustangs",
  "southern methodist": "SMU Mustangs",
  "byu": "BYU Cougars",
  "brigham young": "BYU Cougars",
  "usc": "USC Trojans",
  "southern california": "USC Trojans",
  "san diego state": "San Diego State Aztecs",
  "sd state": "San Diego State Aztecs",
  "sdsu": "San Diego State Aztecs",
  "arizona state": "Arizona State Sun Devils",
  "asu": "Arizona State Sun Devils",
  "oklahoma state": "Oklahoma State Cowboys",
  "ok state": "Oklahoma State Cowboys",
  "iowa state": "Iowa State Cyclones",
  "virginia tech": "Virginia Tech Hokies",
  "vt": "Virginia Tech Hokies",
  "cal": "California Golden Bears",
  "california": "California Golden Bears",
  "wake forest": "Wake Forest Demon Deacons",
};

/**
 * Resolve ESPN/API team name to teams.js slug, or null if no match.
 * @param {string} name - Display name (e.g., "UConn", "Miami (FL)", "Duke Blue Devils")
 * @returns {string|null} - Slug or null
 */
export function getTeamSlug(name) {
  if (!name || typeof name !== 'string') return null;
  const trimmed = name.trim();
  if (!trimmed) return null;

  // 1) Exact match on team name
  const exact = TEAMS.find((t) => t.name === trimmed);
  if (exact) return exact.slug;

  // 2) Alias map (normalized key)
  const key = normalize(trimmed);
  const aliasName = ALIASES[key];
  if (aliasName) {
    const team = TEAMS.find((t) => t.name === aliasName);
    if (team) return team.slug;
  }

  // 3) Normalized match: compare tokenized names
  const token = toToken(trimmed);
  for (const team of TEAMS) {
    const teamToken = toToken(team.name);
    if (teamToken === token) return team.slug;
    // Partial: our name contains token or vice versa
    if (teamToken.includes(token) || token.includes(teamToken)) {
      const teamNorm = normalize(team.name);
      const nameNorm = normalize(trimmed);
      if (teamNorm.includes(nameNorm) || nameNorm.includes(teamNorm)) {
        return team.slug;
      }
    }
  }

  return null;
}

/**
 * Get odds tier for a team by display name (e.g., ESPN name).
 * @param {string} name - Display name
 * @returns {string|null} - 'Lock' | 'Should be in' | 'Work to do' | 'Long shot' | null
 */
export function getOddsTier(name) {
  const slug = getTeamSlug(name);
  if (!slug) return null;
  const team = TEAMS.find((t) => t.slug === slug);
  return team?.oddsTier ?? null;
}
