/**
 * Projected 64-team tournament field for Bracketology.
 *
 * Used before Selection Sunday to populate a fully interactive bracket.
 * Based on current-season signals: oddsTier (Lock / Should be in / Work to do),
 * conference strength, and historical auto-bid patterns.
 *
 * Once official ESPN bracket data becomes available, the app auto-switches
 * to the live bracket and this projected field is no longer displayed.
 *
 * Seed assignments are reasonable projections for testing/iteration —
 * NOT official NCAA committee selections.
 */

import { REGIONS, SEED_MATCHUP_ORDER } from '../config/bracketology';

const PROJECTED_FIELD = [
  // ─── 1 seeds ───────────────────────────────────────────────────
  { slug: 'florida-gators',       name: 'Florida Gators',          shortName: 'Florida',       seed: 1, region: 'East',    conference: 'SEC',        record: '27-4' },
  { slug: 'duke-blue-devils',     name: 'Duke Blue Devils',        shortName: 'Duke',          seed: 1, region: 'West',    conference: 'ACC',        record: '27-4' },
  { slug: 'auburn-tigers',        name: 'Auburn Tigers',           shortName: 'Auburn',        seed: 1, region: 'South',   conference: 'SEC',        record: '27-4' },
  { slug: 'houston-cougars',      name: 'Houston Cougars',         shortName: 'Houston',       seed: 1, region: 'Midwest', conference: 'Big 12',     record: '26-5' },

  // ─── 2 seeds ───────────────────────────────────────────────────
  { slug: 'alabama-crimson-tide', name: 'Alabama Crimson Tide',    shortName: 'Alabama',       seed: 2, region: 'East',    conference: 'SEC',        record: '25-6' },
  { slug: 'iowa-state-cyclones',  name: 'Iowa State Cyclones',     shortName: 'Iowa St',       seed: 2, region: 'West',    conference: 'Big 12',     record: '25-5' },
  { slug: 'tennessee-volunteers', name: 'Tennessee Volunteers',    shortName: 'Tennessee',     seed: 2, region: 'South',   conference: 'SEC',        record: '24-7' },
  { slug: 'michigan-wolverines',  name: 'Michigan Wolverines',     shortName: 'Michigan',      seed: 2, region: 'Midwest', conference: 'Big Ten',    record: '24-6' },

  // ─── 3 seeds ───────────────────────────────────────────────────
  { slug: 'purdue-boilermakers',  name: 'Purdue Boilermakers',     shortName: 'Purdue',        seed: 3, region: 'East',    conference: 'Big Ten',    record: '24-7' },
  { slug: 'kansas-jayhawks',      name: 'Kansas Jayhawks',         shortName: 'Kansas',        seed: 3, region: 'West',    conference: 'Big 12',     record: '23-8' },
  { slug: 'gonzaga-bulldogs',     name: 'Gonzaga Bulldogs',        shortName: 'Gonzaga',       seed: 3, region: 'South',   conference: 'WCC',        record: '26-4' },
  { slug: 'st-johns-red-storm',   name: "St. John's Red Storm",    shortName: "St. John's",    seed: 3, region: 'Midwest', conference: 'Big East',   record: '24-7' },

  // ─── 4 seeds ───────────────────────────────────────────────────
  { slug: 'texas-tech-red-raiders', name: 'Texas Tech Red Raiders', shortName: 'Texas Tech',   seed: 4, region: 'East',    conference: 'Big 12',     record: '23-8' },
  { slug: 'marquette-golden-eagles', name: 'Marquette Golden Eagles', shortName: 'Marquette', seed: 4, region: 'West',    conference: 'Big East',   record: '22-9' },
  { slug: 'illinois-fighting-illini', name: 'Illinois Fighting Illini', shortName: 'Illinois', seed: 4, region: 'South',   conference: 'Big Ten',    record: '23-8' },
  { slug: 'arizona-wildcats',     name: 'Arizona Wildcats',        shortName: 'Arizona',       seed: 4, region: 'Midwest', conference: 'Big 12',     record: '22-9' },

  // ─── 5 seeds ───────────────────────────────────────────────────
  { slug: 'byu-cougars',          name: 'BYU Cougars',             shortName: 'BYU',           seed: 5, region: 'East',    conference: 'Big 12',     record: '23-8' },
  { slug: 'north-carolina-tar-heels', name: 'North Carolina Tar Heels', shortName: 'UNC',     seed: 5, region: 'West',    conference: 'ACC',        record: '21-10' },
  { slug: 'michigan-state-spartans', name: 'Michigan State Spartans', shortName: 'Michigan St', seed: 5, region: 'South', conference: 'Big Ten',    record: '22-9' },
  { slug: 'uconn-huskies',        name: 'UConn Huskies',           shortName: 'UConn',         seed: 5, region: 'Midwest', conference: 'Big East',   record: '22-9' },

  // ─── 6 seeds ───────────────────────────────────────────────────
  { slug: 'nebraska-cornhuskers', name: 'Nebraska Cornhuskers',    shortName: 'Nebraska',      seed: 6, region: 'East',    conference: 'Big Ten',    record: '22-9' },
  { slug: 'vanderbilt-commodores', name: 'Vanderbilt Commodores',  shortName: 'Vanderbilt',    seed: 6, region: 'West',    conference: 'SEC',        record: '21-10' },
  { slug: 'virginia-cavaliers',   name: 'Virginia Cavaliers',      shortName: 'Virginia',      seed: 6, region: 'South',   conference: 'ACC',        record: '21-10' },
  { slug: 'louisville-cardinals', name: 'Louisville Cardinals',    shortName: 'Louisville',    seed: 6, region: 'Midwest', conference: 'ACC',        record: '21-10' },

  // ─── 7 seeds ───────────────────────────────────────────────────
  { slug: 'kentucky-wildcats',    name: 'Kentucky Wildcats',       shortName: 'Kentucky',      seed: 7, region: 'East',    conference: 'SEC',        record: '21-10' },
  { slug: 'villanova-wildcats',   name: 'Villanova Wildcats',      shortName: 'Villanova',     seed: 7, region: 'West',    conference: 'Big East',   record: '21-10' },
  { slug: 'arkansas-razorbacks',  name: 'Arkansas Razorbacks',     shortName: 'Arkansas',      seed: 7, region: 'South',   conference: 'SEC',        record: '21-10' },
  { slug: 'wisconsin-badgers',    name: 'Wisconsin Badgers',       shortName: 'Wisconsin',     seed: 7, region: 'Midwest', conference: 'Big Ten',    record: '20-11' },

  // ─── 8 seeds ───────────────────────────────────────────────────
  { slug: 'utah-state-aggies',    name: 'Utah State Aggies',       shortName: 'Utah State',    seed: 8, region: 'East',    conference: 'Mountain West', record: '23-8' },
  { slug: 'georgia-bulldogs',     name: 'Georgia Bulldogs',        shortName: 'Georgia',       seed: 8, region: 'West',    conference: 'SEC',        record: '20-11' },
  { slug: 'clemson-tigers',       name: 'Clemson Tigers',          shortName: 'Clemson',       seed: 8, region: 'South',   conference: 'ACC',        record: '20-11' },
  { slug: 'texas-longhorns',      name: 'Texas Longhorns',         shortName: 'Texas',         seed: 8, region: 'Midwest', conference: 'SEC',        record: '20-11' },

  // ─── 9 seeds ───────────────────────────────────────────────────
  { slug: 'iowa-hawkeyes',        name: 'Iowa Hawkeyes',           shortName: 'Iowa',          seed: 9, region: 'East',    conference: 'Big Ten',    record: '20-11' },
  { slug: 'smu-mustangs',         name: 'SMU Mustangs',            shortName: 'SMU',           seed: 9, region: 'West',    conference: 'ACC',        record: '20-11' },
  { slug: 'nc-state-wolfpack',    name: 'NC State Wolfpack',       shortName: 'NC State',      seed: 9, region: 'South',   conference: 'ACC',        record: '20-11' },
  { slug: 'ucf-knights',          name: 'UCF Knights',             shortName: 'UCF',           seed: 9, region: 'Midwest', conference: 'Big 12',     record: '20-11' },

  // ─── 10 seeds ──────────────────────────────────────────────────
  { slug: 'miami-hurricanes',     name: 'Miami Hurricanes',        shortName: 'Miami',         seed: 10, region: 'East',   conference: 'ACC',        record: '19-12' },
  { slug: 'indiana-hoosiers',     name: 'Indiana Hoosiers',        shortName: 'Indiana',       seed: 10, region: 'West',   conference: 'Big Ten',    record: '19-12' },
  { slug: 'ohio-state-buckeyes',  name: 'Ohio State Buckeyes',     shortName: 'Ohio State',    seed: 10, region: 'South',  conference: 'Big Ten',    record: '19-12' },
  { slug: 'texas-am-aggies',      name: 'Texas A&M Aggies',        shortName: 'Texas A&M',     seed: 10, region: 'Midwest', conference: 'SEC',       record: '19-12' },

  // ─── 11 seeds ──────────────────────────────────────────────────
  { slug: 'saint-marys-gaels',    name: "Saint Mary's Gaels",      shortName: "Saint Mary's",  seed: 11, region: 'East',   conference: 'WCC',        record: '24-7' },
  { slug: 'ucla-bruins',          name: 'UCLA Bruins',             shortName: 'UCLA',          seed: 11, region: 'West',   conference: 'Big Ten',    record: '19-12' },
  { slug: 'missouri-tigers',      name: 'Missouri Tigers',         shortName: 'Missouri',      seed: 11, region: 'South',  conference: 'SEC',        record: '19-12' },
  { slug: 'saint-louis-billikens', name: 'Saint Louis Billikens',  shortName: 'Saint Louis',   seed: 11, region: 'Midwest', conference: 'A-10',      record: '23-8' },

  // ─── 12 seeds ──────────────────────────────────────────────────
  { slug: 'vcu-rams',             name: 'VCU Rams',                shortName: 'VCU',           seed: 12, region: 'East',   conference: 'A-10',       record: '22-9' },
  { slug: 'new-mexico-lobos',     name: 'New Mexico Lobos',        shortName: 'New Mexico',    seed: 12, region: 'West',   conference: 'Mountain West', record: '21-10' },
  { slug: 'san-diego-state-aztecs', name: 'San Diego State Aztecs', shortName: 'SDSU',        seed: 12, region: 'South',  conference: 'Mountain West', record: '21-10' },
  { slug: 'dayton-flyers',        name: 'Dayton Flyers',           shortName: 'Dayton',        seed: 12, region: 'Midwest', conference: 'A-10',      record: '22-9' },

  // ─── 13 seeds (conference auto-bids) ───────────────────────────
  { slug: 'liberty-flames',       name: 'Liberty Flames',          shortName: 'Liberty',       seed: 13, region: 'East',   conference: 'CUSA',       record: '24-7' },
  { slug: 'grand-canyon-lopes',   name: 'Grand Canyon Lopes',      shortName: 'Grand Canyon',  seed: 13, region: 'West',   conference: 'WAC',        record: '23-8' },
  { slug: 'mcneese-cowboys',      name: 'McNeese Cowboys',         shortName: 'McNeese',       seed: 13, region: 'South',  conference: 'Southland',  record: '25-5' },
  { slug: 'belmont-bruins',       name: 'Belmont Bruins',          shortName: 'Belmont',       seed: 13, region: 'Midwest', conference: 'MVC',       record: '24-7' },

  // ─── 14 seeds (conference auto-bids) ───────────────────────────
  { slug: 'ohio-bobcats',         name: 'Ohio Bobcats',            shortName: 'Ohio',          seed: 14, region: 'East',   conference: 'MAC',        record: '22-9' },
  { slug: 'south-florida-bulls',  name: 'South Florida Bulls',     shortName: 'South Florida', seed: 14, region: 'West',   conference: 'AAC',        record: '22-9' },
  { slug: 'santa-clara-broncos',  name: 'Santa Clara Broncos',     shortName: 'Santa Clara',   seed: 14, region: 'South',  conference: 'WCC',        record: '21-10' },
  { slug: 'boise-state-broncos',  name: 'Boise State Broncos',     shortName: 'Boise St',      seed: 14, region: 'Midwest', conference: 'Mountain West', record: '21-10' },

  // ─── 15 seeds (conference auto-bids) ───────────────────────────
  { slug: 'miami-ohio-redhawks',  name: 'Miami (Ohio) RedHawks',   shortName: 'Miami OH',      seed: 15, region: 'East',   conference: 'MAC',        record: '20-11' },
  { slug: 'nevada-wolf-pack',     name: 'Nevada Wolf Pack',        shortName: 'Nevada',        seed: 15, region: 'West',   conference: 'Mountain West', record: '20-11' },
  { slug: 'loyola-chicago-ramblers', name: 'Loyola Chicago Ramblers', shortName: 'Loyola Chi', seed: 15, region: 'South',  conference: 'A-10',       record: '20-11' },
  { slug: 'tulsa-golden-hurricane', name: 'Tulsa Golden Hurricane', shortName: 'Tulsa',        seed: 15, region: 'Midwest', conference: 'AAC',       record: '19-12' },

  // ─── 16 seeds (conference auto-bids) ───────────────────────────
  { slug: 'unlv-rebels',          name: 'UNLV Rebels',             shortName: 'UNLV',          seed: 16, region: 'East',   conference: 'Mountain West', record: '18-13' },
  { slug: 'creighton-bluejays',   name: 'Creighton Bluejays',      shortName: 'Creighton',     seed: 16, region: 'West',   conference: 'Big East',   record: '18-13' },
  { slug: 'seton-hall-pirates',   name: 'Seton Hall Pirates',      shortName: 'Seton Hall',    seed: 16, region: 'South',  conference: 'Big East',   record: '17-14' },
  { slug: 'oklahoma-sooners',     name: 'Oklahoma Sooners',        shortName: 'Oklahoma',      seed: 16, region: 'Midwest', conference: 'SEC',       record: '17-14' },
];

