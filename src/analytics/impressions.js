/**
 * Lightweight IntersectionObserver helper for impression tracking.
 *
 * Each item is fired at most once per browser session, deduped by a unique key
 * stored in sessionStorage.  Falls back gracefully when IntersectionObserver is
 * unavailable (old browsers / SSR).
 */

const SEEN_PREFIX = 'mx_imp_';

function hasSeenThisSession(key) {
  try { return !!sessionStorage.getItem(`${SEEN_PREFIX}${key}`); }
  catch { return false; }
}

function markSeen(key) {
  try { sessionStorage.setItem(`${SEEN_PREFIX}${key}`, '1'); }
  catch { /* ignore */ }
}

/**
 * Observe an HTML element; fire `callback` once (per session) when it crosses
 * the visibility threshold.
 *
 * @param {HTMLElement|null} element
 * @param {string} itemKey  — unique key (videoId, article URL, …)
 * @param {() => void} callback
 * @param {{ threshold?: number }} [opts]  — default 0.5 (50% visible)
 * @returns {() => void}  cleanup / unobserve function
 */
export function observeImpression(element, itemKey, callback, { threshold = 0.5 } = {}) {
  if (!element || !itemKey || typeof IntersectionObserver === 'undefined') return () => {};
  if (hasSeenThisSession(itemKey)) return () => {};

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting && !hasSeenThisSession(itemKey)) {
          markSeen(itemKey);
          try { callback(); } catch { /* never crash */ }
          observer.unobserve(entry.target);
        }
      }
    },
    { threshold }
  );

  observer.observe(element);
  return () => { try { observer.unobserve(element); } catch { /* ignore */ } };
}
