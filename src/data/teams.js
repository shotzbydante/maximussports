/**
 * ESPN Bubble Watch teams by conference + odds tier.
 * logo: /logos/<slug>.svg (monogram fallback if missing)
 */
const TEAM_LIST = [
  // Big Ten
  { slug: 'michigan-wolverines', name: 'Michigan Wolverines', conference: 'Big Ten', oddsTier: 'Lock', keywords: 'Michigan Wolverines basketball' },
  { slug: 'purdue-boilermakers', name: 'Purdue Boilermakers', conference: 'Big Ten', oddsTier: 'Lock', keywords: 'Purdue Boilermakers basketball' },
  { slug: 'illinois-fighting-illini', name: 'Illinois Fighting Illini', conference: 'Big Ten', oddsTier: 'Lock', keywords: 'Illinois Fighting Illini basketball' },
  { slug: 'nebraska-cornhuskers', name: 'Nebraska Cornhuskers', conference: 'Big Ten', oddsTier: 'Lock', keywords: 'Nebraska Cornhuskers basketball' },
  { slug: 'michigan-state-spartans', name: 'Michigan State Spartans', conference: 'Big Ten', oddsTier: 'Lock', keywords: 'Michigan State Spartans basketball' },
  { slug: 'wisconsin-badgers', name: 'Wisconsin Badgers', conference: 'Big Ten', oddsTier: 'Should be in', keywords: 'Wisconsin Badgers basketball' },
  { slug: 'iowa-hawkeyes', name: 'Iowa Hawkeyes', conference: 'Big Ten', oddsTier: 'Should be in', keywords: 'Iowa Hawkeyes basketball' },
  { slug: 'indiana-hoosiers', name: 'Indiana Hoosiers', conference: 'Big Ten', oddsTier: 'Work to do', keywords: 'Indiana Hoosiers basketball' },
  { slug: 'ohio-state-buckeyes', name: 'Ohio State Buckeyes', conference: 'Big Ten', oddsTier: 'Work to do', keywords: 'Ohio State Buckeyes basketball' },
  { slug: 'ucla-bruins', name: 'UCLA Bruins', conference: 'Big Ten', oddsTier: 'Work to do', keywords: 'UCLA Bruins basketball' },
  { slug: 'usc-trojans', name: 'USC Trojans', conference: 'Big Ten', oddsTier: 'Work to do', keywords: 'USC Trojans basketball' },
  { slug: 'washington-huskies', name: 'Washington Huskies', conference: 'Big Ten', oddsTier: 'Long shot', keywords: 'Washington Huskies basketball' },
  // SEC
  { slug: 'florida-gators', name: 'Florida Gators', conference: 'SEC', oddsTier: 'Lock', keywords: 'Florida Gators basketball' },
  { slug: 'vanderbilt-commodores', name: 'Vanderbilt Commodores', conference: 'SEC', oddsTier: 'Lock', keywords: 'Vanderbilt Commodores basketball' },
  { slug: 'alabama-crimson-tide', name: 'Alabama Crimson Tide', conference: 'SEC', oddsTier: 'Lock', keywords: 'Alabama Crimson Tide basketball' },
  { slug: 'arkansas-razorbacks', name: 'Arkansas Razorbacks', conference: 'SEC', oddsTier: 'Lock', keywords: 'Arkansas Razorbacks basketball' },
  { slug: 'tennessee-volunteers', name: 'Tennessee Volunteers', conference: 'SEC', oddsTier: 'Lock', keywords: 'Tennessee Volunteers basketball' },
  { slug: 'kentucky-wildcats', name: 'Kentucky Wildcats', conference: 'SEC', oddsTier: 'Should be in', keywords: 'Kentucky Wildcats basketball' },
  { slug: 'georgia-bulldogs', name: 'Georgia Bulldogs', conference: 'SEC', oddsTier: 'Should be in', keywords: 'Georgia Bulldogs basketball' },
  { slug: 'texas-longhorns', name: 'Texas Longhorns', conference: 'SEC', oddsTier: 'Should be in', keywords: 'Texas Longhorns basketball' },
  { slug: 'texas-am-aggies', name: 'Texas A&M Aggies', conference: 'SEC', oddsTier: 'Work to do', keywords: 'Texas A&M Aggies basketball' },
  { slug: 'auburn-tigers', name: 'Auburn Tigers', conference: 'SEC', oddsTier: 'Work to do', keywords: 'Auburn Tigers basketball' },
  { slug: 'missouri-tigers', name: 'Missouri Tigers', conference: 'SEC', oddsTier: 'Work to do', keywords: 'Missouri Tigers basketball' },
  { slug: 'oklahoma-sooners', name: 'Oklahoma Sooners', conference: 'SEC', oddsTier: 'Long shot', keywords: 'Oklahoma Sooners basketball' },
  { slug: 'lsu-tigers', name: 'LSU Tigers', conference: 'SEC', oddsTier: 'Long shot', keywords: 'LSU Tigers basketball' },
  // ACC
  { slug: 'duke-blue-devils', name: 'Duke Blue Devils', conference: 'ACC', oddsTier: 'Lock', keywords: 'Duke Blue Devils basketball' },
  { slug: 'virginia-cavaliers', name: 'Virginia Cavaliers', conference: 'ACC', oddsTier: 'Lock', keywords: 'Virginia Cavaliers basketball' },
  { slug: 'louisville-cardinals', name: 'Louisville Cardinals', conference: 'ACC', oddsTier: 'Lock', keywords: 'Louisville Cardinals basketball' },
  { slug: 'north-carolina-tar-heels', name: 'North Carolina Tar Heels', conference: 'ACC', oddsTier: 'Lock', keywords: 'North Carolina Tar Heels basketball' },
  { slug: 'nc-state-wolfpack', name: 'NC State Wolfpack', conference: 'ACC', oddsTier: 'Should be in', keywords: 'NC State Wolfpack basketball' },
  { slug: 'clemson-tigers', name: 'Clemson Tigers', conference: 'ACC', oddsTier: 'Should be in', keywords: 'Clemson Tigers basketball' },
  { slug: 'miami-hurricanes', name: 'Miami Hurricanes', conference: 'ACC', oddsTier: 'Should be in', keywords: 'Miami Hurricanes basketball' },
  { slug: 'smu-mustangs', name: 'SMU Mustangs', conference: 'ACC', oddsTier: 'Should be in', keywords: 'SMU Mustangs basketball' },
  { slug: 'virginia-tech-hokies', name: 'Virginia Tech Hokies', conference: 'ACC', oddsTier: 'Work to do', keywords: 'Virginia Tech Hokies basketball' },
  { slug: 'california-golden-bears', name: 'California Golden Bears', conference: 'ACC', oddsTier: 'Work to do', keywords: 'California Golden Bears basketball' },
  { slug: 'stanford-cardinal', name: 'Stanford Cardinal', conference: 'ACC', oddsTier: 'Long shot', keywords: 'Stanford Cardinal basketball' },
  { slug: 'wake-forest-demon-deacons', name: 'Wake Forest Demon Deacons', conference: 'ACC', oddsTier: 'Long shot', keywords: 'Wake Forest Demon Deacons basketball' },
  { slug: 'syracuse-orange', name: 'Syracuse Orange', conference: 'ACC', oddsTier: 'Long shot', keywords: 'Syracuse Orange basketball' },
  // Big 12
  { slug: 'arizona-wildcats', name: 'Arizona Wildcats', conference: 'Big 12', oddsTier: 'Lock', keywords: 'Arizona Wildcats basketball' },
  { slug: 'houston-cougars', name: 'Houston Cougars', conference: 'Big 12', oddsTier: 'Lock', keywords: 'Houston Cougars basketball' },
  { slug: 'iowa-state-cyclones', name: 'Iowa State Cyclones', conference: 'Big 12', oddsTier: 'Lock', keywords: 'Iowa State Cyclones basketball' },
  { slug: 'kansas-jayhawks', name: 'Kansas Jayhawks', conference: 'Big 12', oddsTier: 'Lock', keywords: 'Kansas Jayhawks basketball' },
  { slug: 'texas-tech-red-raiders', name: 'Texas Tech Red Raiders', conference: 'Big 12', oddsTier: 'Lock', keywords: 'Texas Tech Red Raiders basketball' },
  { slug: 'byu-cougars', name: 'BYU Cougars', conference: 'Big 12', oddsTier: 'Lock', keywords: 'BYU Cougars basketball' },
  { slug: 'ucf-knights', name: 'UCF Knights', conference: 'Big 12', oddsTier: 'Should be in', keywords: 'UCF Knights basketball' },
  { slug: 'tcu-horned-frogs', name: 'TCU Horned Frogs', conference: 'Big 12', oddsTier: 'Work to do', keywords: 'TCU Horned Frogs basketball' },
  { slug: 'west-virginia-mountaineers', name: 'West Virginia Mountaineers', conference: 'Big 12', oddsTier: 'Long shot', keywords: 'West Virginia Mountaineers basketball' },
  { slug: 'arizona-state-sun-devils', name: 'Arizona State Sun Devils', conference: 'Big 12', oddsTier: 'Long shot', keywords: 'Arizona State Sun Devils basketball' },
  { slug: 'cincinnati-bearcats', name: 'Cincinnati Bearcats', conference: 'Big 12', oddsTier: 'Long shot', keywords: 'Cincinnati Bearcats basketball' },
  { slug: 'oklahoma-state-cowboys', name: 'Oklahoma State Cowboys', conference: 'Big 12', oddsTier: 'Long shot', keywords: 'Oklahoma State Cowboys basketball' },
  { slug: 'baylor-bears', name: 'Baylor Bears', conference: 'Big 12', oddsTier: 'Long shot', keywords: 'Baylor Bears basketball' },
  // Big East
  { slug: 'uconn-huskies', name: 'UConn Huskies', conference: 'Big East', oddsTier: 'Lock', keywords: 'UConn Huskies basketball' },
  { slug: 'st-johns-red-storm', name: "St. John's Red Storm", conference: 'Big East', oddsTier: 'Lock', keywords: "St. John's Red Storm basketball" },
  { slug: 'villanova-wildcats', name: 'Villanova Wildcats', conference: 'Big East', oddsTier: 'Lock', keywords: 'Villanova Wildcats basketball' },
  { slug: 'seton-hall-pirates', name: "Seton Hall Pirates", conference: 'Big East', oddsTier: 'Work to do', keywords: "Seton Hall Pirates basketball" },
  { slug: 'creighton-bluejays', name: 'Creighton Bluejays', conference: 'Big East', oddsTier: 'Long shot', keywords: 'Creighton Bluejays basketball' },
  // Others (Mid-majors)
  { slug: 'gonzaga-bulldogs', name: 'Gonzaga Bulldogs', conference: 'Others', oddsTier: 'Lock', keywords: 'Gonzaga Bulldogs basketball' },
  { slug: 'utah-state-aggies', name: 'Utah State Aggies', conference: 'Others', oddsTier: 'Lock', keywords: 'Utah State Aggies basketball' },
  { slug: 'saint-louis-billikens', name: "Saint Louis Billikens", conference: 'Others', oddsTier: 'Should be in', keywords: "Saint Louis Billikens basketball" },
  { slug: 'saint-marys-gaels', name: "Saint Mary's Gaels", conference: 'Others', oddsTier: 'Should be in', keywords: "Saint Mary's Gaels basketball" },
  { slug: 'miami-ohio-redhawks', name: 'Miami (Ohio) RedHawks', conference: 'Others', oddsTier: 'Work to do', keywords: 'Miami Ohio RedHawks basketball' },
  { slug: 'santa-clara-broncos', name: 'Santa Clara Broncos', conference: 'Others', oddsTier: 'Work to do', keywords: 'Santa Clara Broncos basketball' },
  { slug: 'new-mexico-lobos', name: 'New Mexico Lobos', conference: 'Others', oddsTier: 'Work to do', keywords: 'New Mexico Lobos basketball' },
  { slug: 'san-diego-state-aztecs', name: 'San Diego State Aztecs', conference: 'Others', oddsTier: 'Work to do', keywords: 'San Diego State Aztecs basketball' },
  { slug: 'vcu-rams', name: 'VCU Rams', conference: 'Others', oddsTier: 'Work to do', keywords: 'VCU Rams basketball' },
  { slug: 'belmont-bruins', name: 'Belmont Bruins', conference: 'Others', oddsTier: 'Long shot', keywords: 'Belmont Bruins basketball' },
  { slug: 'south-florida-bulls', name: 'South Florida Bulls', conference: 'Others', oddsTier: 'Long shot', keywords: 'South Florida Bulls basketball' },
  { slug: 'boise-state-broncos', name: 'Boise State Broncos', conference: 'Others', oddsTier: 'Long shot', keywords: 'Boise State Broncos basketball' },
  { slug: 'grand-canyon-lopes', name: 'Grand Canyon Lopes', conference: 'Others', oddsTier: 'Long shot', keywords: 'Grand Canyon Lopes basketball' },
  { slug: 'nevada-wolf-pack', name: 'Nevada Wolf Pack', conference: 'Others', oddsTier: 'Long shot', keywords: 'Nevada Wolf Pack basketball' },
  { slug: 'tulsa-golden-hurricane', name: 'Tulsa Golden Hurricane', conference: 'Others', oddsTier: 'Long shot', keywords: 'Tulsa Golden Hurricane basketball' },
  { slug: 'liberty-flames', name: 'Liberty Flames', conference: 'Others', oddsTier: 'Long shot', keywords: 'Liberty Flames basketball' },
  { slug: 'dayton-flyers', name: 'Dayton Flyers', conference: 'Others', oddsTier: 'Long shot', keywords: 'Dayton Flyers basketball' },
  { slug: 'mcneese-cowboys', name: 'McNeese Cowboys', conference: 'Others', oddsTier: 'Long shot', keywords: 'McNeese Cowboys basketball' },
];

export const TEAMS = TEAM_LIST.map((t) => ({ ...t, logo: `/logos/${t.slug}.svg` }));

export function getTeamBySlug(slug) {
  return TEAMS.find((t) => t.slug === slug);
}

const TIER_ORDER = ['Lock', 'Should be in', 'Work to do', 'Long shot'];
const CONF_ORDER = ['Big Ten', 'SEC', 'ACC', 'Big 12', 'Big East', 'Others'];

export function getTeamsGroupedByConference() {
  const byConf = {};
  for (const team of TEAMS) {
    if (!byConf[team.conference]) byConf[team.conference] = {};
    const tier = team.oddsTier;
    if (!byConf[team.conference][tier]) byConf[team.conference][tier] = [];
    byConf[team.conference][tier].push(team);
  }
  for (const conf of Object.keys(byConf)) {
    for (const tier of TIER_ORDER) {
      if (byConf[conf][tier]) byConf[conf][tier].sort((a, b) => a.name.localeCompare(b.name));
    }
  }
  return CONF_ORDER.map((conf) => ({
    conference: conf,
    tiers: byConf[conf] || {},
  }));
}
