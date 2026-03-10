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
  // Mid-major / MVC teams that appear in ESPN scores
  "loyola chicago": "Loyola Chicago Ramblers",
  "loyola chicago ramblers": "Loyola Chicago Ramblers",
  "loyola-chicago": "Loyola Chicago Ramblers",
  "marquette golden eagles": "Marquette Golden Eagles",
  // Common chatbot shorthand — short school names without mascot
  "florida": "Florida Gators",
  "florida gators": "Florida Gators",
  "illinois": "Illinois Fighting Illini",
  "illinois fighting illini": "Illinois Fighting Illini",
  "virginia": "Virginia Cavaliers",
  "virginia cavaliers": "Virginia Cavaliers",
  "ohio state": "Ohio State Buckeyes",
  "ohio state buckeyes": "Ohio State Buckeyes",
  "michigan": "Michigan Wolverines",
  "michigan wolverines": "Michigan Wolverines",
  "indiana": "Indiana Hoosiers",
  "indiana hoosiers": "Indiana Hoosiers",
  "arkansas": "Arkansas Razorbacks",
  "arkansas razorbacks": "Arkansas Razorbacks",
  "auburn": "Auburn Tigers",
  "auburn tigers": "Auburn Tigers",
  "missouri": "Missouri Tigers",
  "missouri tigers": "Missouri Tigers",
  "iowa": "Iowa Hawkeyes",
  "iowa hawkeyes": "Iowa Hawkeyes",
  "nebraska": "Nebraska Cornhuskers",
  "nebraska cornhuskers": "Nebraska Cornhuskers",
  "georgia": "Georgia Bulldogs",
  "georgia bulldogs": "Georgia Bulldogs",
  "south carolina": "South Carolina Gamecocks",
  "south carolina gamecocks": "South Carolina Gamecocks",
  "ole miss": "Ole Miss Rebels",
  "mississippi": "Ole Miss Rebels",
  "mississippi state": "Mississippi State Bulldogs",
  "mississippi state bulldogs": "Mississippi State Bulldogs",
  "tcu": "TCU Horned Frogs",
  "tcu horned frogs": "TCU Horned Frogs",
  "wichita state": "Wichita State Shockers",
  "drake": "Drake Bulldogs",
  "butler": "Butler Bulldogs",
  "xavier": "Xavier Musketeers",
  "villanova": "Villanova Wildcats",
  "providence": "Providence Friars",
  "st. bonaventure": "St. Bonaventure Bonnies",
  "rhode island": "Rhode Island Rams",
  "george mason": "George Mason Patriots",
  "memphis": "Memphis Tigers",
  "memphis tigers": "Memphis Tigers",
  "colorado": "Colorado Buffaloes",
  "colorado buffaloes": "Colorado Buffaloes",
  "oregon": "Oregon Ducks",
  "oregon ducks": "Oregon Ducks",
  "utah": "Utah Utes",
  "utah utes": "Utah Utes",
  // Mid-major and common chatbot shorthand
  "north carolina a&t": "North Carolina A&T Aggies",
  "nc a&t": "North Carolina A&T Aggies",
  "ncat": "North Carolina A&T Aggies",
  "northeastern": "Northeastern Huskies",
  "northeastern huskies": "Northeastern Huskies",
  "charleston southern": "Charleston Southern Buccaneers",
  "florida gulf coast": "Florida Gulf Coast Eagles",
  "fgcu": "Florida Gulf Coast Eagles",
  "lipscomb": "Lipscomb Bisons",
  "winthrop": "Winthrop Eagles",
  "st. john's red storm": "St. John's Red Storm",
  "ohio bobcats": "Ohio Bobcats",
  "ohio": "Ohio Bobcats",
  "miami redhawks": "Miami (Ohio) RedHawks",
  "miami (oh) redhawks": "Miami (Ohio) RedHawks",
  "wichita st": "Wichita State Shockers",
  "wichita state shockers": "Wichita State Shockers",
  "florida state": "Florida State Seminoles",
  "fsu": "Florida State Seminoles",
  "georgia tech": "Georgia Tech Yellow Jackets",
  "louisville": "Louisville Cardinals",
  "louisville cardinals": "Louisville Cardinals",
  "clemson": "Clemson Tigers",
  "clemson tigers": "Clemson Tigers",
  "penn state": "Penn State Nittany Lions",
  "penn st": "Penn State Nittany Lions",
  "northwestern": "Northwestern Wildcats",
  "northwestern wildcats": "Northwestern Wildcats",
  "rutgers": "Rutgers Scarlet Knights",
  "rutgers scarlet knights": "Rutgers Scarlet Knights",
  "minnesota": "Minnesota Golden Gophers",
  "minnesota golden gophers": "Minnesota Golden Gophers",
  "wisconsin": "Wisconsin Badgers",
  "wisconsin badgers": "Wisconsin Badgers",
  "maryland": "Maryland Terrapins",
  "maryland terrapins": "Maryland Terrapins",
  "st. john's": "St. John's Red Storm",
  "seton hall pirates": "Seton Hall Pirates",
  "uconn huskies": "UConn Huskies",
  "xavier musketeers": "Xavier Musketeers",
  "depaul": "DePaul Blue Demons",
  "depaul blue demons": "DePaul Blue Demons",
  "georgetown": "Georgetown Hoyas",
  "georgetown hoyas": "Georgetown Hoyas",
  "providence friars": "Providence Friars",
  "villanova wildcats": "Villanova Wildcats",
  "butler bulldogs": "Butler Bulldogs",
  "notre dame": "Notre Dame Fighting Irish",
  "notre dame fighting irish": "Notre Dame Fighting Irish",
  "pittsburgh": "Pittsburgh Panthers",
  "pitt": "Pittsburgh Panthers",
  "pittsburgh panthers": "Pittsburgh Panthers",
  "boston college": "Boston College Eagles",
  "bc": "Boston College Eagles",
  "miami hurricanes": "Miami Hurricanes",
  "nc state wolfpack": "NC State Wolfpack",
  "duke blue devils": "Duke Blue Devils",
  "north carolina tar heels": "North Carolina Tar Heels",
  "virginia cavaliers": "Virginia Cavaliers",
  "kentucky wildcats": "Kentucky Wildcats",
  "florida gators": "Florida Gators",
  "tennessee volunteers": "Tennessee Volunteers",
  "alabama crimson tide": "Alabama Crimson Tide",
  "auburn tigers": "Auburn Tigers",
  "lsu tigers": "LSU Tigers",
  "texas longhorns": "Texas Longhorns",
  "texas": "Texas Longhorns",
  "oklahoma sooners": "Oklahoma Sooners",
  "kansas jayhawks": "Kansas Jayhawks",
  "baylor bears": "Baylor Bears",
  "houston cougars": "Houston Cougars",
  "memphis tigers": "Memphis Tigers",
  "arizona wildcats": "Arizona Wildcats",
  "gonzaga bulldogs": "Gonzaga Bulldogs",
  "san diego st": "San Diego State Aztecs",
  "boise st": "Boise State Broncos",
  "nevada wolf pack": "Nevada Wolf Pack",
  "utah state": "Utah State Aggies",
  "utah state aggies": "Utah State Aggies",
  "new mexico": "New Mexico Lobos",
  "new mexico lobos": "New Mexico Lobos",
};

