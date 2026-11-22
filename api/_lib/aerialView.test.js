/**
 * Tests for the Google Maps Aerial View client and the per-venue state it
 * keeps. Google is mocked. These lock: how each Google answer becomes a
 * stored state, that a missing video queues a render, that the monthly cap
 * and the per-visitor limit stop billed lookups, and that the API key never
 * appears in anything logged or returned.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  AerialError, lookupVideoMetadata, renderVideo, lookupVideo, isDue, refreshVenueRecord,
  getCoverage, reserveLookup, getFlyover, getAerialKey, getMonthlyCap,
  getLandingCap, flyoverBudget, landingLookupsThisMonth,
  RECHECK_MS, DEFAULT_MONTHLY_CAP, DEFAULT_LANDING_CAP, PER_IP_HOURLY_LIMIT,
} from './aerialView.js';
import { FLYOVER_VENUES, flyoverVenueId } from '../../src/sports/venues/flyoverVenues.js';

const KEY = 'test-key-123';
const VENUE = FLYOVER_VENUES.nfl.BUF;
const NOW = Date.UTC(2026, 10, 22, 12);

const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const notFound = (message = 'Video not found.') => reply(404, { error: { code: 404, message, status: 'NOT_FOUND' } });

/** A fake Google: route by method name in the URL. */
function google(routes) {
  const calls = [];
  const fetchImpl = vi.fn(async (url, init = {}) => {
    const name = /videos:(\w+)/.exec(url)[1];
    calls.push({ name, url, body: init.body ? JSON.parse(init.body) : null });
    const r = routes[name];
    return typeof r === 'function' ? r(url, init) : r;
  });
  return { fetchImpl, calls };
}

function store(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getJson: vi.fn(async (k) => (data.has(k) ? JSON.parse(JSON.stringify(data.get(k))) : null)),
    setJson: vi.fn(async (k, v) => { data.set(k, JSON.parse(JSON.stringify(v))); }),
    tryAcquireLock: vi.fn(async () => true),
    incrWithTtl: vi.fn(async (k) => { const n = (data.get(k) || 0) + 1; data.set(k, n); return n; }),
  };
}

describe('configuration', () => {
  it('reads the key from GOOGLE_AERIAL_API_KEY, then GOOGLE_MAPS_API_KEY', () => {
    expect(getAerialKey({ GOOGLE_AERIAL_API_KEY: 'a', GOOGLE_MAPS_API_KEY: 'b' })).toBe('a');
    expect(getAerialKey({ GOOGLE_MAPS_API_KEY: 'b' })).toBe('b');
    expect(getAerialKey({})).toBe('');
  });

  it('defaults the monthly cap below Google\'s free 5,000 and lets an env var change it', () => {
    expect(DEFAULT_MONTHLY_CAP).toBeLessThan(5000);
    expect(getMonthlyCap({})).toBe(DEFAULT_MONTHLY_CAP);
    expect(getMonthlyCap({ AERIAL_MONTHLY_LOOKUP_CAP: '20000' })).toBe(20000);
    expect(getMonthlyCap({ AERIAL_MONTHLY_LOOKUP_CAP: '0' })).toBe(0);
    expect(getMonthlyCap({ AERIAL_MONTHLY_LOOKUP_CAP: 'lots' })).toBe(DEFAULT_MONTHLY_CAP);
  });
});

