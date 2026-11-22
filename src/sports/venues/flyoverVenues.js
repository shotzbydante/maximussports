/**
 * Venues that can show a Google Maps aerial flyover in a game module.
 *
 * Google's Aerial View API takes a United States postal address, so every
 * entry carries one. Toronto's teams and games played abroad have no entry
 * and show no flyover. Shared by the browser (which only needs to know
 * whether a game has a venue) and the server route that talks to Google.
 *
 *   NFL keys: the app's team abbreviation (BUF, KC, ...)
 *   MLB and NBA keys: the app's team slug (nyy, lal, ...)
 */

const v = (name, address) => {
  const state = (address.match(/,\s*([A-Z]{2})\s+\d{5}$/) || [])[1] || null;
  return Object.freeze({ name, address, state });
};

const NFL = {
  ARI: v('State Farm Stadium', '1 Cardinals Dr, Glendale, AZ 85305'),
  ATL: v('Mercedes-Benz Stadium', '1 AMB Dr NW, Atlanta, GA 30313'),
  BAL: v('M&T Bank Stadium', '1101 Russell St, Baltimore, MD 21230'),
  BUF: v('Highmark Stadium', '1 Bills Dr, Orchard Park, NY 14127'),
  CAR: v('Bank of America Stadium', '800 S Mint St, Charlotte, NC 28202'),
  CHI: v('Soldier Field', '1410 Special Olympics Dr, Chicago, IL 60605'),
  CIN: v('Paycor Stadium', '1 Paycor Stadium, Cincinnati, OH 45202'),
  CLE: v('Huntington Bank Field', '100 Alfred Lerner Way, Cleveland, OH 44114'),
  DAL: v('AT&T Stadium', '1 AT&T Way, Arlington, TX 76011'),
  DEN: v('Empower Field at Mile High', '1701 Bryant St, Denver, CO 80204'),
  DET: v('Ford Field', '2000 Brush St, Detroit, MI 48226'),
  GB: v('Lambeau Field', '1265 Lombardi Ave, Green Bay, WI 54304'),
  HOU: v('NRG Stadium', '1 NRG Pkwy, Houston, TX 77054'),
  IND: v('Lucas Oil Stadium', '500 S Capitol Ave, Indianapolis, IN 46225'),
  JAX: v('EverBank Stadium', '1 EverBank Stadium Dr, Jacksonville, FL 32202'),
  KC: v('GEHA Field at Arrowhead Stadium', '1 Arrowhead Dr, Kansas City, MO 64129'),
  LV: v('Allegiant Stadium', '3333 Al Davis Way, Las Vegas, NV 89118'),
  LAC: v('SoFi Stadium', '1001 Stadium Dr, Inglewood, CA 90301'),
  LAR: v('SoFi Stadium', '1001 Stadium Dr, Inglewood, CA 90301'),
  MIA: v('Hard Rock Stadium', '347 Don Shula Dr, Miami Gardens, FL 33056'),
  MIN: v('U.S. Bank Stadium', '401 Chicago Ave, Minneapolis, MN 55415'),
  NE: v('Gillette Stadium', '1 Patriot Pl, Foxborough, MA 02035'),
  NO: v('Caesars Superdome', '1500 Sugar Bowl Dr, New Orleans, LA 70112'),
  NYG: v('MetLife Stadium', '1 MetLife Stadium Dr, East Rutherford, NJ 07073'),
  NYJ: v('MetLife Stadium', '1 MetLife Stadium Dr, East Rutherford, NJ 07073'),
  PHI: v('Lincoln Financial Field', '1 Lincoln Financial Field Way, Philadelphia, PA 19148'),
  PIT: v('Acrisure Stadium', '100 Art Rooney Ave, Pittsburgh, PA 15212'),
  SF: v("Levi's Stadium", '4900 Marie P DeBartolo Way, Santa Clara, CA 95054'),
  SEA: v('Lumen Field', '800 Occidental Ave S, Seattle, WA 98134'),
  TB: v('Raymond James Stadium', '4201 N Dale Mabry Hwy, Tampa, FL 33607'),
  TEN: v('Nissan Stadium', '1 Titans Way, Nashville, TN 37213'),
  WSH: v('Northwest Stadium', '1600 Ring Rd, Landover, MD 20785'),
};

