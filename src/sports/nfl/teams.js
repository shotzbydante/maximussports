/**
 * NFL team registry.
 *
 * Mirrors the shape of the MLB/NBA teams lists so shared components can
 * consume any sport through the same interface.
 *
 * Slugs are the team nickname ('chiefs', '49ers'), NOT the abbreviation.
 * MLB and NBA both key teams by abbreviation, and those collide across
 * sports ('phi', 'det', 'min'...). Pinned teams are stored server-side as a
 * bare slug with no sport column, so 28 of the 32 NFL abbreviations would be
 * misread as an MLB or NBA team on the next sync. Nickname slugs are unique
 * across every sport in the app, which keeps NFL pins unambiguous.
 */

const AFC = 'AFC';
const NFC = 'NFC';

const AFC_EAST = 'AFC East';
const AFC_NORTH = 'AFC North';
const AFC_SOUTH = 'AFC South';
const AFC_WEST = 'AFC West';
const NFC_EAST = 'NFC East';
const NFC_NORTH = 'NFC North';
const NFC_SOUTH = 'NFC South';
const NFC_WEST = 'NFC West';

export const NFL_CONFERENCES = [AFC, NFC];

export const NFL_DIVISIONS = [
  AFC_EAST, AFC_NORTH, AFC_SOUTH, AFC_WEST,
  NFC_EAST, NFC_NORTH, NFC_SOUTH, NFC_WEST,
];

/** Regular-season games per team. */
export const NFL_GAMES_PER_SEASON = 17;

export const NFL_TEAMS = [
  // AFC East
  { slug: 'bills', name: 'Buffalo Bills', nickname: 'Bills', division: AFC_EAST, conference: AFC, abbrev: 'BUF', espnId: '2' },
  { slug: 'dolphins', name: 'Miami Dolphins', nickname: 'Dolphins', division: AFC_EAST, conference: AFC, abbrev: 'MIA', espnId: '15' },
  { slug: 'patriots', name: 'New England Patriots', nickname: 'Patriots', division: AFC_EAST, conference: AFC, abbrev: 'NE', espnId: '17' },
  { slug: 'jets', name: 'New York Jets', nickname: 'Jets', division: AFC_EAST, conference: AFC, abbrev: 'NYJ', espnId: '20' },
  // AFC North
  { slug: 'ravens', name: 'Baltimore Ravens', nickname: 'Ravens', division: AFC_NORTH, conference: AFC, abbrev: 'BAL', espnId: '33' },
  { slug: 'bengals', name: 'Cincinnati Bengals', nickname: 'Bengals', division: AFC_NORTH, conference: AFC, abbrev: 'CIN', espnId: '4' },
  { slug: 'browns', name: 'Cleveland Browns', nickname: 'Browns', division: AFC_NORTH, conference: AFC, abbrev: 'CLE', espnId: '5' },
  { slug: 'steelers', name: 'Pittsburgh Steelers', nickname: 'Steelers', division: AFC_NORTH, conference: AFC, abbrev: 'PIT', espnId: '23' },
  // AFC South
  { slug: 'texans', name: 'Houston Texans', nickname: 'Texans', division: AFC_SOUTH, conference: AFC, abbrev: 'HOU', espnId: '34' },
  { slug: 'colts', name: 'Indianapolis Colts', nickname: 'Colts', division: AFC_SOUTH, conference: AFC, abbrev: 'IND', espnId: '11' },
  { slug: 'jaguars', name: 'Jacksonville Jaguars', nickname: 'Jaguars', division: AFC_SOUTH, conference: AFC, abbrev: 'JAX', espnId: '30' },
  { slug: 'titans', name: 'Tennessee Titans', nickname: 'Titans', division: AFC_SOUTH, conference: AFC, abbrev: 'TEN', espnId: '10' },
  // AFC West
  { slug: 'broncos', name: 'Denver Broncos', nickname: 'Broncos', division: AFC_WEST, conference: AFC, abbrev: 'DEN', espnId: '7' },
  { slug: 'chiefs', name: 'Kansas City Chiefs', nickname: 'Chiefs', division: AFC_WEST, conference: AFC, abbrev: 'KC', espnId: '12' },
  { slug: 'raiders', name: 'Las Vegas Raiders', nickname: 'Raiders', division: AFC_WEST, conference: AFC, abbrev: 'LV', espnId: '13' },
  { slug: 'chargers', name: 'Los Angeles Chargers', nickname: 'Chargers', division: AFC_WEST, conference: AFC, abbrev: 'LAC', espnId: '24' },
  // NFC East
  { slug: 'cowboys', name: 'Dallas Cowboys', nickname: 'Cowboys', division: NFC_EAST, conference: NFC, abbrev: 'DAL', espnId: '6' },
  { slug: 'giants', name: 'New York Giants', nickname: 'Giants', division: NFC_EAST, conference: NFC, abbrev: 'NYG', espnId: '19' },
  { slug: 'eagles', name: 'Philadelphia Eagles', nickname: 'Eagles', division: NFC_EAST, conference: NFC, abbrev: 'PHI', espnId: '21' },
  { slug: 'commanders', name: 'Washington Commanders', nickname: 'Commanders', division: NFC_EAST, conference: NFC, abbrev: 'WSH', espnId: '28' },
  // NFC North
  { slug: 'bears', name: 'Chicago Bears', nickname: 'Bears', division: NFC_NORTH, conference: NFC, abbrev: 'CHI', espnId: '3' },
  { slug: 'lions', name: 'Detroit Lions', nickname: 'Lions', division: NFC_NORTH, conference: NFC, abbrev: 'DET', espnId: '8' },
  { slug: 'packers', name: 'Green Bay Packers', nickname: 'Packers', division: NFC_NORTH, conference: NFC, abbrev: 'GB', espnId: '9' },
  { slug: 'vikings', name: 'Minnesota Vikings', nickname: 'Vikings', division: NFC_NORTH, conference: NFC, abbrev: 'MIN', espnId: '16' },
  // NFC South
  { slug: 'falcons', name: 'Atlanta Falcons', nickname: 'Falcons', division: NFC_SOUTH, conference: NFC, abbrev: 'ATL', espnId: '1' },
  { slug: 'panthers', name: 'Carolina Panthers', nickname: 'Panthers', division: NFC_SOUTH, conference: NFC, abbrev: 'CAR', espnId: '29' },
  { slug: 'saints', name: 'New Orleans Saints', nickname: 'Saints', division: NFC_SOUTH, conference: NFC, abbrev: 'NO', espnId: '18' },
  { slug: 'buccaneers', name: 'Tampa Bay Buccaneers', nickname: 'Buccaneers', division: NFC_SOUTH, conference: NFC, abbrev: 'TB', espnId: '27' },
  // NFC West
  { slug: 'cardinals', name: 'Arizona Cardinals', nickname: 'Cardinals', division: NFC_WEST, conference: NFC, abbrev: 'ARI', espnId: '22' },
  { slug: 'rams', name: 'Los Angeles Rams', nickname: 'Rams', division: NFC_WEST, conference: NFC, abbrev: 'LAR', espnId: '14' },
  { slug: '49ers', name: 'San Francisco 49ers', nickname: '49ers', division: NFC_WEST, conference: NFC, abbrev: 'SF', espnId: '25' },
  { slug: 'seahawks', name: 'Seattle Seahawks', nickname: 'Seahawks', division: NFC_WEST, conference: NFC, abbrev: 'SEA', espnId: '26' },
];