describe('Google calls', () => {
  it('looks up metadata by address or by video id', async () => {
    const g = google({ lookupVideoMetadata: reply(200, { videoId: 'vid1', state: 'ACTIVE', duration: '40s' }) });
    expect(await lookupVideoMetadata({ address: VENUE.address }, { ...g, key: KEY })).toEqual({ state: 'ACTIVE', videoId: 'vid1' });
    expect(new URL(g.calls[0].url).searchParams.get('address')).toBe(VENUE.address);
    await lookupVideoMetadata({ videoId: 'vid1' }, { ...g, key: KEY });
    expect(new URL(g.calls[1].url).searchParams.get('videoId')).toBe('vid1');
  });

  it('posts the address to render a video', async () => {
    const g = google({ renderVideo: reply(200, { state: 'PROCESSING', metadata: { videoId: 'vid2' } }) });
    expect(await renderVideo(VENUE.address, { ...g, key: KEY })).toEqual({ state: 'PROCESSING', videoId: 'vid2' });
    expect(g.calls[0].body).toEqual({ address: VENUE.address });
  });

  it('returns the landscape poster and video links from a lookup', async () => {
    const g = google({ lookupVideo: reply(200, {
      state: 'ACTIVE', metadata: { videoId: 'vid1', duration: '40s' },
      uris: {
        IMAGE: { landscapeUri: 'https://img/l', portraitUri: 'https://img/p' },
        MP4_LOW: { landscapeUri: 'https://v/low' }, MP4_MEDIUM: { landscapeUri: 'https://v/med' }, MP4_HIGH: { landscapeUri: 'https://v/high' },
      },
    }) });
    expect(await lookupVideo('vid1', { ...g, key: KEY })).toEqual({
      state: 'ACTIVE', videoId: 'vid1', poster: 'https://img/l', mp4Low: 'https://v/low', mp4Medium: 'https://v/med', mp4High: 'https://v/high', durationSec: 40,
    });
  });

  it('names each failure so callers can act on it', async () => {
    const code = async (res) => lookupVideoMetadata({ address: 'x' }, { ...google({ lookupVideoMetadata: res }), key: KEY }).catch((e) => e.code);
    expect(await code(notFound())).toBe('not_found');
    expect(await code(notFound('Video not found: No 3d imagery.'))).toBe('no_imagery');
    expect(await code(reply(400, { error: { message: 'Address not supported.' } }))).toBe('bad_address');
    expect(await code(reply(403, { error: { message: 'API has not been used in project 1 before or it is disabled.' } }))).toBe('denied');
    expect(await code(reply(429, { error: { message: 'Quota exceeded' } }))).toBe('quota');
    expect(await code(reply(500, null))).toBe('upstream');
  });

  it('reports a network failure as a timeout and refuses to run without a key', async () => {
    const boom = { fetchImpl: vi.fn(async () => { throw new Error(`connect failed https://x?key=${KEY}`); }), key: KEY };
    const err = await lookupVideoMetadata({ address: 'x' }, boom).catch((e) => e);
    expect(err).toBeInstanceOf(AerialError);
    expect(err.code).toBe('timeout');
    const none = await lookupVideoMetadata({ address: 'x' }, { fetchImpl: vi.fn(), key: '' }).catch((e) => e);
    expect(none.code).toBe('denied');
  });

  it('never puts the API key in an error', async () => {
    const g = google({ lookupVideoMetadata: reply(403, { error: { message: `API key ${KEY} is not authorised` } }) });
    const err = await lookupVideoMetadata({ address: 'x' }, { ...g, key: KEY }).catch((e) => e);
    expect(err.message).not.toContain(KEY);
    expect(err.detail).not.toContain(KEY);
    expect(err.detail).toContain('[key]');
  });
});

describe('isDue', () => {
  it('asks again after the wait for each state', () => {
    expect(isDue(null, NOW)).toBe(true);
    expect(isDue({ status: 'processing', checkedAt: NOW - RECHECK_MS.processing + 1000 }, NOW)).toBe(false);
    expect(isDue({ status: 'processing', checkedAt: NOW - RECHECK_MS.processing }, NOW)).toBe(true);
    expect(isDue({ status: 'active', checkedAt: NOW - 24 * 3600 * 1000 }, NOW)).toBe(false);
    expect(isDue({ status: 'none', checkedAt: NOW - RECHECK_MS.none }, NOW)).toBe(true);
    expect(isDue({ status: 'error', checkedAt: NOW - RECHECK_MS.error }, NOW)).toBe(true);
  });
});

