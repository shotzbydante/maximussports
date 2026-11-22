/**
 * Google Maps Aerial View: the flyover video for a stadium.
 *
 * What Google allows shapes this file:
 *   - Video ids may be stored. The video files and their links may not, and
 *     the links expire soon after they are issued. So we keep one small
 *     record per venue (its id and state) and ask Google for fresh links
 *     each time a flyover is shown.
 *   - Only a lookup that returns video links is billed. Checking whether a
 *     video exists (metadata) and asking Google to render one are not.
 *   - Addresses must be in the United States. Some have no 3D imagery, and
 *     a first render can take hours.
 *
 * The API key is read from GOOGLE_AERIAL_API_KEY (or GOOGLE_MAPS_API_KEY) and
 * never leaves the server. Nothing here logs or returns a request URL.
 */

import { FLYOVER_VENUES, flyoverVenueId } from '../../src/sports/venues/flyoverVenues.js';

const BASE = 'https://aerialview.googleapis.com/v1/videos';
const TIMEOUT_MS = 7000;

export const INDEX_TTL_SECONDS = 180 * 24 * 3600;
export const RECHECK_MS = Object.freeze({
  processing: 15 * 60 * 1000,        // a render in progress
  error: 10 * 60 * 1000,             // Google refused or timed out
  none: 30 * 24 * 3600 * 1000,       // no 3D imagery: look again monthly
  active: 30 * 24 * 3600 * 1000,     // confirm the video still exists
});

/** Lookups allowed per calendar month. Google's free allowance is 5,000. */
export const DEFAULT_MONTHLY_CAP = 4500;
export const PER_IP_HOURLY_LIMIT = 120;

export function getAerialKey(env = process.env) {
  return env.GOOGLE_AERIAL_API_KEY || env.GOOGLE_MAPS_API_KEY || '';
}

export function getMonthlyCap(env = process.env) {
  const n = Number(env.AERIAL_MONTHLY_LOOKUP_CAP);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : DEFAULT_MONTHLY_CAP;
}

export class AerialError extends Error {
  /** @param {'not_found'|'no_imagery'|'bad_address'|'denied'|'quota'|'upstream'|'timeout'} code */
  constructor(code, detail = '') {
    super(`aerial view: ${code}`);
    this.code = code;
    this.detail = detail;
  }
}

function scrub(text, key) {
  let out = String(text || '').slice(0, 200);
  if (key) out = out.split(key).join('[key]');
  return out;
}