/**
 * Build a team object with logo URL for bracket display.
 */
function buildProjectedTeam(entry) {
  return {
    teamId: entry.slug,
    name: entry.name,
    shortName: entry.shortName,
    slug: entry.slug,
    seed: entry.seed,
    logo: `https://a.espncdn.com/i/teamlogos/ncaa/500/${getEspnIdFallback(entry.slug)}.png`,
    record: entry.record,
    conference: entry.conference,
    region: entry.region,
    isPlaceholder: false,
  };
}

const ESPN_ID_MAP = {
  'michigan-wolverines': 130, 'purdue-boilermakers': 2509, 'illinois-fighting-illini': 356,
  'nebraska-cornhuskers': 158, 'michigan-state-spartans': 127, 'wisconsin-badgers': 275,
  'iowa-hawkeyes': 2294, 'indiana-hoosiers': 84, 'ohio-state-buckeyes': 194,
  'ucla-bruins': 26, 'florida-gators': 57, 'vanderbilt-commodores': 238,
  'alabama-crimson-tide': 333, 'arkansas-razorbacks': 8, 'tennessee-volunteers': 2633,
  'kentucky-wildcats': 96, 'georgia-bulldogs': 61, 'texas-longhorns': 251,
  'texas-am-aggies': 245, 'auburn-tigers': 2, 'missouri-tigers': 142,
  'duke-blue-devils': 150, 'virginia-cavaliers': 258, 'louisville-cardinals': 97,
  'north-carolina-tar-heels': 153, 'nc-state-wolfpack': 152, 'clemson-tigers': 228,
  'miami-hurricanes': 2390, 'smu-mustangs': 2567, 'arizona-wildcats': 12,
  'houston-cougars': 248, 'iowa-state-cyclones': 66, 'kansas-jayhawks': 2305,
  'texas-tech-red-raiders': 2641, 'byu-cougars': 252, 'ucf-knights': 2116,
  'uconn-huskies': 41, 'st-johns-red-storm': 2599, 'villanova-wildcats': 222,
  'marquette-golden-eagles': 269, 'gonzaga-bulldogs': 2250, 'utah-state-aggies': 328,
  'saint-louis-billikens': 139, 'saint-marys-gaels': 2608, 'vcu-rams': 2670,
  'new-mexico-lobos': 167, 'san-diego-state-aztecs': 21, 'dayton-flyers': 2126,
  'liberty-flames': 2335, 'grand-canyon-lopes': 2253, 'mcneese-cowboys': 2377,
  'belmont-bruins': 2057, 'ohio-bobcats': 195, 'south-florida-bulls': 58,
  'santa-clara-broncos': 221, 'boise-state-broncos': 68, 'miami-ohio-redhawks': 193,
  'nevada-wolf-pack': 2440, 'loyola-chicago-ramblers': 2341, 'tulsa-golden-hurricane': 202,
  'unlv-rebels': 2439, 'creighton-bluejays': 156, 'seton-hall-pirates': 2550,
  'oklahoma-sooners': 201,
};

