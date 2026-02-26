/**
 * Maps ESPN/API team names to teams.js slugs.
 * Used for linking scores/matchups to team pages.
 */

import { TEAMS } from '../data/teams.js';

/** Normalize for matching: lowercase, remove punctuation, collapse whitespace. Exported for championship odds lookup. */
export function normalize(s) {
  if (!s || typeof s !== 'string') return '';
  return s
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[.,()\-&]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Variant for Odds API: expand "st"/"st." (after school name) -> "state", "okla" -> "oklahoma", "ariz" -> "arizona".
 * Only replace " st" / " st." (space before) so "St. John's" stays intact.
 */
export function normalizeForOdds(s) {
  if (!s || typeof s !== 'string') return '';
  const n = normalize(s);
  return n
    .replace(/\s+st\.?\s*/g, ' state ')
    .replace(/\bokla\b/g, 'oklahoma')
    .replace(/\bariz\b/g, 'arizona')
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
  // ESPN short names / variants
  "washington": "Washington Huskies",
  "washington huskies": "Washington Huskies",
  "ucla": "UCLA Bruins",
  "ucla bruins": "UCLA Bruins",
  "usc": "USC Trojans",
  "usc trojans": "USC Trojans",
  "purdue": "Purdue Boilermakers",
  "duke": "Duke Blue Devils",
  "kansas": "Kansas Jayhawks",
  "houston": "Houston Cougars",
  "uconn": "UConn Huskies",
  "connecticut": "UConn Huskies",
  "gonzaga": "Gonzaga Bulldogs",
  "arizona": "Arizona Wildcats",
  "tennessee": "Tennessee Volunteers",
  "kentucky": "Kentucky Wildcats",
  "alabama": "Alabama Crimson Tide",
  "baylor": "Baylor Bears",
  "creighton": "Creighton Bluejays",
  "marquette": "Marquette Golden Eagles",
  "north carolina": "North Carolina Tar Heels",
  "unc": "North Carolina Tar Heels",
  "tulsa": "Tulsa Golden Hurricane",
  "tulsa golden hurricane": "Tulsa Golden Hurricane",
  "liberty": "Liberty Flames",
  "liberty flames": "Liberty Flames",
  "mcneese": "McNeese Cowboys",
  "mcneese cowboys": "McNeese Cowboys",
  // Odds API / championship outrights variants (minimal)
  "oklahoma": "Oklahoma Sooners",
  "oklahoma sooners": "Oklahoma Sooners",
  "michigan state": "Michigan State Spartans",
  "stanford": "Stanford Cardinal",
  "syracuse": "Syracuse Orange",
  "west virginia": "West Virginia Mountaineers",
  "cincinnati": "Cincinnati Bearcats",
  "belmont": "Belmont Bruins",
  "boise state": "Boise State Broncos",
  "dayton": "Dayton Flyers",
  "grand canyon": "Grand Canyon Lopes",
  "grand canyon antelopes": "Grand Canyon Lopes",
  "grand canyon lopes": "Grand Canyon Lopes",
  "nevada": "Nevada Wolf Pack",
  "nevada wolf pack": "Nevada Wolf Pack",
  "south florida": "South Florida Bulls",
  // Odds API abbreviations (e.g. "Michigan St", "Arizona St", "Oklahoma St")
  "michigan st": "Michigan State Spartans",
  "arizona st": "Arizona State Sun Devils",
  "oklahoma st": "Oklahoma State Cowboys",
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

/** Strip last N words from name for mascot stripping. Exported for championship lookup. */
export function stripLastWords(name, n) {
  if (!name || typeof name !== 'string') return '';
  const parts = name.trim().split(/\s+/);
  if (parts.length <= n) return '';
  return parts.slice(0, -n).join(' ');
}

/** Blocked base tokens for strip-2: too short or ambiguous (avoid false matches). */
const STRIP2_BLOCKED = new Set(['state', 'tech', 'college', 'university', 'usc', 'uc', 'miami', 'saint', 'st']);

function isStrip2BaseAllowed(normalizedBase) {
  if (!normalizedBase || typeof normalizedBase !== 'string') return false;
  const tokens = normalizedBase.trim().split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return false;
  const first = tokens[0].toLowerCase();
  if (STRIP2_BLOCKED.has(first)) return false;
  return true;
}

/**
 * Build runtime lookup for championship odds: normalized name keys -> slug.
 * Prefer exact normalized full-name, then alias map, then strip mascot (1 word). Only use strip-2 when base has >=2 tokens and not in blocked set.
 * @returns {Record<string, string>} normKey -> slug (first win)
 */
export function buildChampionshipLookup() {
  const lookup = Object.create(null);
  for (const team of TEAMS) {
    const slug = team.slug;
    const name = team.name || '';
    const n = normalize(name);
    if (n && !lookup[n]) lookup[n] = slug;
    const noMascot1 = stripLastWords(name, 1);
    const n1 = normalize(noMascot1);
    if (n1 && !lookup[n1]) lookup[n1] = slug;
    const noMascot2 = stripLastWords(name, 2);
    const n2 = normalize(noMascot2);
    if (n2 && isStrip2BaseAllowed(n2) && !lookup[n2]) lookup[n2] = slug;
    const oddsNorm = normalizeForOdds(name);
    if (oddsNorm && !lookup[oddsNorm]) lookup[oddsNorm] = slug;
    const oddsNorm1 = normalizeForOdds(noMascot1);
    if (oddsNorm1 && !lookup[oddsNorm1]) lookup[oddsNorm1] = slug;
  }
  for (const [aliasKey, aliasName] of Object.entries(ALIASES)) {
    const team = TEAMS.find((t) => t.name === aliasName);
    if (team && !lookup[normalize(aliasKey)]) lookup[normalize(aliasKey)] = team.slug;
    if (team && !lookup[normalize(aliasName)]) lookup[normalize(aliasName)] = team.slug;
  }
  return lookup;
}
