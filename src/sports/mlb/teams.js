/**
 * MLB team registry.
 *
 * Mirrors the shape of the CBB teams list so shared components
 * can consume either via the same interface.
 */

const AL_EAST = 'AL East';
const AL_CENTRAL = 'AL Central';
const AL_WEST = 'AL West';
const NL_EAST = 'NL East';
const NL_CENTRAL = 'NL Central';
const NL_WEST = 'NL West';

export const MLB_DIVISIONS = [
  AL_EAST, AL_CENTRAL, AL_WEST,
  NL_EAST, NL_CENTRAL, NL_WEST,
];

export const MLB_TEAMS = [
  // AL East
  { slug: 'nyy', name: 'New York Yankees', division: AL_EAST, league: 'AL', abbrev: 'NYY' },
  { slug: 'bos', name: 'Boston Red Sox', division: AL_EAST, league: 'AL', abbrev: 'BOS' },
  { slug: 'tor', name: 'Toronto Blue Jays', division: AL_EAST, league: 'AL', abbrev: 'TOR' },
  { slug: 'tb',  name: 'Tampa Bay Rays', division: AL_EAST, league: 'AL', abbrev: 'TB' },
  { slug: 'bal', name: 'Baltimore Orioles', division: AL_EAST, league: 'AL', abbrev: 'BAL' },
  // AL Central
  { slug: 'cle', name: 'Cleveland Guardians', division: AL_CENTRAL, league: 'AL', abbrev: 'CLE' },
  { slug: 'min', name: 'Minnesota Twins', division: AL_CENTRAL, league: 'AL', abbrev: 'MIN' },
  { slug: 'det', name: 'Detroit Tigers', division: AL_CENTRAL, league: 'AL', abbrev: 'DET' },
  { slug: 'cws', name: 'Chicago White Sox', division: AL_CENTRAL, league: 'AL', abbrev: 'CWS' },
  { slug: 'kc',  name: 'Kansas City Royals', division: AL_CENTRAL, league: 'AL', abbrev: 'KC' },
  // AL West
  { slug: 'hou', name: 'Houston Astros', division: AL_WEST, league: 'AL', abbrev: 'HOU' },
  { slug: 'sea', name: 'Seattle Mariners', division: AL_WEST, league: 'AL', abbrev: 'SEA' },
  { slug: 'tex', name: 'Texas Rangers', division: AL_WEST, league: 'AL', abbrev: 'TEX' },
  { slug: 'laa', name: 'Los Angeles Angels', division: AL_WEST, league: 'AL', abbrev: 'LAA' },
  { slug: 'oak', name: 'Oakland Athletics', division: AL_WEST, league: 'AL', abbrev: 'OAK' },
  // NL East
  { slug: 'atl', name: 'Atlanta Braves', division: NL_EAST, league: 'NL', abbrev: 'ATL' },
  { slug: 'nym', name: 'New York Mets', division: NL_EAST, league: 'NL', abbrev: 'NYM' },
  { slug: 'phi', name: 'Philadelphia Phillies', division: NL_EAST, league: 'NL', abbrev: 'PHI' },
  { slug: 'mia', name: 'Miami Marlins', division: NL_EAST, league: 'NL', abbrev: 'MIA' },
  { slug: 'wsh', name: 'Washington Nationals', division: NL_EAST, league: 'NL', abbrev: 'WSH' },
  // NL Central
  { slug: 'chc', name: 'Chicago Cubs', division: NL_CENTRAL, league: 'NL', abbrev: 'CHC' },
  { slug: 'mil', name: 'Milwaukee Brewers', division: NL_CENTRAL, league: 'NL', abbrev: 'MIL' },
  { slug: 'stl', name: 'St. Louis Cardinals', division: NL_CENTRAL, league: 'NL', abbrev: 'STL' },
  { slug: 'pit', name: 'Pittsburgh Pirates', division: NL_CENTRAL, league: 'NL', abbrev: 'PIT' },
  { slug: 'cin', name: 'Cincinnati Reds', division: NL_CENTRAL, league: 'NL', abbrev: 'CIN' },
  // NL West
  { slug: 'lad', name: 'Los Angeles Dodgers', division: NL_WEST, league: 'NL', abbrev: 'LAD' },
  { slug: 'sd',  name: 'San Diego Padres', division: NL_WEST, league: 'NL', abbrev: 'SD' },
  { slug: 'sf',  name: 'San Francisco Giants', division: NL_WEST, league: 'NL', abbrev: 'SF' },
  { slug: 'ari', name: 'Arizona Diamondbacks', division: NL_WEST, league: 'NL', abbrev: 'ARI' },
  { slug: 'col', name: 'Colorado Rockies', division: NL_WEST, league: 'NL', abbrev: 'COL' },
];

export function getMLBTeamBySlug(slug) {
  return MLB_TEAMS.find((t) => t.slug === slug);
}

export function getMLBTeamsGroupedByDivision() {
  const byDiv = {};
  for (const team of MLB_TEAMS) {
    if (!byDiv[team.division]) byDiv[team.division] = [];
    byDiv[team.division].push(team);
  }
  for (const div of Object.keys(byDiv)) {
    byDiv[div].sort((a, b) => a.name.localeCompare(b.name));
  }
  return MLB_DIVISIONS.map((div) => ({
    division: div,
    teams: byDiv[div] || [],
  }));
}
