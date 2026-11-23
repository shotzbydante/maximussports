/**
 * Sorting page errors: which are ours, which belong to the app the page is
 * open inside, and which only mean a newer build has shipped.
 */

/**
 * Errors thrown by the Instagram and Facebook Android browsers' own injected
 * scripts, not by this site. They fire on most page loads there and say
 * nothing about whether the page worked.
 */
const HOST_APP_NOISE = [
  /Java object is gone/i,
  /Error invoking postMessage/i,
  /Java bridge method invocation error/i,
];

export function isHostAppNoise(message) {
  const m = String(message || '');
  return HOST_APP_NOISE.some((re) => re.test(m));
}

/** The browser asked for a file from a build that has since been replaced. */
export function isStaleBuildError(message) {
  const m = String(message || '');
  return /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS/i.test(m);
}

const RELOAD_KEY = 'mx_reloaded_for_build';
const RELOAD_WINDOW_MS = 60 * 1000;

/**
 * Reload to pick up the new build, at most once a minute so a file that is
 * really missing cannot loop. Returns true when a reload was started.
 */
export function reloadOnceForNewBuild({ storage, now = Date.now(), reload } = {}) {
  let store = storage;
  try {
    if (!store) store = window.sessionStorage;
    const last = Number(store.getItem(RELOAD_KEY) || 0);
    if (last && now - last < RELOAD_WINDOW_MS) return false;
    store.setItem(RELOAD_KEY, String(now));
  } catch {
    // No storage means no way to know a reload already happened: do not risk a loop.
    return false;
  }
  (reload || (() => window.location.reload()))();
  return true;
}