describe('refreshVenueRecord', () => {
  const log = vi.fn();

  it('stores the video id when Google already has a video', async () => {
    const g = google({ lookupVideoMetadata: reply(200, { videoId: 'vid1', state: 'ACTIVE' }) });
    expect(await refreshVenueRecord(VENUE, undefined, { ...g, key: KEY, log }, NOW)).toEqual({ status: 'active', videoId: 'vid1', checkedAt: NOW });
    expect(g.calls.map((c) => c.name)).toEqual(['lookupVideoMetadata']);
  });

  it('queues a render when there is no video yet', async () => {
    const g = google({ lookupVideoMetadata: notFound(), renderVideo: reply(200, { state: 'PROCESSING', metadata: { videoId: 'vid9' } }) });
    expect(await refreshVenueRecord(VENUE, undefined, { ...g, key: KEY, log }, NOW))
      .toEqual({ status: 'processing', videoId: 'vid9', requestedAt: NOW, checkedAt: NOW });
    expect(g.calls.map((c) => c.name)).toEqual(['lookupVideoMetadata', 'renderVideo']);
    expect(g.calls[1].body.address).toBe(VENUE.address);
  });

  it('follows a render in progress by its video id and keeps when it was requested', async () => {
    const g = google({ lookupVideoMetadata: reply(200, { videoId: 'vid9', state: 'PROCESSING' }) });
    const before = { status: 'processing', videoId: 'vid9', requestedAt: NOW - 3600000, checkedAt: NOW - 3600000 };
    expect(await refreshVenueRecord(VENUE, before, { ...g, key: KEY, log }, NOW))
      .toEqual({ status: 'processing', videoId: 'vid9', requestedAt: NOW - 3600000, checkedAt: NOW });
    expect(new URL(g.calls[0].url).searchParams.get('videoId')).toBe('vid9');
  });

  it('records a venue with no 3D imagery, whichever call says so', async () => {
    const a = google({ lookupVideoMetadata: notFound('Video not found: No 3d imagery.') });
    expect(await refreshVenueRecord(VENUE, undefined, { ...a, key: KEY, log }, NOW)).toEqual({ status: 'none', reason: 'no_imagery', checkedAt: NOW });
    const b = google({ lookupVideoMetadata: notFound(), renderVideo: notFound('Video not found: No 3d imagery.') });
    expect((await refreshVenueRecord(VENUE, undefined, { ...b, key: KEY, log }, NOW)).reason).toBe('no_imagery');
  });

  it('records an address Google rejects', async () => {
    const g = google({ lookupVideoMetadata: reply(400, { error: { message: 'Address not supported.' } }) });
    expect(await refreshVenueRecord(VENUE, undefined, { ...g, key: KEY, log }, NOW)).toEqual({ status: 'none', reason: 'bad_address', checkedAt: NOW });
  });

  it('records a refusal as an error to retry, and logs why without the key', async () => {
    const seen = vi.fn();
    const g = google({ lookupVideoMetadata: reply(403, { error: { message: `key ${KEY} blocked` } }) });
    const rec = await refreshVenueRecord(VENUE, undefined, { ...g, key: KEY, log: seen }, NOW);
    expect(rec.status).toBe('error');
    expect(rec.reason).toBe('denied');
    expect(seen.mock.calls[0][0]).toContain('Highmark Stadium');
    expect(seen.mock.calls[0][0]).not.toContain(KEY);
  });

  it('keeps a known video through a bad moment at Google, and checks again soon', async () => {
    const g = google({ lookupVideoMetadata: reply(500, null) });
    const before = { status: 'active', videoId: 'vid1', checkedAt: NOW - RECHECK_MS.active };
    const rec = await refreshVenueRecord(VENUE, before, { ...g, key: KEY, log }, NOW);
    expect(rec.status).toBe('active');
    expect(rec.videoId).toBe('vid1');
    expect(isDue(rec, NOW)).toBe(false);
    expect(isDue(rec, NOW + RECHECK_MS.error)).toBe(true);
  });
});

