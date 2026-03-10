/**
 * ESPN team logo resolver for Maximus's Picks.
 *
 * Maps team slugs to ESPN CDN logo URLs. Covers D1 teams that commonly
 * appear in scoreboard and odds feeds. Falls back gracefully when no
 * ESPN ID is known.
 *
 * URL pattern: https://a.espncdn.com/i/teamlogos/ncaa/500/{espnId}.png
 */

const ESPN_LOGO_BASE = 'https://a.espncdn.com/i/teamlogos/ncaa/500';

// slug → ESPN numeric team ID (comprehensive coverage)
const SLUG_TO_ESPN_ID = {
  'duke-blue-devils': '150', 'north-carolina-tar-heels': '153', 'kansas-jayhawks': '2305',
  'kentucky-wildcats': '96', 'gonzaga-bulldogs': '2250', 'villanova-wildcats': '222',
  'ucla-bruins': '26', 'michigan-state-spartans': '127', 'purdue-boilermakers': '2509',
  'houston-cougars': '248', 'arizona-wildcats': '12', 'baylor-bears': '239',
  'tennessee-volunteers': '2633', 'alabama-crimson-tide': '333', 'auburn-tigers': '2',
  'marquette-golden-eagles': '269', 'creighton-bluejays': '156',
  'uconn-huskies': '41', 'iowa-state-cyclones': '66', 'texas-longhorns': '251',
  'indiana-hoosiers': '84', 'michigan-wolverines': '130', 'illinois-fighting-illini': '356',
  'ohio-state-buckeyes': '194', 'wisconsin-badgers': '275', 'iowa-hawkeyes': '2294',
  'virginia-cavaliers': '258', 'florida-gators': '57', 'arkansas-razorbacks': '8',
  'usc-trojans': '30', 'oregon-ducks': '2483', 'colorado-buffaloes': '38',
  'nebraska-cornhuskers': '158', 'minnesota-golden-gophers': '135',
  'maryland-terrapins': '120', 'rutgers-scarlet-knights': '164',
  'northwestern-wildcats': '77', 'penn-state-nittany-lions': '213',
  'washington-huskies': '264', 'stanford-cardinal': '24', 'california-golden-bears': '25',
  'arizona-state-sun-devils': '9', 'utah-utes': '254', 'oregon-state-beavers': '204',
  'oklahoma-sooners': '201', 'oklahoma-state-cowboys': '197', 'kansas-state-wildcats': '2306',
  'tcu-horned-frogs': '2628', 'texas-tech-red-raiders': '2641', 'west-virginia-mountaineers': '277',
  'cincinnati-bearcats': '2132', 'byu-cougars': '252', 'ucf-knights': '2116',
  'st-johns-red-storm': '2599', 'seton-hall-pirates': '2550', 'xavier-musketeers': '2752',
  'providence-friars': '2507', 'butler-bulldogs': '2086', 'depaul-blue-demons': '305',
  'georgetown-hoyas': '46', 'notre-dame-fighting-irish': '87',
  'pittsburgh-panthers': '221', 'louisville-cardinals': '97', 'clemson-tigers': '228',
  'florida-state-seminoles': '52', 'georgia-tech-yellow-jackets': '59',
  'miami-hurricanes': '2390', 'nc-state-wolfpack': '152', 'syracuse-orange': '183',
  'boston-college-eagles': '103', 'virginia-tech-hokies': '259',
  'wake-forest-demon-deacons': '154', 'mississippi-state-bulldogs': '344',
  'ole-miss-rebels': '145', 'lsu-tigers': '99', 'south-carolina-gamecocks': '2579',
  'missouri-tigers': '142', 'georgia-bulldogs': '61', 'vanderbilt-commodores': '238',
  'texas-am-aggies': '245', 'memphis-tigers': '235',
  'san-diego-state-aztecs': '21', 'boise-state-broncos': '68', 'nevada-wolf-pack': '2440',
  'new-mexico-lobos': '167', 'colorado-state-rams': '36', 'utah-state-aggies': '328',
  'wyoming-cowboys': '2751', 'fresno-state-bulldogs': '278', 'unlv-rebels': '2439',
  'san-jose-state-spartans': '23',
  'dayton-flyers': '2126', 'saint-marys-gaels': '2608', 'san-francisco-dons': '2539',
  'santa-clara-broncos': '2541', 'loyola-marymount-lions': '2350',
  'pepperdine-waves': '2492', 'portland-pilots': '2501', 'pacific-tigers': '279',
  'saint-louis-billikens': '139', 'rhode-island-rams': '227', 'george-mason-patriots': '2244',
  'st-bonaventure-bonnies': '179', 'richmond-spiders': '257', 'vcu-rams': '2670',
  'wichita-state-shockers': '2724', 'drake-bulldogs': '2181',
  'loyola-chicago-ramblers': '2341', 'northern-iowa-panthers': '2460',
  'belmont-bruins': '2057', 'liberty-flames': '2335', 'grand-canyon-lopes': '2253',
  'mcneese-cowboys': '2377', 'south-florida-bulls': '58',
  'tulsa-golden-hurricane': '202', 'smu-mustangs': '2567',
  'east-carolina-pirates': '151', 'temple-owls': '218',
  'florida-atlantic-owls': '2226', 'uab-blazers': '5',
  'vermont-catamounts': '261', 'stony-brook-seawolves': '2619',
  'northeastern-huskies': '111', 'high-point-panthers': '2272',
  'njit-highlanders': '2885', 'umbc-retrievers': '2378',
  // Mid-majors / long-tail commonly in odds feeds
  'grambling-state-tigers': '2755', 'jackson-state-tigers': '2296',
  'new-mexico-state-aggies': '166', 'jacksonville-state-gamecocks': '55',
  'siena-saints': '2561', 'merrimack-warriors': '2897',
  'montana-grizzlies': '149', 'portland-state-vikings': '2502',
  'ut-rio-grande-valley-vaqueros': '2638',
  'alabama-am-bulldogs': '2010', 'alcorn-state-braves': '2016',
  'arkansas-pine-bluff-golden-lions': '2029', 'bethune-cookman-wildcats': '2065',
  'coppin-state-eagles': '2154', 'delaware-state-hornets': '2169',
  'florida-am-rattlers': '50', 'howard-bison': '47',
  'mississippi-valley-state-delta-devils': '2400',
  'norfolk-state-spartans': '2450', 'prairie-view-am-panthers': '2504',
  'southern-university-jaguars': '2582', 'texas-southern-tigers': '2640',
  'charleston-southern-buccaneers': '2127',
  'lipscomb-bisons': '288', 'winthrop-eagles': '2737',
  'florida-gulf-coast-eagles': '526',
  'queens-royals': '3101',
  'central-arkansas-bears': '2110', 'lamar-cardinals': '2320',
  'montana-state-bobcats': '147', 'idaho-state-bengals': '304',
  'weber-state-wildcats': '2692', 'northern-arizona-lumberjacks': '2464',
  'sacramento-state-hornets': '16', 'eastern-washington-eagles': '331',
  'idaho-vandals': '70',
};

/**
 * Get ESPN CDN logo URL for a team slug.
 * @param {string} slug — canonical team slug (e.g. 'duke-blue-devils')
 * @returns {string|null} — ESPN CDN URL or null
 */
export function getEspnLogoUrl(slug) {
  if (!slug) return null;
  const id = SLUG_TO_ESPN_ID[slug];
  if (!id) return null;
  return `${ESPN_LOGO_BASE}/${id}.png`;
}

/**
 * Check if we have an ESPN ID for a given slug.
 */
export function hasEspnLogo(slug) {
  return slug != null && SLUG_TO_ESPN_ID[slug] != null;
}
