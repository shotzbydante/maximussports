/**
 * Pinned-teams cross-component event bus.
 *
 * Event name : "mx:pinned_teams_changed"
 * Event detail: { pinnedSlugs: string[], source: "home" | "settings" | "db" | "local" }
 *
 * Rules to prevent infinite loops:
 *   - Components that write to DB (usePinnedTeamsSync) only react to source "home" or "settings".
 *   - Components that own the pin UI (PinnedTeamsSection) only react to source "db" or "settings".
 *   - Settings only re-fetches on source "home"; it dispatches "db" or "settings" itself.
 */

const EVENT = 'mx:pinned_teams_changed';

/**
 * Dispatch the change event.
 * @param {string[]} pinnedSlugs
 * @param {'home'|'settings'|'db'|'local'} source
 */
export function notifyPinnedChanged(pinnedSlugs, source) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(EVENT, { detail: { pinnedSlugs: pinnedSlugs ?? [], source } })
  );
}

/**
 * Subscribe to pinned-teams changes.
 * Returns an unsubscribe function.
 * @param {(detail: { pinnedSlugs: string[], source: string }) => void} handler
 */
export function onPinnedChanged(handler) {
  if (typeof window === 'undefined') return () => {};
  const wrapped = (e) => handler(e.detail);
  window.addEventListener(EVENT, wrapped);
  return () => window.removeEventListener(EVENT, wrapped);
}
