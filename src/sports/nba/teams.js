/**
 * NBA team registry.
 *
 * Mirrors the shape of the MLB/CBB teams list so shared components
 * can consume either via the same interface.
 */

const EASTERN = 'Eastern';
const WESTERN = 'Western';

const ATL_DIV = 'Atlantic';
const CEN_DIV = 'Central';
const SE_DIV = 'Southeast';
const NW_DIV = 'Northwest';
const PAC_DIV = 'Pacific';
const SW_DIV = 'Southwest';

export const NBA_CONFERENCES = [EASTERN, WESTERN];

export const NBA_DIVISIONS = [
  ATL_DIV, CEN_DIV, SE_DIV,
  NW_DIV, PAC_DIV, SW_DIV,
];

export const NBA_TEAMS = [
  // Atlantic
  { slug: 'bos', name: 'Boston Celtics', division: ATL_DIV, conference: EASTERN, abbrev: 'BOS' },
  { slug: 'bkn', name: 'Brooklyn Nets', division: ATL_DIV, conference: EASTERN, abbrev: 'BKN' },
  { slug: 'nyk', name: 'New York Knicks', division: ATL_DIV, conference: EASTERN, abbrev: 'NYK' },
  { slug: 'phi', name: 'Philadelphia 76ers', division: ATL_DIV, conference: EASTERN, abbrev: 'PHI' },
  { slug: 'tor', name: 'Toronto Raptors', division: ATL_DIV, conference: EASTERN, abbrev: 'TOR' },
  // Central
  { slug: 'chi', name: 'Chicago Bulls', division: CEN_DIV, conference: EASTERN, abbrev: 'CHI' },
  { slug: 'cle', name: 'Cleveland Cavaliers', division: CEN_DIV, conference: EASTERN, abbrev: 'CLE' },
  { slug: 'det', name: 'Detroit Pistons', division: CEN_DIV, conference: EASTERN, abbrev: 'DET' },
  { slug: 'ind', name: 'Indiana Pacers', division: CEN_DIV, conference: EASTERN, abbrev: 'IND' },
  { slug: 'mil', name: 'Milwaukee Bucks', division: CEN_DIV, conference: EASTERN, abbrev: 'MIL' },
  // Southeast
  { slug: 'atl', name: 'Atlanta Hawks', division: SE_DIV, conference: EASTERN, abbrev: 'ATL' },
  { slug: 'cha', name: 'Charlotte Hornets', division: SE_DIV, conference: EASTERN, abbrev: 'CHA' },
  { slug: 'mia', name: 'Miami Heat', division: SE_DIV, conference: EASTERN, abbrev: 'MIA' },
  { slug: 'orl', name: 'Orlando Magic', division: SE_DIV, conference: EASTERN, abbrev: 'ORL' },
  { slug: 'was', name: 'Washington Wizards', division: SE_DIV, conference: EASTERN, abbrev: 'WAS' },
  // Northwest
  { slug: 'den', name: 'Denver Nuggets', division: NW_DIV, conference: WESTERN, abbrev: 'DEN' },
  { slug: 'min', name: 'Minnesota Timberwolves', division: NW_DIV, conference: WESTERN, abbrev: 'MIN' },
  { slug: 'okc', name: 'Oklahoma City Thunder', division: NW_DIV, conference: WESTERN, abbrev: 'OKC' },
  { slug: 'por', name: 'Portland Trail Blazers', division: NW_DIV, conference: WESTERN, abbrev: 'POR' },
  { slug: 'uta', name: 'Utah Jazz', division: NW_DIV, conference: WESTERN, abbrev: 'UTA' },
  // Pacific
  { slug: 'gsw', name: 'Golden State Warriors', division: PAC_DIV, conference: WESTERN, abbrev: 'GSW' },
  { slug: 'lac', name: 'LA Clippers', division: PAC_DIV, conference: WESTERN, abbrev: 'LAC' },
  { slug: 'lal', name: 'Los Angeles Lakers', division: PAC_DIV, conference: WESTERN, abbrev: 'LAL' },
  { slug: 'phx', name: 'Phoenix Suns', division: PAC_DIV, conference: WESTERN, abbrev: 'PHX' },
  { slug: 'sac', name: 'Sacramento Kings', division: PAC_DIV, conference: WESTERN, abbrev: 'SAC' },
  // Southwest
  { slug: 'dal', name: 'Dallas Mavericks', division: SW_DIV, conference: WESTERN, abbrev: 'DAL' },
  { slug: 'hou', name: 'Houston Rockets', division: SW_DIV, conference: WESTERN, abbrev: 'HOU' },
  { slug: 'mem', name: 'Memphis Grizzlies', division: SW_DIV, conference: WESTERN, abbrev: 'MEM' },
  { slug: 'nop', name: 'New Orleans Pelicans', division: SW_DIV, conference: WESTERN, abbrev: 'NOP' },
  { slug: 'sas', name: 'San Antonio Spurs', division: SW_DIV, conference: WESTERN, abbrev: 'SAS' },
];

/** ESPN NBA team IDs — maps slug to ESPN numeric id. */
export const NBA_ESPN_IDS = {
  'atl': '1', 'bos': '2', 'bkn': '17', 'cha': '30', 'chi': '4',
  'cle': '5', 'dal': '6', 'den': '7', 'det': '8', 'gsw': '9',
  'hou': '10', 'ind': '11', 'lac': '12', 'lal': '13', 'mem': '29',
  'mia': '14', 'mil': '15', 'min': '16', 'nop': '3', 'nyk': '18',
  'okc': '25', 'orl': '19', 'phi': '20', 'phx': '21', 'por': '22',
  'sac': '23', 'sas': '24', 'tor': '28', 'uta': '26', 'was': '27',
};

export function getNbaEspnId(slug) {
  return NBA_ESPN_IDS[slug] || null;
}

export function getNbaTeamBySlug(slug) {
  return NBA_TEAMS.find((t) => t.slug === slug);
}

export function getNbaTeamsGroupedByDivision() {
  const byDiv = {};
  for (const team of NBA_TEAMS) {
    if (!byDiv[team.division]) byDiv[team.division] = [];
    byDiv[team.division].push(team);
  }
  for (const div of Object.keys(byDiv)) {
    byDiv[div].sort((a, b) => a.name.localeCompare(b.name));
  }
  return NBA_DIVISIONS.map((div) => ({
    division: div,
    teams: byDiv[div] || [],
  }));
}

export function getNbaTeamsGroupedByConference() {
  const byConf = {};
  for (const team of NBA_TEAMS) {
    if (!byConf[team.conference]) byConf[team.conference] = [];
    byConf[team.conference].push(team);
  }
  for (const conf of Object.keys(byConf)) {
    byConf[conf].sort((a, b) => a.name.localeCompare(b.name));
  }
  return NBA_CONFERENCES.map((conf) => ({
    conference: conf,
    teams: byConf[conf] || [],
  }));
}