describe('getCoverage', () => {
  const env = { GOOGLE_AERIAL_API_KEY: KEY };

  it('checks unknown venues once per building, saves them, and reports a state per team', async () => {
    const g = google({ lookupVideoMetadata: reply(200, { videoId: 'vid1', state: 'ACTIVE' }) });
    const s = store();
    const { venues } = await getCoverage('nfl', { ...s, ...g, key: KEY, env }, { now: NOW, maxRefresh: 100 });
    expect(Object.keys(venues)).toHaveLength(32);
    expect(venues.NYG).toEqual({ state: 'active', name: 'MetLife Stadium' });
    expect(venues.NYJ.state).toBe('active');
    expect(g.calls).toHaveLength(30); // 32 teams, 30 stadiums
    expect(Object.keys(s.data.get('aerial:v1:venues:nfl'))).toHaveLength(30);
  });

  it('only works through a few venues per call', async () => {
    const g = google({ lookupVideoMetadata: reply(200, { videoId: 'vid1', state: 'ACTIVE' }) });
    const { venues } = await getCoverage('nfl', { ...store(), ...g, key: KEY, env }, { now: NOW, maxRefresh: 5 });
    expect(g.calls).toHaveLength(5);
    expect(Object.values(venues).filter((v) => v.state === 'unknown').length).toBeGreaterThan(20);
  });

  it('does not call Google when nothing is due, or when another request holds the lock', async () => {
    const fresh = {};
    for (const venue of Object.values(FLYOVER_VENUES.nba)) fresh[flyoverVenueId(venue)] = { status: 'active', videoId: 'v', checkedAt: NOW };
    const g = google({});
    const { venues } = await getCoverage('nba', { ...store({ 'aerial:v1:venues:nba': fresh }), ...g, key: KEY, env }, { now: NOW });
    expect(g.calls).toHaveLength(0);
    expect(venues.lal.state).toBe('active');

    const locked = store();
    locked.tryAcquireLock = vi.fn(async () => false);
    await getCoverage('nba', { ...locked, ...g, key: KEY, env }, { now: NOW });
    expect(g.calls).toHaveLength(0);
    expect(locked.setJson).not.toHaveBeenCalled();
  });

  it('passes a reason through and returns nothing for an unknown sport', async () => {
    const id = flyoverVenueId(VENUE);
    const s = store({ 'aerial:v1:venues:nfl': { [id]: { status: 'none', reason: 'no_imagery', checkedAt: NOW } } });
    const { venues } = await getCoverage('nfl', { ...s, ...google({}), key: KEY, env: {} }, { now: NOW });
    expect(venues.BUF).toEqual({ state: 'none', name: 'Highmark Stadium', reason: 'no_imagery' });
    expect((await getCoverage('nhl', store())).venues).toEqual({});
  });
});

describe('reserveLookup', () => {
  it('allows lookups up to the monthly cap, then refuses', async () => {
    const s = store();
    const deps = { ...s, env: { AERIAL_MONTHLY_LOOKUP_CAP: '2' } };
    expect((await reserveLookup({ ip: '1.1.1.1' }, deps, NOW)).ok).toBe(true);
    expect((await reserveLookup({ ip: '2.2.2.2' }, deps, NOW)).ok).toBe(true);
    expect(await reserveLookup({ ip: '3.3.3.3' }, deps, NOW)).toEqual({ ok: false, reason: 'capped' });
    expect(s.data.get('aerial:v1:lookups:2026-11')).toBe(3);
  });

  it('refuses everything when the cap is zero', async () => {
    const s = store();
    expect(await reserveLookup({ ip: '1.1.1.1' }, { ...s, env: { AERIAL_MONTHLY_LOOKUP_CAP: '0' } }, NOW)).toEqual({ ok: false, reason: 'capped' });
    expect(s.incrWithTtl).not.toHaveBeenCalled();
  });

  it('limits one visitor per hour without spending the monthly allowance', async () => {
    const s = store();
    const deps = { ...s, env: {} };
    for (let i = 0; i < PER_IP_HOURLY_LIMIT; i++) expect((await reserveLookup({ ip: '9.9.9.9' }, deps, NOW)).ok).toBe(true);
    expect(await reserveLookup({ ip: '9.9.9.9' }, deps, NOW)).toEqual({ ok: false, reason: 'rate_limited' });
    expect(s.data.get('aerial:v1:lookups:2026-11')).toBe(PER_IP_HOURLY_LIMIT);
    expect((await reserveLookup({ ip: '8.8.8.8' }, deps, NOW)).ok).toBe(true);
  });

  it('allows lookups when there is no counter store', async () => {
    const deps = { incrWithTtl: vi.fn(async () => null), env: {} };
    expect((await reserveLookup({ ip: '1.1.1.1' }, deps, NOW)).ok).toBe(true);
    expect((await reserveLookup({ ip: '1.1.1.1', budget: 'landing' }, deps, NOW)).ok).toBe(true);
  });
});

