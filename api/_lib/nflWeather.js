/**
 * Kickoff weather for outdoor NFL games.
 *
 * Providers, in order:
 *   1. Google Maps Platform Weather API (weather.googleapis.com), when
 *      GOOGLE_WEATHER_API_KEY or GOOGLE_MAPS_API_KEY is set. Hourly
 *      forecast out to ten days, worldwide, so it also covers the
 *      international games.
 *   2. National Weather Service (api.weather.gov). Free, no key, United
 *      States only, hourly forecast out to about seven days.
 *
 * A forecast is the average temperature and the peak sustained wind over
 * the three and a half hours from kickoff. It is cached for an hour per
 * venue and kickoff; forecasts change slowly and a game is only priced on
 * wind inside 48 hours anyway.
 */

import { createCache, coalesce } from '../_cache.js';
import { getJson, setJson } from '../_globalCache.js';
import { resolveGameVenue, isGameIndoors } from '../../src/sports/nfl/venues.js';

const FETCH_TIMEOUT_MS = 8000;
const GAME_HOURS = 4;
const MAX_HOURS_OUT = 168;
const cache = createCache(60 * 60 * 1000);
const KV_TTL_SEC = 3600;
const NWS_UA = 'MaximusSports/1.0 (maximussports.ai; support@maximussports.ai)';

let status = { provider: null, ok: null, at: null, error: null };
export function getWeatherStatus() { return status; }
export function weatherProvider() {
  return (process.env.GOOGLE_WEATHER_API_KEY || process.env.GOOGLE_MAPS_API_KEY) ? 'google' : 'nws';
}

const cToF = (c) => (c * 9) / 5 + 32;
const kmhToMph = (k) => k * 0.621371;
function isNum(v) { return typeof v === 'number' && Number.isFinite(v); }

/** Collapse hourly rows that overlap the game into one summary. Exported for tests. */
export function summarizeHours(hours, kickoffMs, now = Date.now()) {
  const end = kickoffMs + GAME_HOURS * 3_600_000;
  const inGame = hours.filter((h) => h.startMs < end && h.startMs + 3_600_000 > kickoffMs);
  if (inGame.length === 0) return null;
  const temps = inGame.map((h) => h.tempF).filter(isNum);
  const winds = inGame.map((h) => h.windMph).filter(isNum);
  const gusts = inGame.map((h) => h.gustMph).filter(isNum);
  const precip = inGame.map((h) => h.precipPct).filter(isNum);
  if (temps.length === 0 && winds.length === 0) return null;
  const r1 = (v) => Math.round(v * 10) / 10;
  return {
    tempF: temps.length ? r1(temps.reduce((a, b) => a + b, 0) / temps.length) : null,
    windMph: winds.length ? r1(Math.max(...winds)) : null,
    gustMph: gusts.length ? r1(Math.max(...gusts)) : null,
    precipPct: precip.length ? Math.round(Math.max(...precip)) : null,
    hoursOut: r1(Math.max(0, (kickoffMs - now) / 3_600_000)),
    hoursCovered: inGame.length,
  };
}

/** Google Weather API hourly rows → common shape. Exported for tests. */
export function parseGoogleHours(json) {
  return (json?.forecastHours || []).map((h) => {
    const t = h?.temperature, w = h?.wind?.speed, g = h?.wind?.gust;
    const temp = isNum(t?.degrees) ? (t.unit === 'FAHRENHEIT' ? t.degrees : cToF(t.degrees)) : null;
    const speed = (x) => (isNum(x?.value) ? (x.unit === 'MILES_PER_HOUR' ? x.value : kmhToMph(x.value)) : null);
    return {
      startMs: Date.parse(h?.interval?.startTime || ''),
      tempF: temp, windMph: speed(w), gustMph: speed(g),
      precipPct: isNum(h?.precipitation?.probability?.percent) ? h.precipitation.probability.percent : null,
    };
  }).filter((h) => Number.isFinite(h.startMs));
}

/** NWS hourly periods → common shape. Exported for tests. */
export function parseNwsPeriods(json) {
  return (json?.properties?.periods || []).map((p) => {
    const nums = String(p?.windSpeed || '').match(/\d+(\.\d+)?/g) || [];
    const wind = nums.length ? Math.max(...nums.map(Number)) : null;
    const gustNums = String(p?.windGust || '').match(/\d+(\.\d+)?/g) || [];
    const temp = isNum(p?.temperature) ? (p.temperatureUnit === 'C' ? cToF(p.temperature) : p.temperature) : null;
    return {
      startMs: Date.parse(p?.startTime || ''),
      tempF: temp, windMph: wind, gustMph: gustNums.length ? Math.max(...gustNums.map(Number)) : null,
      precipPct: isNum(p?.probabilityOfPrecipitation?.value) ? p.probabilityOfPrecipitation.value : null,
    };
  }).filter((h) => Number.isFinite(h.startMs));
}