const FEED_SLUGS = {
  'penn state': 'penn-state-nittany-lions',
  'penn state nittany lions': 'penn-state-nittany-lions',
  'penn st': 'penn-state-nittany-lions',
  'northwestern': 'northwestern-wildcats',
  'northwestern wildcats': 'northwestern-wildcats',
  'colorado state': 'colorado-state-rams',
  'colorado st': 'colorado-state-rams',
  'kansas state': 'kansas-state-wildcats',
  'kansas st': 'kansas-state-wildcats',
  'k state': 'kansas-state-wildcats',
  'oregon state': 'oregon-state-beavers',
  'oregon st': 'oregon-state-beavers',
  'florida atlantic': 'florida-atlantic-owls',
  'fau': 'florida-atlantic-owls',
  'florida gulf coast': 'florida-gulf-coast-eagles',
  'fgcu': 'florida-gulf-coast-eagles',
  'george mason': 'george-mason-patriots',
  'george mason patriots': 'george-mason-patriots',
  'richmond': 'richmond-spiders',
  'richmond spiders': 'richmond-spiders',
  'temple': 'temple-owls',
  'temple owls': 'temple-owls',
  'rhode island': 'rhode-island-rams',
  'rhode island rams': 'rhode-island-rams',
  'east carolina': 'east-carolina-pirates',
  'american': 'american-eagles',
  'youngstown state': 'youngstown-state-penguins',
  'youngstown st': 'youngstown-state-penguins',
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

  // 2.5) Feed-slug direct lookup (odds feed names → canonical slug)
  const feedSlug = FEED_SLUGS[key];
  if (feedSlug) return feedSlug;

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
