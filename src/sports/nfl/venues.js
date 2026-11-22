/**
 * NFL home venues: where to ask for a weather forecast, whether there is a
 * roof, and the team's body-clock time zone. Keyed by the app's team
 * abbreviation.
 *
 * `tz` is hours behind Eastern time (0 ET, 1 CT, 2 MT, 3 PT).
 * `roof` is 'outdoors', 'dome' (fixed) or 'retractable'.
 *
 * `NFL_NEUTRAL_VENUES` covers games not played at the home team's stadium:
 * the international series (London, Germany, Madrid, Dublin, Paris, Mexico
 * City, Brazil, Melbourne) and a few other neutral sites. Roof status here
 * is ours: the schedule file's roof field is wrong for several of these
 * (it lists the Melbourne Cricket Ground, Stade de France and the Allianz
 * Arena as domes; all three are open to the weather).
 */

export const NFL_VENUES = Object.freeze({
  BUF: { stadium: 'Highmark Stadium', lat: 42.774, lon: -78.787, tz: 0, roof: 'outdoors' },
  MIA: { stadium: 'Hard Rock Stadium', lat: 25.958, lon: -80.239, tz: 0, roof: 'outdoors' },
  NE: { stadium: 'Gillette Stadium', lat: 42.091, lon: -71.264, tz: 0, roof: 'outdoors' },
  NYJ: { stadium: 'MetLife Stadium', lat: 40.813, lon: -74.074, tz: 0, roof: 'outdoors' },
  NYG: { stadium: 'MetLife Stadium', lat: 40.813, lon: -74.074, tz: 0, roof: 'outdoors' },
  BAL: { stadium: 'M&T Bank Stadium', lat: 39.278, lon: -76.623, tz: 0, roof: 'outdoors' },
  CIN: { stadium: 'Paycor Stadium', lat: 39.095, lon: -84.516, tz: 0, roof: 'outdoors' },
  CLE: { stadium: 'Huntington Bank Field', lat: 41.506, lon: -81.699, tz: 0, roof: 'outdoors' },
  PIT: { stadium: 'Acrisure Stadium', lat: 40.447, lon: -80.016, tz: 0, roof: 'outdoors' },
  HOU: { stadium: 'NRG Stadium', lat: 29.685, lon: -95.411, tz: 1, roof: 'retractable' },
  IND: { stadium: 'Lucas Oil Stadium', lat: 39.760, lon: -86.164, tz: 0, roof: 'retractable' },
  JAX: { stadium: 'EverBank Stadium', lat: 30.324, lon: -81.637, tz: 0, roof: 'outdoors' },
  TEN: { stadium: 'Nissan Stadium', lat: 36.166, lon: -86.771, tz: 1, roof: 'outdoors' },
  DEN: { stadium: 'Empower Field at Mile High', lat: 39.744, lon: -105.020, tz: 2, roof: 'outdoors' },
  KC: { stadium: 'GEHA Field at Arrowhead Stadium', lat: 39.049, lon: -94.484, tz: 1, roof: 'outdoors' },
  LV: { stadium: 'Allegiant Stadium', lat: 36.091, lon: -115.184, tz: 3, roof: 'dome' },
  LAC: { stadium: 'SoFi Stadium', lat: 33.953, lon: -118.339, tz: 3, roof: 'dome' },
  LAR: { stadium: 'SoFi Stadium', lat: 33.953, lon: -118.339, tz: 3, roof: 'dome' },
  DAL: { stadium: 'AT&T Stadium', lat: 32.748, lon: -97.093, tz: 1, roof: 'retractable' },
  PHI: { stadium: 'Lincoln Financial Field', lat: 39.901, lon: -75.168, tz: 0, roof: 'outdoors' },
  WSH: { stadium: 'Northwest Stadium', lat: 38.908, lon: -76.864, tz: 0, roof: 'outdoors' },
  CHI: { stadium: 'Soldier Field', lat: 41.862, lon: -87.617, tz: 1, roof: 'outdoors' },
  DET: { stadium: 'Ford Field', lat: 42.340, lon: -83.046, tz: 0, roof: 'dome' },
  GB: { stadium: 'Lambeau Field', lat: 44.501, lon: -88.062, tz: 1, roof: 'outdoors' },
  MIN: { stadium: 'U.S. Bank Stadium', lat: 44.974, lon: -93.258, tz: 1, roof: 'dome' },
  ATL: { stadium: 'Mercedes-Benz Stadium', lat: 33.755, lon: -84.401, tz: 0, roof: 'retractable' },
  CAR: { stadium: 'Bank of America Stadium', lat: 35.226, lon: -80.853, tz: 0, roof: 'outdoors' },
  NO: { stadium: 'Caesars Superdome', lat: 29.951, lon: -90.081, tz: 1, roof: 'dome' },
  TB: { stadium: 'Raymond James Stadium', lat: 27.976, lon: -82.503, tz: 0, roof: 'outdoors' },
  ARI: { stadium: 'State Farm Stadium', lat: 33.528, lon: -112.263, tz: 2, roof: 'retractable' },
  SF: { stadium: "Levi's Stadium", lat: 37.403, lon: -121.970, tz: 3, roof: 'outdoors' },
  SEA: { stadium: 'Lumen Field', lat: 47.595, lon: -122.332, tz: 3, roof: 'outdoors' },
});