describe('the logged-out home page\'s share', () => {
  it('defaults to less than half the month and never exceeds the monthly cap', () => {
    expect(DEFAULT_LANDING_CAP).toBeLessThan(DEFAULT_MONTHLY_CAP / 2);
    expect(getLandingCap({})).toBe(DEFAULT_LANDING_CAP);
    expect(getLandingCap({ AERIAL_LANDING_LOOKUP_CAP: '500' })).toBe(500);
    expect(getLandingCap({ AERIAL_LANDING_LOOKUP_CAP: '0' })).toBe(0);
    expect(getLandingCap({ AERIAL_LANDING_LOOKUP_CAP: '9000' })).toBe(DEFAULT_MONTHLY_CAP);
    expect(getLandingCap({ AERIAL_LANDING_LOOKUP_CAP: 'lots' })).toBe(DEFAULT_LANDING_CAP);
  });

  it('only recognises the one budget name', () => {
    expect(flyoverBudget('landing')).toBe('landing');
    expect(flyoverBudget('LANDING')).toBe('landing');
    expect(flyoverBudget('app')).toBeNull();
    expect(flyoverBudget(undefined)).toBeNull();
  });

  it('stops the home page at its share and leaves the rest of the month to the app', async () => {
    const s = store();
    const deps = { ...s, env: { AERIAL_MONTHLY_LOOKUP_CAP: '10', AERIAL_LANDING_LOOKUP_CAP: '2' } };
    expect((await reserveLookup({ budget: 'landing' }, deps, NOW)).ok).toBe(true);
    expect((await reserveLookup({ budget: 'landing' }, deps, NOW)).ok).toBe(true);
    expect(await reserveLookup({ budget: 'landing' }, deps, NOW)).toEqual({ ok: false, reason: 'capped' });
    // The refused lookup did not count against the month, and the app can still look up.
    expect(s.data.get('aerial:v1:lookups:2026-11')).toBe(2);
    expect((await reserveLookup({}, deps, NOW)).ok).toBe(true);
    expect(await landingLookupsThisMonth(s, NOW)).toBe(3);
  });

  it('counts home page lookups against the month as well', async () => {
    const s = store({ 'aerial:v1:lookups:2026-11': 10 });
    const deps = { ...s, env: { AERIAL_MONTHLY_LOOKUP_CAP: '10', AERIAL_LANDING_LOOKUP_CAP: '5' } };
    expect(await reserveLookup({ budget: 'landing' }, deps, NOW)).toEqual({ ok: false, reason: 'capped' });
  });

  it('does not touch the home page counter for a lookup from the app', async () => {
    const s = store();
    await reserveLookup({ ip: '1.1.1.1' }, { ...s, env: {} }, NOW);
    expect(s.data.has('aerial:v1:lookups:2026-11:landing')).toBe(false);
  });
});