/** ESPN NFL team IDs — maps slug to ESPN numeric id. */
export const NFL_ESPN_IDS = Object.fromEntries(NFL_TEAMS.map((t) => [t.slug, t.espnId]));

/** Every NFL slug, for cross-sport pin classification. */
export const NFL_SLUGS = new Set(NFL_TEAMS.map((t) => t.slug));

const BY_SLUG = Object.fromEntries(NFL_TEAMS.map((t) => [t.slug, t]));
const BY_ESPN_ID = Object.fromEntries(NFL_TEAMS.map((t) => [t.espnId, t]));
const BY_ABBREV = Object.fromEntries(NFL_TEAMS.map((t) => [t.abbrev, t]));

/** Abbreviations other data sources use for the same team. */
const ABBREV_ALIASES = { WAS: 'WSH', JAC: 'JAX', LA: 'LAR', OAK: 'LV', SD: 'LAC', STL: 'LAR' };

export function getNflEspnId(slug) {
  return NFL_ESPN_IDS[slug] || null;
}

export function getNflTeamBySlug(slug) {
  return BY_SLUG[String(slug || '').toLowerCase()] || null;
}

export function getNflTeamByEspnId(espnId) {
  return BY_ESPN_ID[String(espnId || '')] || null;
}

export function getNflTeamByAbbrev(abbrev) {
  const key = String(abbrev || '').toUpperCase();
  return BY_ABBREV[ABBREV_ALIASES[key] || key] || null;
}

/**
 * Resolve a free-text team name from an odds feed or headline to a team.
 * Accepts the full name ("Kansas City Chiefs"), the nickname ("Chiefs"),
 * or an abbreviation ("KC").
 */
export function resolveNflTeam(name) {
  if (!name) return null;
  const raw = String(name).trim();
  const lower = raw.toLowerCase();
  if (BY_SLUG[lower]) return BY_SLUG[lower];
  const byAbbrev = getNflTeamByAbbrev(raw);
  if (byAbbrev) return byAbbrev;
  for (const t of NFL_TEAMS) {
    if (lower === t.name.toLowerCase()) return t;
  }
  // Nickname match on a word boundary: "the Giants" → Giants, but never
  // match a city alone — "New York" and "Los Angeles" are ambiguous.
  for (const t of NFL_TEAMS) {
    const nick = t.nickname.toLowerCase();
    if (lower === nick || lower.endsWith(` ${nick}`)) return t;
  }
  return null;
}

/** ESPN CDN logo, 500px PNG. NFL logos are keyed by abbreviation. */
export function getNflLogoUrl(slug) {
  const t = getNflTeamBySlug(slug);
  if (!t) return null;
  return `https://a.espncdn.com/i/teamlogos/nfl/500/${t.abbrev.toLowerCase()}.png`;
}

export function getNflTeamsGroupedByDivision() {
  return NFL_DIVISIONS.map((division) => ({
    division,
    conference: division.split(' ')[0],
    teams: NFL_TEAMS
      .filter((t) => t.division === division)
      .sort((a, b) => a.name.localeCompare(b.name)),
  }));
}

export function getNflTeamsGroupedByConference() {
  return NFL_CONFERENCES.map((conference) => ({
    conference,
    teams: NFL_TEAMS
      .filter((t) => t.conference === conference)
      .sort((a, b) => a.name.localeCompare(b.name)),
  }));
}