/**
 * Neutral and international venues. `ids` are nflverse stadium ids; `names`
 * are every name the venue goes by in ESPN or nflverse data.
 */
export const NFL_NEUTRAL_VENUES = Object.freeze([
  { stadium: 'Estadio Banorte', city: 'Mexico City', country: 'Mexico', lat: 19.3029, lon: -99.1505, roof: 'outdoors', ids: ['MEX00'], names: ['Estadio Banorte', 'Estadio Azteca', 'Azteca Stadium'] },
  { stadium: 'Tottenham Hotspur Stadium', city: 'London', country: 'England', lat: 51.6043, lon: -0.0665, roof: 'outdoors', ids: ['LON02'], names: ['Tottenham Hotspur Stadium', 'Tottenham Stadium'] },
  { stadium: 'Wembley Stadium', city: 'London', country: 'England', lat: 51.556, lon: -0.2796, roof: 'outdoors', ids: ['LON00'], names: ['Wembley Stadium', 'Wembley'] },
  { stadium: 'Twickenham Stadium', city: 'London', country: 'England', lat: 51.456, lon: -0.3415, roof: 'outdoors', ids: ['LON01'], names: ['Twickenham Stadium', 'Allianz Stadium Twickenham'] },
  { stadium: 'Allianz Arena', city: 'Munich', country: 'Germany', lat: 48.2188, lon: 11.6247, roof: 'outdoors', ids: ['GER00', 'MUN01'], names: ['Allianz Arena', 'FC Bayern Munich Stadium', 'Munich Football Arena'] },
  { stadium: 'Deutsche Bank Park', city: 'Frankfurt', country: 'Germany', lat: 50.0686, lon: 8.6455, roof: 'retractable', ids: ['FRA00'], names: ['Deutsche Bank Park', 'Frankfurt Stadium', 'Waldstadion', 'Frankfurt Arena'] },
  { stadium: 'Olympiastadion', city: 'Berlin', country: 'Germany', lat: 52.5147, lon: 13.2395, roof: 'outdoors', ids: ['BER00'], names: ['Olympiastadion', 'Olympiastadion Berlin', 'Olympic Stadium Berlin'] },
  { stadium: 'Santiago Bernabéu', city: 'Madrid', country: 'Spain', lat: 40.4531, lon: -3.6883, roof: 'retractable', ids: ['MAD01', 'MAD00'], names: ['Santiago Bernabeu', 'Estadio Santiago Bernabeu', 'Bernabeu', 'Bernabeu Stadium'] },
  { stadium: 'Croke Park', city: 'Dublin', country: 'Ireland', lat: 53.3607, lon: -6.2511, roof: 'outdoors', ids: ['DUB00'], names: ['Croke Park'] },
  { stadium: 'Stade de France', city: 'Paris', country: 'France', lat: 48.9245, lon: 2.3602, roof: 'outdoors', ids: ['PAR00'], names: ['Stade de France'] },
  { stadium: 'Neo Química Arena', city: 'São Paulo', country: 'Brazil', lat: -23.5453, lon: -46.4742, roof: 'outdoors', ids: ['SAO00'], names: ['Neo Quimica Arena', 'Arena Corinthians', 'Corinthians Arena'] },
  { stadium: 'Maracanã', city: 'Rio de Janeiro', country: 'Brazil', lat: -22.9121, lon: -43.2302, roof: 'outdoors', ids: ['RIO00'], names: ['Maracana', 'Maracana Stadium', 'Estadio do Maracana'] },
  { stadium: 'Melbourne Cricket Ground', city: 'Melbourne', country: 'Australia', lat: -37.82, lon: 144.9834, roof: 'outdoors', ids: ['MEL00'], names: ['Melbourne Cricket Ground', 'MCG'] },
  { stadium: 'Rogers Centre', city: 'Toronto', country: 'Canada', lat: 43.6414, lon: -79.3894, roof: 'retractable', ids: ['TOR00'], names: ['Rogers Centre'] },
  { stadium: 'Tom Benson Hall of Fame Stadium', city: 'Canton', country: 'USA', lat: 40.8198, lon: -81.3984, roof: 'outdoors', ids: ['CAN00'], names: ['Tom Benson Hall of Fame Stadium', 'Hall of Fame Stadium'] },
]);

