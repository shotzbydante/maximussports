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
  "usc trojans": "USC Trojans",
  "purdue": "Purdue Boilermakers",
  "duke": "Duke Blue Devils",
  "kansas": "Kansas Jayhawks",
  "houston": "Houston Cougars",
  "gonzaga": "Gonzaga Bulldogs",
  "arizona": "Arizona Wildcats",
  "tennessee": "Tennessee Volunteers",
  "kentucky": "Kentucky Wildcats",
  "alabama": "Alabama Crimson Tide",
  "baylor": "Baylor Bears",
  "creighton": "Creighton Bluejays",
  "marquette": "Marquette Golden Eagles",
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
  "kentucky wildcats": "Kentucky Wildcats",
  "tennessee volunteers": "Tennessee Volunteers",
  "alabama crimson tide": "Alabama Crimson Tide",
  "lsu tigers": "LSU Tigers",
  "texas longhorns": "Texas Longhorns",
  "texas": "Texas Longhorns",
  "kansas jayhawks": "Kansas Jayhawks",
  "baylor bears": "Baylor Bears",
  "houston cougars": "Houston Cougars",
  "arizona wildcats": "Arizona Wildcats",
  "gonzaga bulldogs": "Gonzaga Bulldogs",
  "san diego st": "San Diego State Aztecs",
  "boise st": "Boise State Broncos",
  "utah state": "Utah State Aggies",
  "utah state aggies": "Utah State Aggies",
  "new mexico": "New Mexico Lobos",
  "new mexico lobos": "New Mexico Lobos",
  "pitt panthers": "Pittsburgh Panthers",
  "vermont": "Vermont Catamounts",
  "vermont catamounts": "Vermont Catamounts",
  "njit": "NJIT Highlanders",
  "njit highlanders": "NJIT Highlanders",
  "umbc": "UMBC Retrievers",
  "umbc retrievers": "UMBC Retrievers",
  "umass lowell": "UMass Lowell River Hawks",
  "umass lowell river hawks": "UMass Lowell River Hawks",
  "high point": "High Point Panthers",
  "high point panthers": "High Point Panthers",
  "queens": "Queens Royals",
  "queens royals": "Queens Royals",
  "northern iowa": "Northern Iowa Panthers",
  "northern iowa panthers": "Northern Iowa Panthers",
  "st. bonaventure bonnies": "St. Bonaventure Bonnies",
  "st bonaventure": "St. Bonaventure Bonnies",
  "stony brook": "Stony Brook Seawolves",
  "stony brook seawolves": "Stony Brook Seawolves",
  "san francisco": "San Francisco Dons",
  "san francisco dons": "San Francisco Dons",
  "usf dons": "San Francisco Dons",
  "loyola marymount": "Loyola Marymount Lions",
  "loyola marymount lions": "Loyola Marymount Lions",
  "pacific": "Pacific Tigers",
  "pacific tigers": "Pacific Tigers",
  "portland": "Portland Pilots",
  "portland pilots": "Portland Pilots",
  "pepperdine": "Pepperdine Waves",
  "pepperdine waves": "Pepperdine Waves",
  // Extended odds-feed / abbreviation aliases for team identity hardening
  "texas st": "Texas State Bobcats",
  "texas state": "Texas State Bobcats",
  "texas state bobcats": "Texas State Bobcats",
  "texas tech": "Texas Tech Red Raiders",
  "texas tech red raiders": "Texas Tech Red Raiders",
  "kansas st": "Kansas State Wildcats",
  "kansas state": "Kansas State Wildcats",
  "kansas state wildcats": "Kansas State Wildcats",
  "west virginia mountaineers": "West Virginia Mountaineers",
  "wvu": "West Virginia Mountaineers",
  "colorado state": "Colorado State Rams",
  "colorado st": "Colorado State Rams",
  "colorado state rams": "Colorado State Rams",
  "oregon state": "Oregon State Beavers",
  "oregon st": "Oregon State Beavers",
  "oregon state beavers": "Oregon State Beavers",
  "boise st": "Boise State Broncos",
  "boise state broncos": "Boise State Broncos",
  "fresno state": "Fresno State Bulldogs",
  "fresno st": "Fresno State Bulldogs",
  "fresno state bulldogs": "Fresno State Bulldogs",
  "san jose state": "San Jose State Spartans",
  "san jose st": "San Jose State Spartans",
  "san jose state spartans": "San Jose State Spartans",
  "unlv": "UNLV Rebels",
  "unlv rebels": "UNLV Rebels",
  "new mexico state": "New Mexico State Aggies",
  "new mexico st": "New Mexico State Aggies",
  "new mexico state aggies": "New Mexico State Aggies",
  "montana": "Montana Grizzlies",
  "montana grizzlies": "Montana Grizzlies",
  "montana state": "Montana State Bobcats",
  "montana st": "Montana State Bobcats",
  "montana state bobcats": "Montana State Bobcats",
  "weber state": "Weber State Wildcats",
  "weber st": "Weber State Wildcats",
  "idaho state": "Idaho State Bengals",
  "idaho st": "Idaho State Bengals",
  "idaho": "Idaho Vandals",
  "idaho vandals": "Idaho Vandals",
  "northern arizona": "Northern Arizona Lumberjacks",
  "nau": "Northern Arizona Lumberjacks",
  "sacramento state": "Sacramento State Hornets",
  "sacramento st": "Sacramento State Hornets",
  "sac state": "Sacramento State Hornets",
  "eastern washington": "Eastern Washington Eagles",
  "portland state": "Portland State Vikings",
  "portland st": "Portland State Vikings",
  "wyoming": "Wyoming Cowboys",
  "wyoming cowboys": "Wyoming Cowboys",
  "utah state aggies": "Utah State Aggies",
  "florida atlantic": "Florida Atlantic Owls",
  "fau": "Florida Atlantic Owls",
  "florida atlantic owls": "Florida Atlantic Owls",
  "uab": "UAB Blazers",
  "uab blazers": "UAB Blazers",
  "east carolina": "East Carolina Pirates",
  "east carolina pirates": "East Carolina Pirates",
  "ecu": "East Carolina Pirates",
  "temple": "Temple Owls",
  "temple owls": "Temple Owls",
  "siena": "Siena Saints",
  "siena saints": "Siena Saints",
  "merrimack": "Merrimack Warriors",
  "merrimack warriors": "Merrimack Warriors",
  "grambling": "Grambling State Tigers",
  "grambling state": "Grambling State Tigers",
  "grambling st": "Grambling State Tigers",
  "jackson state": "Jackson State Tigers",
  "jackson st": "Jackson State Tigers",
  "jacksonville state": "Jacksonville State Gamecocks",
  "jacksonville st": "Jacksonville State Gamecocks",
  "ut rio grande valley": "UT Rio Grande Valley Vaqueros",
  "utrgv": "UT Rio Grande Valley Vaqueros",
  "alabama a&m": "Alabama A&M Bulldogs",
  "alabama am": "Alabama A&M Bulldogs",
  "alcorn state": "Alcorn State Braves",
  "alcorn st": "Alcorn State Braves",
  "arkansas pine bluff": "Arkansas-Pine Bluff Golden Lions",
  "uapb": "Arkansas-Pine Bluff Golden Lions",
  "bethune-cookman": "Bethune-Cookman Wildcats",
  "bethune cookman": "Bethune-Cookman Wildcats",
  "b-cu": "Bethune-Cookman Wildcats",
  "coppin state": "Coppin State Eagles",
  "coppin st": "Coppin State Eagles",
  "delaware state": "Delaware State Hornets",
  "delaware st": "Delaware State Hornets",
  "florida a&m": "Florida A&M Rattlers",
  "florida am": "Florida A&M Rattlers",
  "famu": "Florida A&M Rattlers",
  "howard": "Howard Bison",
  "howard bison": "Howard Bison",
  "norfolk state": "Norfolk State Spartans",
  "norfolk st": "Norfolk State Spartans",
  "prairie view a&m": "Prairie View A&M Panthers",
  "prairie view am": "Prairie View A&M Panthers",
  "prairie view": "Prairie View A&M Panthers",
  "southern": "Southern University Jaguars",
  "southern university": "Southern University Jaguars",
  "texas southern": "Texas Southern Tigers",
  "texas southern tigers": "Texas Southern Tigers",
  "central arkansas": "Central Arkansas Bears",
  "lamar": "Lamar Cardinals",
  "lamar cardinals": "Lamar Cardinals",
  "mcneese st": "McNeese Cowboys",
  "vcu": "VCU Rams",
  "vcu rams": "VCU Rams",
  "virginia commonwealth": "VCU Rams",
  "santa clara": "Santa Clara Broncos",
  "santa clara broncos": "Santa Clara Broncos",
  "saint marys gaels": "Saint Mary's Gaels",
  "dayton flyers": "Dayton Flyers",
  "san diego state aztecs": "San Diego State Aztecs",
  "boise state broncos": "Boise State Broncos",
  "drake bulldogs": "Drake Bulldogs",
  "creighton bluejays": "Creighton Bluejays",
  "purdue boilermakers": "Purdue Boilermakers",
  "michigan state spartans": "Michigan State Spartans",
  "iowa state cyclones": "Iowa State Cyclones",
  "colorado buffs": "Colorado Buffaloes",
  "cu buffaloes": "Colorado Buffaloes",
  "mississippi valley state": "Mississippi Valley State Delta Devils",
  "mvsu": "Mississippi Valley State Delta Devils",
  // ── 2026 tournament newcomers / name variants ──
  "california baptist": "California Baptist Lancers",
  "cal baptist": "California Baptist Lancers",
  "ca baptist": "California Baptist Lancers",
  "cbu": "California Baptist Lancers",
  "california baptist lancers": "California Baptist Lancers",
  "north dakota state": "North Dakota State Bison",
  "north dakota st": "North Dakota State Bison",
  "ndsu": "North Dakota State Bison",
  "north dakota state bison": "North Dakota State Bison",
  "hawaii": "Hawai'i Rainbow Warriors",
  "hawai'i": "Hawai'i Rainbow Warriors",
  "hawai i": "Hawai'i Rainbow Warriors",
  "hawaii rainbow warriors": "Hawai'i Rainbow Warriors",
  "troy": "Troy Trojans",
  "troy trojans": "Troy Trojans",
  "pennsylvania": "Pennsylvania Quakers",
  "penn": "Pennsylvania Quakers",
  "pennsylvania quakers": "Pennsylvania Quakers",
  "tennessee state": "Tennessee State Tigers",
  "tennessee st": "Tennessee State Tigers",
  "tennessee state tigers": "Tennessee State Tigers",
  "wright state": "Wright State Raiders",
  "wright st": "Wright State Raiders",
  "wright state raiders": "Wright State Raiders",
  "long island": "Long Island University Sharks",
  "long island university": "Long Island University Sharks",
  "liu": "Long Island University Sharks",
  "liu sharks": "Long Island University Sharks",
  "long island university sharks": "Long Island University Sharks",
  "queens university": "Queens Royals",
  "queens university royals": "Queens Royals",
  "kennesaw state": "Kennesaw State Owls",
  "kennesaw st": "Kennesaw State Owls",
  "kennesaw state owls": "Kennesaw State Owls",
  "akron": "Akron Zips",
  "akron zips": "Akron Zips",
  "furman": "Furman Paladins",
  "furman paladins": "Furman Paladins",
  "hofstra": "Hofstra Pride",
  "hofstra pride": "Hofstra Pride",
  "northern iowa": "Northern Iowa Panthers",
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
  // Commonly appearing odds feed teams
  'vermont': 'vermont-catamounts',
  'vermont catamounts': 'vermont-catamounts',
  'njit': 'njit-highlanders',
  'njit highlanders': 'njit-highlanders',
  'umbc': 'umbc-retrievers',
  'umbc retrievers': 'umbc-retrievers',
  'umass lowell': 'umass-lowell-river-hawks',
  'umass lowell river hawks': 'umass-lowell-river-hawks',
  'high point': 'high-point-panthers',
  'high point panthers': 'high-point-panthers',
  'queens': 'queens-royals',
  'queens royals': 'queens-royals',
  'northern iowa': 'northern-iowa-panthers',
  'northern iowa panthers': 'northern-iowa-panthers',
  'st bonaventure': 'st-bonaventure-bonnies',
  "st. bonaventure": 'st-bonaventure-bonnies',
  'stony brook': 'stony-brook-seawolves',
  'san francisco': 'san-francisco-dons',
  'san francisco dons': 'san-francisco-dons',
  'pittsburgh': 'pittsburgh-panthers',
  'pittsburgh panthers': 'pittsburgh-panthers',
  'pitt': 'pittsburgh-panthers',
  'loyola marymount': 'loyola-marymount-lions',
  'pacific': 'pacific-tigers',
  'pepperdine': 'pepperdine-waves',
  'portland': 'portland-pilots',
  // Extended feed-slug entries for long-tail coverage
  'texas tech': 'texas-tech-red-raiders',
  'texas tech red raiders': 'texas-tech-red-raiders',
  'fresno state': 'fresno-state-bulldogs',
  'fresno st': 'fresno-state-bulldogs',
  'san jose state': 'san-jose-state-spartans',
  'san jose st': 'san-jose-state-spartans',
  'unlv': 'unlv-rebels',
  'unlv rebels': 'unlv-rebels',
  'new mexico state': 'new-mexico-state-aggies',
  'new mexico st': 'new-mexico-state-aggies',
  'montana': 'montana-grizzlies',
  'montana state': 'montana-state-bobcats',
  'montana st': 'montana-state-bobcats',
  'weber state': 'weber-state-wildcats',
  'weber st': 'weber-state-wildcats',
  'idaho state': 'idaho-state-bengals',
  'idaho st': 'idaho-state-bengals',
  'idaho': 'idaho-vandals',
  'northern arizona': 'northern-arizona-lumberjacks',
  'sacramento state': 'sacramento-state-hornets',
  'sacramento st': 'sacramento-state-hornets',
  'sac state': 'sacramento-state-hornets',
  'eastern washington': 'eastern-washington-eagles',
  'portland state': 'portland-state-vikings',
  'portland st': 'portland-state-vikings',
  'wyoming': 'wyoming-cowboys',
  'uab': 'uab-blazers',
  'siena': 'siena-saints',
  'merrimack': 'merrimack-warriors',
  'grambling state': 'grambling-state-tigers',
  'grambling st': 'grambling-state-tigers',
  'jackson state': 'jackson-state-tigers',
  'jackson st': 'jackson-state-tigers',
  'jacksonville state': 'jacksonville-state-gamecocks',
  'jacksonville st': 'jacksonville-state-gamecocks',
  'central arkansas': 'central-arkansas-bears',
  'lamar': 'lamar-cardinals',
  'vcu': 'vcu-rams',
  'vcu rams': 'vcu-rams',
  'santa clara': 'santa-clara-broncos',
  'dayton': 'dayton-flyers',
  'wichita state': 'wichita-state-shockers',
  'wichita st': 'wichita-state-shockers',
  'drake': 'drake-bulldogs',
  'belmont': 'belmont-bruins',
  'grand canyon': 'grand-canyon-lopes',
  'mcneese': 'mcneese-cowboys',
  'mcneese st': 'mcneese-cowboys',
  'liberty': 'liberty-flames',
  'south florida': 'south-florida-bulls',
  'usf': 'south-florida-bulls',
  'smu': 'smu-mustangs',
  'tulsa': 'tulsa-golden-hurricane',
  'ole miss': 'ole-miss-rebels',
  'ole miss rebels': 'ole-miss-rebels',
  'mississippi rebels': 'ole-miss-rebels',
  'mississippi state': 'mississippi-state-bulldogs',
  'mississippi st': 'mississippi-state-bulldogs',
  'mississippi state bulldogs': 'mississippi-state-bulldogs',
  'south carolina': 'south-carolina-gamecocks',
  'south carolina gamecocks': 'south-carolina-gamecocks',
  // ── 2026 tournament newcomers ──
  'california baptist': 'california-baptist-lancers',
  'cal baptist': 'california-baptist-lancers',
  'ca baptist': 'california-baptist-lancers',
  'cbu': 'california-baptist-lancers',
  'north dakota state': 'north-dakota-state-bison',
  'north dakota st': 'north-dakota-state-bison',
  'ndsu': 'north-dakota-state-bison',
  'hawaii': 'hawaii-rainbow-warriors',
  "hawai'i": 'hawaii-rainbow-warriors',
  'hawaii rainbow warriors': 'hawaii-rainbow-warriors',
  'troy': 'troy-trojans',
  'troy trojans': 'troy-trojans',
  'pennsylvania': 'pennsylvania-quakers',
  'penn': 'pennsylvania-quakers',
  'penn quakers': 'pennsylvania-quakers',
  'tennessee state': 'tennessee-state-tigers',
  'tennessee st': 'tennessee-state-tigers',
  'wright state': 'wright-state-raiders',
  'wright st': 'wright-state-raiders',
  'long island': 'long-island-university-sharks',
  'long island university': 'long-island-university-sharks',
  'liu': 'long-island-university-sharks',
  'kennesaw state': 'kennesaw-state-owls',
  'kennesaw st': 'kennesaw-state-owls',
  'akron': 'akron-zips',
  'akron zips': 'akron-zips',
  'furman': 'furman-paladins',
  'hofstra': 'hofstra-pride',
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