describe('getFlyover', () => {
  const id = flyoverVenueId(VENUE);
  const active = { 'aerial:v1:venues:nfl': { [id]: { status: 'active', videoId: 'vid1', checkedAt: NOW } } };
  const links = reply(200, {
    state: 'ACTIVE', metadata: { videoId: 'vid1', duration: '38s' },
    uris: { IMAGE: { landscapeUri: 'https://img/l' }, MP4_LOW: { landscapeUri: 'https://v/low' }, MP4_MEDIUM: { landscapeUri: 'https://v/med' } },
  });

  it('returns fresh links for an active venue and counts the lookup', async () => {
    const s = store(active);
    const g = google({ lookupVideo: links });
    expect(await getFlyover('nfl', 'BUF', { ...s, ...g, key: KEY, env: {} }, { ip: '1.1.1.1', now: NOW })).toEqual({
      state: 'active', name: 'Highmark Stadium', poster: 'https://img/l', mp4Low: 'https://v/low', mp4Medium: 'https://v/med', durationSec: 38,
    });
    expect(s.data.get('aerial:v1:lookups:2026-11')).toBe(1);
  });

  it('does not call Google or spend a lookup for a venue that is not active', async () => {
    const s = store({ 'aerial:v1:venues:nfl': { [id]: { status: 'processing', videoId: 'vid1', checkedAt: NOW } } });
    const g = google({});
    expect(await getFlyover('nfl', 'BUF', { ...s, ...g, key: KEY, env: {} }, { now: NOW })).toEqual({ state: 'processing' });
    expect(await getFlyover('nfl', 'MIA', { ...s, ...g, key: KEY, env: {} }, { now: NOW })).toEqual({ state: 'unknown' });
    expect(await getFlyover('nfl', 'XXX', { ...s, ...g, key: KEY, env: {} }, { now: NOW })).toEqual({ state: 'none', reason: 'unknown_venue' });
    expect(g.calls).toHaveLength(0);
    expect(s.incrWithTtl).not.toHaveBeenCalled();
  });

  it('returns capped without calling Google once the month\'s allowance is spent', async () => {
    const s = store({ ...active, 'aerial:v1:lookups:2026-11': 10 });
    const g = google({ lookupVideo: links });
    expect(await getFlyover('nfl', 'BUF', { ...s, ...g, key: KEY, env: { AERIAL_MONTHLY_LOOKUP_CAP: '10' } }, { now: NOW })).toEqual({ state: 'capped' });
    expect(g.calls).toHaveLength(0);
  });

  it('returns capped to the home page once its share is spent, while the app still gets links', async () => {
    const s = store({ ...active, 'aerial:v1:lookups:2026-11:landing': 3 });
    const g = google({ lookupVideo: links });
    const deps = { ...s, ...g, key: KEY, env: { AERIAL_LANDING_LOOKUP_CAP: '3' } };
    expect(await getFlyover('nfl', 'BUF', deps, { budget: 'landing', now: NOW })).toEqual({ state: 'capped' });
    expect(g.calls).toHaveLength(0);
    expect((await getFlyover('nfl', 'BUF', deps, { now: NOW })).state).toBe('active');
  });

  it('forgets a video Google no longer has', async () => {
    const s = store(active);
    const g = google({ lookupVideo: notFound() });
    expect(await getFlyover('nfl', 'BUF', { ...s, ...g, key: KEY, env: {} }, { now: NOW })).toEqual({ state: 'unknown' });
    expect(s.data.get('aerial:v1:venues:nfl')[id]).toBeUndefined();
  });

  it('reports an error state when Google refuses, and keeps the stored video', async () => {
    const s = store(active);
    const g = google({ lookupVideo: reply(429, { error: { message: 'Quota exceeded' } }) });
    expect(await getFlyover('nfl', 'BUF', { ...s, ...g, key: KEY, env: {}, log: vi.fn() }, { now: NOW })).toEqual({ state: 'error', reason: 'quota' });
    expect(s.data.get('aerial:v1:venues:nfl')[id].videoId).toBe('vid1');
  });
});