/** Earlier names for current NFL stadiums, so a neutral game played at one (a Super Bowl) still resolves. */
const NFL_STADIUM_ALIASES = Object.freeze({
  NO: ['Mercedes-Benz Superdome', 'Superdome'],
  JAX: ['TIAA Bank Field', 'TIAA Bank Stadium'],
  CLE: ['FirstEnergy Stadium', 'Cleveland Browns Stadium'],
  PIT: ['Heinz Field'],
  WSH: ['FedExField', 'Commanders Field'],
  KC: ['Arrowhead Stadium'],
  DEN: ['Empower Field', 'Mile High'],
  CIN: ['Paul Brown Stadium'],
});

export function getNflVenue(abbrev) {
  return NFL_VENUES[String(abbrev || '').toUpperCase()] || null;
}

/** Lowercase, unaccented, letters and digits only. */
export function venueKey(name) {
  return String(name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

const NEUTRAL_BY_ID = new Map();
const VENUE_BY_NAME = new Map();
for (const v of NFL_NEUTRAL_VENUES) {
  for (const id of v.ids) NEUTRAL_BY_ID.set(id, v);
  for (const n of [v.stadium, ...v.names]) VENUE_BY_NAME.set(venueKey(n), v);
}
for (const [abbrev, v] of Object.entries(NFL_VENUES)) {
  for (const n of [v.stadium, ...(NFL_STADIUM_ALIASES[abbrev] || [])]) {
    if (!VENUE_BY_NAME.has(venueKey(n))) VENUE_BY_NAME.set(venueKey(n), v);
  }
}

function findByName(name) {
  const k = venueKey(name);
  if (k.length < 5) return null;
  if (VENUE_BY_NAME.has(k)) return VENUE_BY_NAME.get(k);
  for (const [key, v] of VENUE_BY_NAME) {
    if (key.length >= 8 && (k.includes(key) || (k.length >= 8 && key.includes(k)))) return v;
  }
  return null;
}

/**
 * Where a game is actually played.
 *
 * A home game resolves to the home team's stadium, unless ESPN names a
 * different stadium on file. A neutral-site game is looked up by the venue
 * name ESPN gives, then the schedule file's stadium id and name. Returns null when a neutral site is not on file, so the
 * caller knows it has no coordinates instead of using the wrong city's.
 *
 * @returns {{ stadium, city?, country?, lat, lon, roof, neutral:boolean }|null}
 */
export function resolveGameVenue({ homeAbbrev, venueName = null, stadiumName = null, stadiumId = null, neutralSite = false }) {
  if (!neutralSite) {
    const home = getNflVenue(homeAbbrev);
    // A home game moved to another stadium on file (a snowed-out game played
    // in a dome) is played there, whatever the schedule calls it.
    const named = findByName(venueName);
    if (named && home && named.stadium !== home.stadium) {
      return { stadium: named.stadium, city: named.city || null, country: named.country || null, lat: named.lat, lon: named.lon, roof: named.roof, neutral: true };
    }
    return home ? { ...home, neutral: false } : null;
  }
  const hit = findByName(venueName) || NEUTRAL_BY_ID.get(String(stadiumId || '').toUpperCase()) || findByName(stadiumName);
  return hit ? { stadium: hit.stadium, city: hit.city || null, country: hit.country || null, lat: hit.lat, lon: hit.lon, roof: hit.roof, neutral: true } : null;
}

/**
 * Is this game played under a roof?
 *
 * The venue on file decides when its roof is fixed either way: a dome is
 * indoors and an open stadium is outdoors, whatever a feed says (ESPN
 * flags SoFi Stadium as outdoors; the schedule file calls the Melbourne
 * Cricket Ground a dome). A retractable roof goes by ESPN's per-game flag,
 * then the schedule file. With no venue on file the feeds are all there is.
 *
 * @returns {true|false|null} null means unknown
 */
export function isGameIndoors({ homeAbbrev, espnIndoor = null, nflverseRoof = null, neutralSite = false, venue = undefined, venueName = null, stadiumName = null, stadiumId = null }) {
  const v = venue === undefined ? resolveGameVenue({ homeAbbrev, neutralSite, venueName, stadiumName, stadiumId }) : venue;
  if (v?.roof === 'dome') return true;
  if (v?.roof === 'outdoors') return false;
  if (espnIndoor === true || espnIndoor === false) return espnIndoor;
  const r = String(nflverseRoof || '').toLowerCase();
  if (r === 'dome' || r === 'closed') return true;
  if (r === 'outdoors' || r === 'open') return false;
  return null;
}
