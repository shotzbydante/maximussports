/**
 * Tests for the analytics wrapper's pre-load buffer.
 *
 * PostHog is loaded lazily. Regression: everything fired before it finished
 * loading was dropped unless it was one of six "critical" events, so the first
 * pageview of a visit, and with it every one-page visit, never reached PostHog.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const captured = [];
let finishLoading = null;

vi.mock('posthog-js', () => ({
  default: {
    init(_key, options) {
      const instance = {
        capture: (event, props, opts) => captured.push({ event, props, opts }),
        identify: vi.fn(),
        get_distinct_id: () => 'anon',
      };
      finishLoading = () => options.loaded(instance);
    },
  },
}));

async function loadAnalytics({ pathname = '/nfl/teams/bills' } = {}) {
  vi.resetModules();
  vi.stubEnv('VITE_POSTHOG_KEY', 'phc_test');
  const store = new Map();
  vi.stubGlobal('sessionStorage', {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, v),
  });
  vi.stubGlobal('window', {
    innerWidth: 1280,
    innerHeight: 800,
    location: { pathname, search: '', href: `https://maximussports.ai${pathname}` },
  });
  return import('./index.js');
}

beforeEach(() => {
  captured.length = 0;
  finishLoading = null;
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('events fired before PostHog has loaded', () => {
  it('are held, then replayed in order with the time they happened', async () => {
    const analytics = await loadAnalytics();
    analytics.initAnalytics();

    vi.setSystemTime(new Date('2026-11-22T06:00:00Z'));
    analytics.pageview('/nfl/teams/bills');
    analytics.track('team_view', { team_slug: 'bills' });
    expect(captured).toHaveLength(0);

    vi.setSystemTime(new Date('2026-11-22T06:00:04Z'));
    await vi.advanceTimersByTimeAsync(250);   // lazy load kicks off
    finishLoading();

    expect(captured.map((c) => c.event)).toEqual(['$pageview', 'team_view']);
    expect(captured[0].opts.timestamp.toISOString()).toBe('2026-11-22T06:00:00.000Z');
    expect(captured[0].props.$current_url).toBe('https://maximussports.ai/nfl/teams/bills');
  });

  it('are sent straight through once PostHog is ready', async () => {
    const analytics = await loadAnalytics();
    analytics.initAnalytics();
    await vi.advanceTimersByTimeAsync(250);
    finishLoading();
    captured.length = 0;

    analytics.track('filter_change', { page: 'games' });
    expect(captured).toHaveLength(1);
    expect(captured[0].event).toBe('filter_change');
  });

  it('stop being held past the cap, except critical ones', async () => {
    const analytics = await loadAnalytics();
    analytics.initAnalytics();
    for (let i = 0; i < 150; i++) analytics.track('filter_change', { i });
    analytics.track('signup_started', {});

    await vi.advanceTimersByTimeAsync(250);
    finishLoading();

    expect(captured.filter((c) => c.event === 'filter_change')).toHaveLength(100);
    expect(captured.filter((c) => c.event === 'signup_started')).toHaveLength(1);
  });
});

describe('properties attached to every event', () => {
  it('label a pageview with sport, page type and team from its path', async () => {
    const analytics = await loadAnalytics({ pathname: '/nfl/teams/bills' });
    analytics.initAnalytics();
    await vi.advanceTimersByTimeAsync(250);
    finishLoading();
    captured.length = 0;

    analytics.pageview('/nfl/teams/bills');
    expect(captured[0].props).toMatchObject({
      pathname: '/nfl/teams/bills', sport: 'nfl', page_type: 'team', team_slug: 'bills', device: 'desktop',
    });
  });

  it('take the sport from the URL, or from the workspace when the URL has none', async () => {
    const analytics = await loadAnalytics({ pathname: '/settings' });
    analytics.initAnalytics();
    await vi.advanceTimersByTimeAsync(250);
    finishLoading();
    captured.length = 0;

    analytics.track('settings_view', {});
    expect(captured[0].props).not.toHaveProperty('sport');

    analytics.setAnalyticsContext({ sport: 'nfl' });
    analytics.track('settings_view', {});
    expect(captured[1].props.sport).toBe('nfl');
  });

  it('let an explicit sport on the event win', async () => {
    const analytics = await loadAnalytics({ pathname: '/settings' });
    analytics.initAnalytics();
    await vi.advanceTimersByTimeAsync(250);
    finishLoading();
    captured.length = 0;

    analytics.setAnalyticsContext({ sport: 'nfl' });
    analytics.track('team_pin_added', { sport: 'mlb' });
    expect(captured[0].props.sport).toBe('mlb');
  });
});
