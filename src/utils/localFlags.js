/**
 * Lightweight helpers for boolean localStorage flags.
 * Values are stored as the string "1".
 */

export function getFlag(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

export function setFlag(key, value = '1') {
  // eslint-disable-next-line no-empty
  try { localStorage.setItem(key, value); } catch {}
}
