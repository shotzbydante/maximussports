/**
 * The guest pass: what a signed-out reader gets the moment they give an
 * email on a preview page. The page opens in full on this device straight
 * away, while the confirmation email (link and code) is on its way. The
 * account, and the emails that come with it, start when they confirm.
 *
 * The pass lasts a week. After that the wall is back, and the same email
 * signs them in.
 *
 * Stored in localStorage; a small subscribe/notify pair lets React re-render
 * the moment the pass is granted.
 */

const KEY = 'mx_guest_pass';
export const GUEST_PASS_DAYS = 7;
const listeners = new Set();

function store() {
  try { return typeof window === 'undefined' ? null : window.localStorage; } catch { return null; }
}

/** The pass if there is one and it has not run out, else null. */
export function readGuestPass({ storage = store(), now = Date.now() } = {}) {
  try {
    const raw = storage?.getItem(KEY);
    if (!raw) return null;
    const pass = JSON.parse(raw);
    if (typeof pass?.email !== 'string' || !Number.isFinite(pass?.at)) return null;
    if (now - pass.at > GUEST_PASS_DAYS * 86400e3 || pass.at > now + 60e3) return null;
    return pass;
  } catch {
    return null;
  }
}

export function grantGuestPass(email, { storage = store(), now = Date.now() } = {}) {
  try { storage?.setItem(KEY, JSON.stringify({ email: String(email).trim().toLowerCase(), at: now })); } catch { /* private mode: the pass lasts until reload */ }
  snapshot = null;
  listeners.forEach((fn) => fn());
}

export function clearGuestPass({ storage = store() } = {}) {
  try { storage?.removeItem(KEY); } catch { /* ignore */ }
  snapshot = null;
  listeners.forEach((fn) => fn());
}

// useSyncExternalStore needs the same object back until something changes.
let snapshot = null;
export function subscribeGuestPass(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function guestPassSnapshot() {
  const pass = readGuestPass();
  const key = pass ? `${pass.email}|${pass.at}` : '';
  if (!snapshot || snapshot.key !== key) snapshot = { key, pass };
  return snapshot.pass;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export function isEmail(raw) {
  const v = String(raw ?? '').trim();
  return v.length <= 254 && EMAIL_RE.test(v);
}
