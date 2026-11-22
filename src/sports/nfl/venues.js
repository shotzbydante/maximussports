/**
 * NFL home venues: where to ask for a weather forecast, whether there is a
 * roof, and the team's body-clock time zone. Keyed by the app's team
 * abbreviation.
 *
 * `tz` is hours behind Eastern time (0 ET, 1 CT, 2 MT, 3 PT).
 * `roof` is 'outdoors', 'dome' (fixed) or 'retractable'.
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

export function getNflVenue(abbrev) {
  return NFL_VENUES[String(abbrev || '').toUpperCase()] || null;
}

/**
 * Is this game played under a roof?
 * A fixed-roof home stadium is always indoors. Otherwise ESPN's `indoor`
 * flag wins when present, then the nflverse roof field, then the home
 * venue; a retractable roof with nothing known is unknown. A neutral-site
 * game is judged on the flags alone, since it is not at the home stadium.
 * @returns {true|false|null}
 */
export function isGameIndoors({ homeAbbrev, espnIndoor = null, nflverseRoof = null, neutralSite = false }) {
  // A fixed roof is a fixed roof. ESPN flags SoFi Stadium as outdoors (the
  // sides are open), but wind and rain do not reach the field.
  if (!neutralSite && getNflVenue(homeAbbrev)?.roof === 'dome') return true;
  if (espnIndoor === true || espnIndoor === false) return espnIndoor;
  const r = String(nflverseRoof || '').toLowerCase();
  if (r === 'dome' || r === 'closed') return true;
  if (r === 'outdoors' || r === 'open') return false;
  if (neutralSite) return null;
  const v = getNflVenue(homeAbbrev);
  if (!v) return null;
  if (v.roof === 'dome') return true;
  if (v.roof === 'outdoors') return false;
  return null;
}
