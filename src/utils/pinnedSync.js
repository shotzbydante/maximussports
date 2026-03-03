/**
 * Pinned-teams cross-component event bus.
 *
 * Event name : "mx:pinned_teams_changed"
 * Event detail: { slugs: string[], source: "home"|"settings"|"db"|"local", ts: number }
 *
 * Rules to prevent infinite loops:
 *   - Components that write to DB (usePinnedTeamsSync) only react to source "home" or "settings".
 *   - Components that own the pin UI (PinnedTeamsSection) only react to source "db" or "settings".
 *   - Settings only re-fetches on source "home"; it dispatches "db" or "settings" itself.
 */

const EVENT = 'mx:pinned_teams_changed';

/**
 * Normalise a raw slugs array: coerce to strings, trim, filter falsy, dedupe.
 * Always returns a new array (never mutates input).
 * @param {unknown} raw
 * @returns {string[]}
 */
export function normaliseSlugs(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const result = [];
  for (const item of raw) {
    const s = typeof item === 'string' ? item.trim() : String(item ?? '').trim();
    if (s && !seen.has(s)) {
      seen.add(s);
      result.push(s);
    }
  }
  return result;
}

/**
 * Order-insensitive equality check for two slug arrays.
 * Normalises both inputs, then compares as sets — order does not matter.
 * Returns true when both contain the same set of unique slugs.
 * @param {unknown} a
 * @param {unknown} b
 */
export function slugArraysEqual(a, b) {
  const na = normaliseSlugs(a);
  const nb = normaliseSlugs(b);
  if (na.length !== nb.length) return false;
  const setB = new Set(nb);
  for (const s of na) {
    if (!setB.has(s)) return false;
  }
  return true;
}

/**
 * Dispatch the change event with normalised slugs.
 * No-ops when called outside a browser context.
 * @param {unknown} pinnedSlugs
 * @param {'home'|'settings'|'db'|'local'} source
 */
export function notifyPinnedChanged(pinnedSlugs, source) {
  if (typeof window === 'undefined') return;
  const slugs = normaliseSlugs(pinnedSlugs);
  window.dispatchEvent(
    new CustomEvent(EVENT, { detail: { slugs, source, ts: Date.now() } })
  );
}

/**
 * Subscribe to pinned-teams changes.
 * Returns an unsubscribe function.
 * @param {(detail: { slugs: string[], source: string, ts: number }) => void} handler
 * @returns {() => void}
 */
export function onPinnedChanged(handler) {
  if (typeof window === 'undefined') return () => {};
  const wrapped = (e) => {
    try {
      handler(e.detail);
    } catch { /* swallow — listener errors must not propagate */ }
  };
  window.addEventListener(EVENT, wrapped);
  return () => window.removeEventListener(EVENT, wrapped);
}
