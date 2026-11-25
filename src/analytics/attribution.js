/**
 * Where a visitor came from, kept for the whole visit and beyond.
 *
 * The campaign tags (utm_*) are only in the URL of the page someone lands on,
 * for example the one maximussports.ai/ig/picks redirects to. As soon as they
 * click anything, or leave for Google sign-in and come back, the tags are gone
 * from the URL. Before this module, signup and onboarding events read the tags
 * from the current URL, so almost none of them carried a source, and PostHog's
 * own "initial UTM" person properties were never set because the app sends
 * its own pageviews.
 *
 * So the tags are read once, on landing, and stored:
 *   first touch  the first tagged visit on this device, never overwritten
 *   last touch   the most recent tagged visit, kept for 30 days
 *
 * Every event then carries the last touch as utm_* (last-click attribution,
 * what "utm_campaign = picks" filters on) and the first touch as first_utm_*.
 * The person gets both as properties, so a signup is credited to the
 * Instagram post that brought the visitor in, whatever page they signed up on.
 */

export const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
const FIRST = 'mx_first_touch';
const LAST = 'mx_last_touch';
export const LAST_TOUCH_DAYS = 30;
const DAY_MS = 86_400_000;

function safeStorage(storage) {
  if (storage) return storage;
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
}

function read(storage, key) {
  try {
    const raw = storage?.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function write(storage, key, value) {
  try { storage?.setItem(key, JSON.stringify(value)); } catch { /* private mode, full */ }
}

function referrerDomain(referrer) {
  try { return referrer ? new URL(referrer).hostname : null; } catch { return null; }
}

/**
 * Read the campaign tags from a landing URL and store them.
 * Safe to call on every page load: untagged visits change nothing.
 *
 * @param {{ href?: string, search?: string, pathname?: string }} [loc]
 * @param {{ referrer?: string, storage?: Storage, now?: number }} [opts]
 * @returns {{ first: object|null, last: object|null }}
 */
export function recordAttribution(loc, { referrer, storage, now = Date.now() } = {}) {
  const store = safeStorage(storage);
  try {
    const l = loc || (typeof window !== 'undefined' ? window.location : null);
    const params = new URLSearchParams(l?.search || '');
    const tags = {};
    for (const k of UTM_KEYS) {
      const v = params.get(k);
      if (v) tags[k] = v.slice(0, 100);
    }
    if (Object.keys(tags).length > 0) {
      const ref = referrer ?? (typeof document !== 'undefined' ? document.referrer : '');
      const touch = {
        ...tags,
        landing_path: (l?.pathname || '').slice(0, 200) || null,
        referring_domain: referrerDomain(ref),
        at: new Date(now).toISOString(),
      };
      if (!read(store, FIRST)) write(store, FIRST, touch);
      write(store, LAST, touch);
    }
  } catch { /* never break the page */ }
  return getAttribution({ storage: store, now });
}

/** The stored touches. The last touch expires after 30 days. */
export function getAttribution({ storage, now = Date.now() } = {}) {
  const store = safeStorage(storage);
  const first = read(store, FIRST);
  let last = read(store, LAST);
  if (last?.at && now - Date.parse(last.at) > LAST_TOUCH_DAYS * DAY_MS) last = null;
  return { first, last };
}

const pick = (touch, prefix = '') => {
  const out = {};
  if (!touch) return out;
  for (const k of UTM_KEYS) if (touch[k]) out[`${prefix}${k}`] = touch[k];
  return out;
};

/** Properties for every event: utm_* (last touch) and first_utm_* (first touch). */
export function attributionEventProps(opts) {
  const { first, last } = getAttribution(opts);
  return { ...pick(last), ...pick(first, 'first_') };
}

/**
 * Person properties: the first touch is set once and never changed, the last
 * touch is updated on every tagged visit.
 */
export function attributionPersonProps(opts) {
  const { first, last } = getAttribution(opts);
  const setOnce = { ...pick(first, 'first_touch_') };
  if (first?.landing_path) setOnce.first_touch_landing_path = first.landing_path;
  if (first?.at) setOnce.first_touch_at = first.at;
  const set = { ...pick(last, 'last_touch_') };
  if (last?.at) set.last_touch_at = last.at;
  return { set, setOnce };
}