async function getJsonUrl(url, headers = {}) {
  const r = await fetch(url, { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!r.ok) throw new Error(`${new URL(url).hostname} ${r.status}`);
  return r.json();
}

async function googleHours({ lat, lon, hoursNeeded }) {
  const key = process.env.GOOGLE_WEATHER_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
  const base = 'https://weather.googleapis.com/v1/forecast/hours:lookup';
  const out = [];
  let pageToken = null;
  for (let page = 0; page < 10 && out.length < hoursNeeded; page++) {
    const q = new URLSearchParams({
      key, 'location.latitude': String(lat), 'location.longitude': String(lon),
      hours: String(hoursNeeded), pageSize: '24',
    });
    if (pageToken) q.set('pageToken', pageToken);
    const json = await getJsonUrl(`${base}?${q}`);
    out.push(...parseGoogleHours(json));
    pageToken = json?.nextPageToken || null;
    if (!pageToken) break;
  }
  return out;
}

async function nwsHours({ lat, lon }) {
  const headers = { 'User-Agent': NWS_UA, Accept: 'application/geo+json' };
  const gridKey = `nfl:weather:nwsgrid:${lat},${lon}`;
  let hourlyUrl = (await getJson(gridKey).catch(() => null))?.url || null;
  if (!hourlyUrl) {
    const point = await getJsonUrl(`https://api.weather.gov/points/${lat},${lon}`, headers);
    hourlyUrl = point?.properties?.forecastHourly || null;
    if (!hourlyUrl) throw new Error('api.weather.gov: no hourly forecast for this point');
    setJson(gridKey, { url: hourlyUrl }, { exSeconds: 30 * 24 * 3600 }).catch(() => {});
  }
  return parseNwsPeriods(await getJsonUrl(hourlyUrl, headers));
}

/**
 * @returns {Promise<object|null>} { tempF, windMph, gustMph, precipPct, hoursOut, source } or null
 */
export async function getKickoffWeather({ lat, lon, kickoffIso, now = Date.now() }) {
  const kickoffMs = Date.parse(kickoffIso || '');
  if (!Number.isFinite(kickoffMs) || !isNum(lat) || !isNum(lon)) return null;
  const hoursOut = (kickoffMs - now) / 3_600_000;
  if (hoursOut < -GAME_HOURS || hoursOut > MAX_HOURS_OUT) return null;

  const key = `nfl:weather:v1:${lat},${lon}:${Math.floor(kickoffMs / 3_600_000)}`;
  const hit = cache.get(key);
  if (hit !== null) return hit || null;

  return coalesce(key, async () => {
    const shared = await getJson(key).catch(() => null);
    if (shared?.at && now - shared.at < KV_TTL_SEC * 1000) { cache.set(key, shared.value || false); return shared.value || null; }

    const hoursNeeded = Math.min(240, Math.ceil(Math.max(0, hoursOut)) + GAME_HOURS + 1);
    const providers = weatherProvider() === 'google'
      ? [['google', () => googleHours({ lat, lon, hoursNeeded })], ['nws', () => nwsHours({ lat, lon })]]
      : [['nws', () => nwsHours({ lat, lon })]];
    for (const [name, load] of providers) {
      try {
        const summary = summarizeHours(await load(), kickoffMs, now);
        if (!summary) throw new Error('no forecast hours cover kickoff');
        const value = { ...summary, source: name };
        status = { provider: name, ok: true, at: new Date().toISOString(), error: null };
        cache.set(key, value);
        setJson(key, { at: now, value }, { exSeconds: KV_TTL_SEC }).catch(() => {});
        return value;
      } catch (err) {
        status = { provider: name, ok: false, at: new Date().toISOString(), error: err?.message };
        console.warn(`[nflWeather] ${name} failed:`, err?.message);
      }
    }
    cache.set(key, false);
    return null;
  });
}

/**
 * Forecasts for every upcoming game played outdoors, wherever it is
 * played: the home stadium, or the neutral site (Mexico City, London,
 * Munich...) when the venue is on file. The National Weather Service only
 * answers for the United States, so international games need the Google
 * provider.
 * @returns {Promise<Record<string, object>>} keyed by gameId
 */
export async function getWeatherForGames(games = [], { schedule = {}, now = Date.now() } = {}) {
  const jobs = [];
  for (const g of games) {
    const s = (g?.status || '').toLowerCase();
    if (!g || s === 'final' || s === 'live' || g.gameState?.isFinal || g.gameState?.isLive) continue;
    const sched = schedule[String(g.gameId)] || null;
    const neutralSite = !!(g.venue?.neutralSite || sched?.neutral);
    const homeAbbrev = g.teams?.home?.abbrev;
    const venue = resolveGameVenue({
      homeAbbrev, neutralSite, venueName: g.venue?.name || null,
      stadiumName: sched?.stadium || null, stadiumId: sched?.stadiumId || null,
    });
    if (!venue) continue;                // a neutral site with no coordinates on file
    const indoor = isGameIndoors({ homeAbbrev, espnIndoor: g.venue?.indoor ?? null, nflverseRoof: sched?.roof ?? null, neutralSite, venue });
    if (indoor !== false) continue;
    jobs.push(getKickoffWeather({ lat: venue.lat, lon: venue.lon, kickoffIso: g.startTime, now })
      .then((w) => [String(g.gameId), w]).catch(() => [String(g.gameId), null]));
  }
  const out = {};
  for (const [id, w] of await Promise.all(jobs)) if (w) out[id] = w;
  return out;
}