function getEspnIdFallback(slug) {
  return ESPN_ID_MAP[slug] || 0;
}

/**
 * Generate a fully populated projected bracket with 64 teams
 * slotted into standard seed matchup positions across 4 regions.
 */
export function generateProjectedBracket() {
  const teamsByRegion = {};
  for (const r of ['East', 'West', 'South', 'Midwest']) {
    teamsByRegion[r] = PROJECTED_FIELD
      .filter(t => t.region === r)
      .sort((a, b) => a.seed - b.seed);
  }

  const regions = ['East', 'West', 'South', 'Midwest'].map(regionName => {
    const teams = teamsByRegion[regionName];
    const teamBySeed = {};
    for (const t of teams) teamBySeed[t.seed] = buildProjectedTeam(t);

    const matchups = SEED_MATCHUP_ORDER.map(([topSeed, bottomSeed], idx) => ({
      matchupId: `r1-${regionName.toLowerCase()}-${idx}`,
      round: 1,
      region: regionName,
      position: idx,
      topTeam: teamBySeed[topSeed] || null,
      bottomTeam: teamBySeed[bottomSeed] || null,
      winner: null,
      status: 'ready',
    }));

    return { name: regionName, matchups };
  });

  return {
    year: 2026,
    status: 'projected',
    bracketMode: 'projected',
    regions,
    finalFour: [
      { matchupId: 'ff-1', round: 5, topTeam: null, bottomTeam: null, winner: null, status: 'pending', regionMatchup: 'East vs West' },
      { matchupId: 'ff-2', round: 5, topTeam: null, bottomTeam: null, winner: null, status: 'pending', regionMatchup: 'South vs Midwest' },
    ],
    championship: { matchupId: 'champ', round: 6, topTeam: null, bottomTeam: null, winner: null, status: 'pending' },
    lastUpdated: new Date().toISOString(),
  };
}

export { PROJECTED_FIELD };
