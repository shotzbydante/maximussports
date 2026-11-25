import { describe, it, expect } from 'vitest';
import { recordAttribution, getAttribution, attributionEventProps, attributionPersonProps } from './attribution.js';

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}
const IG = { pathname: '/nfl/insights', search: '?utm_source=instagram&utm_medium=social&utm_campaign=picks' };
const T0 = Date.parse('2026-11-25T23:00:00Z');

describe('campaign attribution', () => {
  it('keeps the Instagram tags after the visitor leaves the landing page', () => {
    const storage = memoryStorage();
    recordAttribution(IG, { storage, referrer: 'https://l.instagram.com/', now: T0 });
    // Later: on /settings, back from Google sign-in, no tags in the URL.
    recordAttribution({ pathname: '/settings', search: '?code=abc' }, { storage, now: T0 + 60_000 });
    expect(attributionEventProps({ storage, now: T0 + 60_000 })).toEqual({
      utm_source: 'instagram', utm_medium: 'social', utm_campaign: 'picks',
      first_utm_source: 'instagram', first_utm_medium: 'social', first_utm_campaign: 'picks',
    });
    expect(getAttribution({ storage }).first).toMatchObject({ landing_path: '/nfl/insights', referring_domain: 'l.instagram.com' });
  });

  it('never overwrites the first touch, and the last touch follows the latest tagged visit', () => {
    const storage = memoryStorage();
    recordAttribution(IG, { storage, now: T0 });
    recordAttribution({ pathname: '/ads/picks', search: '?utm_source=meta&utm_campaign=nfl_ads&utm_content=thanksgiving' }, { storage, now: T0 + 1000 });
    const p = attributionEventProps({ storage, now: T0 + 2000 });
    expect(p.first_utm_source).toBe('instagram');
    expect(p.utm_source).toBe('meta');
    expect(p.utm_content).toBe('thanksgiving');
  });

  it('drops the last touch after 30 days but keeps the first', () => {
    const storage = memoryStorage();
    recordAttribution(IG, { storage, now: T0 });
    const later = T0 + 31 * 86_400_000;
    const p = attributionEventProps({ storage, now: later });
    expect(p.utm_source).toBeUndefined();
    expect(p.first_utm_campaign).toBe('picks');
  });

  it('gives the person a set-once first touch and an updating last touch', () => {
    const storage = memoryStorage();
    recordAttribution(IG, { storage, now: T0 });
    const { set, setOnce } = attributionPersonProps({ storage, now: T0 });
    expect(setOnce).toMatchObject({ first_touch_utm_source: 'instagram', first_touch_utm_campaign: 'picks', first_touch_landing_path: '/nfl/insights' });
    expect(set).toMatchObject({ last_touch_utm_source: 'instagram', last_touch_utm_campaign: 'picks' });
  });

  it('does nothing for an untagged visit, and survives storage that throws', () => {
    const storage = memoryStorage();
    recordAttribution({ pathname: '/', search: '' }, { storage, now: T0 });
    expect(attributionEventProps({ storage })).toEqual({});
    const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
    expect(() => recordAttribution(IG, { storage: broken, now: T0 })).not.toThrow();
    expect(attributionEventProps({ storage: broken })).toEqual({});
  });
});