const MLB = {
  ari: v('Chase Field', '401 E Jefferson St, Phoenix, AZ 85004'),
  atl: v('Truist Park', '755 Battery Ave SE, Atlanta, GA 30339'),
  bal: v('Oriole Park at Camden Yards', '333 W Camden St, Baltimore, MD 21201'),
  bos: v('Fenway Park', '4 Jersey St, Boston, MA 02215'),
  chc: v('Wrigley Field', '1060 W Addison St, Chicago, IL 60613'),
  cws: v('Rate Field', '333 W 35th St, Chicago, IL 60616'),
  cin: v('Great American Ball Park', '100 Joe Nuxhall Way, Cincinnati, OH 45202'),
  cle: v('Progressive Field', '2401 Ontario St, Cleveland, OH 44115'),
  col: v('Coors Field', '2001 Blake St, Denver, CO 80205'),
  det: v('Comerica Park', '2100 Woodward Ave, Detroit, MI 48201'),
  hou: v('Daikin Park', '501 Crawford St, Houston, TX 77002'),
  kc: v('Kauffman Stadium', '1 Royal Way, Kansas City, MO 64129'),
  laa: v('Angel Stadium', '2000 E Gene Autry Way, Anaheim, CA 92806'),
  lad: v('Dodger Stadium', '1000 Vin Scully Ave, Los Angeles, CA 90012'),
  mia: v('loanDepot park', '501 Marlins Way, Miami, FL 33125'),
  mil: v('American Family Field', '1 Brewers Way, Milwaukee, WI 53214'),
  min: v('Target Field', '1 Twins Way, Minneapolis, MN 55403'),
  nym: v('Citi Field', '41 Seaver Way, Queens, NY 11368'),
  nyy: v('Yankee Stadium', '1 E 161st St, Bronx, NY 10451'),
  oak: v('Sutter Health Park', '400 Ballpark Dr, West Sacramento, CA 95691'),
  phi: v('Citizens Bank Park', '1 Citizens Bank Way, Philadelphia, PA 19148'),
  pit: v('PNC Park', '115 Federal St, Pittsburgh, PA 15212'),
  sd: v('Petco Park', '100 Park Blvd, San Diego, CA 92101'),
  sf: v('Oracle Park', '24 Willie Mays Plaza, San Francisco, CA 94107'),
  sea: v('T-Mobile Park', '1250 1st Ave S, Seattle, WA 98134'),
  stl: v('Busch Stadium', '700 Clark Ave, St. Louis, MO 63102'),
  tb: v('Tropicana Field', '1 Tropicana Dr, St. Petersburg, FL 33705'),
  tex: v('Globe Life Field', '734 Stadium Dr, Arlington, TX 76011'),
  wsh: v('Nationals Park', '1500 S Capitol St SE, Washington, DC 20003'),
};