async function call(path, { query = {}, body = null } = {}, { fetchImpl = fetch, key = getAerialKey() } = {}) {
  if (!key) throw new AerialError('denied', 'no API key configured');
  const url = `${BASE}:${path}?${new URLSearchParams({ ...query, key })}`;
  let res;
  try {
    res = await fetchImpl(url, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw new AerialError('timeout', scrub(err?.name || 'fetch failed', key));
  }
  const json = await res.json().catch(() => null);
  if (res.ok) return json || {};

  const message = scrub(json?.error?.message || `HTTP ${res.status}`, key);
  if (res.status === 404) throw new AerialError(/3d imagery/i.test(message) ? 'no_imagery' : 'not_found', message);
  if (res.status === 400) throw new AerialError('bad_address', message);
  if (res.status === 401 || res.status === 403) throw new AerialError('denied', message);
  if (res.status === 429) throw new AerialError('quota', message);
  throw new AerialError('upstream', message);
}

function seconds(duration) {
  const n = parseFloat(String(duration || ''));
  return Number.isFinite(n) ? n : null;
}

/** Does a video exist? Free. @returns {{ state:'ACTIVE'|'PROCESSING', videoId }} */
export async function lookupVideoMetadata({ address, videoId }, deps) {
  const json = await call('lookupVideoMetadata', { query: videoId ? { videoId } : { address } }, deps);
  const meta = json.metadata || json;
  return { state: json.state || meta.state || null, videoId: meta.videoId || videoId || null };
}

/** Ask Google to render a video for an address. Free. */
export async function renderVideo(address, deps) {
  const json = await call('renderVideo', { body: { address } }, deps);
  return { state: json.state || 'PROCESSING', videoId: json.metadata?.videoId || null };
}

/** Fresh, short-lived links for a video. Billed when it returns links. */
export async function lookupVideo(videoId, deps) {
  const json = await call('lookupVideo', { query: { videoId } }, deps);
  const uris = json.uris || {};
  const land = (k) => uris[k]?.landscapeUri || null;
  return {
    state: json.state || null,
    videoId: json.metadata?.videoId || videoId,
    poster: land('IMAGE'),
    mp4Low: land('MP4_LOW'),
    mp4Medium: land('MP4_MEDIUM'),
    mp4High: land('MP4_HIGH'),
    durationSec: seconds(json.metadata?.duration),
  };
}

/** Is it time to ask Google about this venue again? */
export function isDue(record, now = Date.now()) {
  if (!record || !record.status) return true;
  const wait = RECHECK_MS[record.status] ?? RECHECK_MS.error;
  return now - (record.checkedAt || 0) >= wait;
}

/**
 * Bring one venue's record up to date: find its video, or queue a render
 * when Google has none yet.
 *
 * @returns {Promise<{ status:'active'|'processing'|'none'|'error', videoId?, reason?, checkedAt, requestedAt? }>}
 */
export async function refreshVenueRecord(venue, record, deps = {}, now = Date.now()) {
  const fail = (err) => {
    if (err?.code === 'no_imagery') return { status: 'none', reason: 'no_imagery', checkedAt: now };
    if (err?.code === 'bad_address') return { status: 'none', reason: 'bad_address', checkedAt: now };
    const reason = err?.code || 'upstream';
    (deps.log || console.warn)(`[aerialView] ${venue.name}: ${reason} ${err?.detail || ''}`);
    // A video we already know about survives a bad moment at Google.
    if (record?.status === 'active' && record.videoId) return { ...record, checkedAt: now - RECHECK_MS.active + RECHECK_MS.error };
    return { status: 'error', reason, videoId: record?.videoId, requestedAt: record?.requestedAt, checkedAt: now };
  };

  const render = async () => {
    try {
      const r = await renderVideo(venue.address, deps);
      return { status: 'processing', videoId: r.videoId || undefined, requestedAt: now, checkedAt: now };
    } catch (err) {
      return fail(err);
    }
  };

  try {
    const meta = await lookupVideoMetadata(record?.videoId ? { videoId: record.videoId } : { address: venue.address }, deps);
    if (meta.state === 'ACTIVE' && meta.videoId) return { status: 'active', videoId: meta.videoId, checkedAt: now };
    return { status: 'processing', videoId: meta.videoId || record?.videoId, requestedAt: record?.requestedAt || now, checkedAt: now };
  } catch (err) {
    if (err?.code === 'not_found') return render();
    return fail(err);
  }
}

const indexKey = (sport) => `aerial:v1:venues:${sport}`;

/** One stored object per sport: { [venueId]: record }. */
export async function loadIndex(sport, { getJson }) {
  return (await getJson(indexKey(sport))) || {};
}

/**
 * Every venue in a sport with its current state. Looks up venues that are
 * due (a few per call, behind a lock so two requests do not both do it).
 *
 * @returns {Promise<{ venues: Record<string, { state, name, reason? }>, index }>}
 */
export async function getCoverage(sport, deps, { now = Date.now(), maxRefresh = 12, concurrency = 4 } = {}) {
  const table = FLYOVER_VENUES[sport];
  if (!table) return { venues: {}, index: {} };
  const index = await loadIndex(sport, deps);

  const byId = new Map();
  for (const venue of Object.values(table)) byId.set(flyoverVenueId(venue), venue);
  const due = [...byId].filter(([id]) => isDue(index[id], now)).slice(0, maxRefresh);

  if (due.length > 0 && getAerialKey(deps.env) && await deps.tryAcquireLock(`aerial:v1:lock:${sport}`, 45)) {
    for (let i = 0; i < due.length; i += concurrency) {
      const batch = due.slice(i, i + concurrency);
      const results = await Promise.all(batch.map(([id, venue]) => refreshVenueRecord(venue, index[id], deps, now)));
      batch.forEach(([id], k) => { index[id] = results[k]; });
    }
    await deps.setJson(indexKey(sport), index, { exSeconds: INDEX_TTL_SECONDS });
  }

  const venues = {};
  for (const [team, venue] of Object.entries(table)) {
    const rec = index[flyoverVenueId(venue)];
    venues[team] = { state: rec?.status || 'unknown', name: venue.name, ...(rec?.reason ? { reason: rec.reason } : {}) };
  }
  return { venues, index };
}

const monthKey = (now) => `aerial:v1:lookups:${new Date(now).toISOString().slice(0, 7)}`;

/** Lookups used this calendar month (0 when the counter store is unavailable). */
export async function lookupsThisMonth({ getJson }, now = Date.now()) {
  return Number(await getJson(monthKey(now))) || 0;
}

/**
 * Count one billed lookup against the monthly cap and the caller's hourly
 * limit. Refuses when either is spent. With no counter store (local
 * development) lookups are allowed.
 */
export async function reserveLookup({ ip }, deps, now = Date.now()) {
  const cap = getMonthlyCap(deps.env);
  if (cap === 0) return { ok: false, reason: 'capped' };
  if (ip) {
    const hour = Math.floor(now / 3600000);
    const mine = await deps.incrWithTtl(`aerial:v1:ip:${ip}:${hour}`, 3600);
    if (mine != null && mine > PER_IP_HOURLY_LIMIT) return { ok: false, reason: 'rate_limited' };
  }
  const used = await deps.incrWithTtl(monthKey(now), 40 * 24 * 3600);
  if (used != null && used > cap) return { ok: false, reason: 'capped' };
  return { ok: true, used };
}

/**
 * Fresh flyover links for one team's home venue.
 * @returns {Promise<{ state:'active', name, poster, mp4Low, mp4Medium, durationSec }|{ state:string, reason?:string }>}
 */
export async function getFlyover(sport, team, deps, { ip = null, now = Date.now() } = {}) {
  const venue = FLYOVER_VENUES[sport]?.[team];
  if (!venue) return { state: 'none', reason: 'unknown_venue' };
  const index = await loadIndex(sport, deps);
  const id = flyoverVenueId(venue);
  const rec = index[id];
  if (rec?.status !== 'active' || !rec.videoId) return { state: rec?.status || 'unknown', ...(rec?.reason ? { reason: rec.reason } : {}) };

  const budget = await reserveLookup({ ip }, deps, now);
  if (!budget.ok) return { state: budget.reason };

  try {
    const video = await lookupVideo(rec.videoId, deps);
    if (video.state !== 'ACTIVE' || !(video.mp4Low || video.mp4Medium)) return { state: 'processing' };
    return {
      state: 'active', name: venue.name, poster: video.poster,
      mp4Low: video.mp4Low || video.mp4Medium, mp4Medium: video.mp4Medium || video.mp4Low, durationSec: video.durationSec,
    };
  } catch (err) {
    if (err?.code === 'not_found') {
      // The video is gone: forget it so the next coverage check finds or renders a new one.
      delete index[id];
      await deps.setJson(indexKey(sport), index, { exSeconds: INDEX_TTL_SECONDS });
      return { state: 'unknown' };
    }
    (deps.log || console.warn)(`[aerialView] lookup ${venue.name}: ${err?.code || 'error'} ${err?.detail || ''}`);
    return { state: 'error', reason: err?.code || 'upstream' };
  }
}