const NBA = {
  atl: v('State Farm Arena', '1 State Farm Dr, Atlanta, GA 30303'),
  bos: v('TD Garden', '100 Legends Way, Boston, MA 02114'),
  bkn: v('Barclays Center', '620 Atlantic Ave, Brooklyn, NY 11217'),
  cha: v('Spectrum Center', '333 E Trade St, Charlotte, NC 28202'),
  chi: v('United Center', '1901 W Madison St, Chicago, IL 60612'),
  cle: v('Rocket Arena', '1 Center Ct, Cleveland, OH 44115'),
  dal: v('American Airlines Center', '2500 Victory Ave, Dallas, TX 75219'),
  den: v('Ball Arena', '1000 Chopper Cir, Denver, CO 80204'),
  det: v('Little Caesars Arena', '2645 Woodward Ave, Detroit, MI 48201'),
  gsw: v('Chase Center', '1 Warriors Way, San Francisco, CA 94158'),
  hou: v('Toyota Center', '1510 Polk St, Houston, TX 77002'),
  ind: v('Gainbridge Fieldhouse', '125 S Pennsylvania St, Indianapolis, IN 46204'),
  lac: v('Intuit Dome', '3930 W Century Blvd, Inglewood, CA 90303'),
  lal: v('Crypto.com Arena', '1111 S Figueroa St, Los Angeles, CA 90015'),
  mem: v('FedExForum', '191 Beale St, Memphis, TN 38103'),
  mia: v('Kaseya Center', '601 Biscayne Blvd, Miami, FL 33132'),
  mil: v('Fiserv Forum', '1111 Vel R. Phillips Ave, Milwaukee, WI 53203'),
  min: v('Target Center', '600 N 1st Ave, Minneapolis, MN 55403'),
  nop: v('Smoothie King Center', '1501 Dave Dixon Dr, New Orleans, LA 70113'),
  nyk: v('Madison Square Garden', '4 Pennsylvania Plaza, New York, NY 10001'),
  okc: v('Paycom Center', '100 W Reno Ave, Oklahoma City, OK 73102'),
  orl: v('Kia Center', '400 W Church St, Orlando, FL 32801'),
  phi: v('Xfinity Mobile Arena', '3601 S Broad St, Philadelphia, PA 19148'),
  phx: v('Mortgage Matchup Center', '201 E Jefferson St, Phoenix, AZ 85004'),
  por: v('Moda Center', '1 N Center Ct St, Portland, OR 97227'),
  sac: v('Golden 1 Center', '500 David J Stern Walk, Sacramento, CA 95814'),
  sas: v('Frost Bank Center', '1 Frost Bank Center Dr, San Antonio, TX 78219'),
  uta: v('Delta Center', '301 S Temple, Salt Lake City, UT 84101'),
  was: v('Capital One Arena', '601 F St NW, Washington, DC 20004'),
};

export const FLYOVER_VENUES = Object.freeze({ nfl: Object.freeze(NFL), mlb: Object.freeze(MLB), nba: Object.freeze(NBA) });
export const FLYOVER_SPORTS = Object.freeze(Object.keys(FLYOVER_VENUES));

/** The table key for a team: upper case for NFL abbreviations, lower case for MLB and NBA slugs. */
export function flyoverTeamKey(sport, team) {
  const t = String(team || '').trim();
  return sport === 'nfl' ? t.toUpperCase() : t.toLowerCase();
}

/** @returns {{ name, address, state }|null} */
export function getFlyoverVenue(sport, team) {
  return FLYOVER_VENUES[sport]?.[flyoverTeamKey(sport, team)] || null;
}

/** One id per building, so teams that share a stadium share one stored video. */
export function flyoverVenueId(venue) {
  return String(venue?.address || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

const US_STATES = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA', colorado: 'CO', connecticut: 'CT',
  delaware: 'DE', 'district of columbia': 'DC', florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID', illinois: 'IL',
  indiana: 'IN', iowa: 'IA', kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD',
  massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS', missouri: 'MO', montana: 'MT',
  nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA',
  'rhode island': 'RI', 'south carolina': 'SC', 'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT',
  vermont: 'VT', virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY',
};
const STATE_CODES = new Set(Object.values(US_STATES));

/** 'NY', 'ny' or 'New York' → 'NY'. Anything that is not a US state → null. */
export function usStateCode(value) {
  const s = String(value || '').trim();
  if (!s) return null;
  if (STATE_CODES.has(s.toUpperCase())) return s.toUpperCase();
  return US_STATES[s.toLowerCase()] || null;
}

/**
 * The venue whose flyover belongs on a game module, or null.
 *
 * A flyover of the home stadium is wrong for a game played somewhere else,
 * so a game is skipped when the feed flags a neutral site, or names a venue
 * outside the home stadium's state (the international series, a relocated
 * game). A feed with no venue at all is taken to be a home game.
 *
 * @param {'nfl'|'mlb'|'nba'} sport
 * @param {object} game  a normalized game: teams.home.{abbrev,slug}, venue.{city,state,neutralSite}
 * @returns {{ sport, team, name, state }|null}
 */
export function flyoverVenueForGame(sport, game) {
  const home = game?.teams?.home;
  const team = sport === 'nfl' ? home?.abbrev : home?.slug;
  const venue = getFlyoverVenue(sport, team);
  if (!venue) return null;

  const feed = game?.venue;
  if (feed?.neutralSite) return null;
  if (feed && (feed.state || feed.city)) {
    if (usStateCode(feed.state) !== venue.state) return null;
  }
  return { sport, team: flyoverTeamKey(sport, team), name: venue.name, state: venue.state };
}
