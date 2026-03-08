/**
 * Slate-date helpers for college basketball.
 *
 * College basketball games never tip off before 4 AM local time.
 * The overnight window (midnight–3:59 AM) is treated as part of the
 * *previous* calendar day's sports slate so the UI never prematurely
 * skips to the next day.
 *
 * All functions return YYYY-MM-DD strings based on the device's local
 * clock, which is correct for US users (Pacific or Eastern).
 *
 * Centralised here so Home, Insights, and any future page share
 * identical logic and never drift apart.
 */

/** Hour (local, 0-23) at which the sports day "rolls over" to the next calendar day. */
export const SPORTS_DAY_ROLLOVER_HOUR = 4;

/**
 * Returns YYYY-MM-DD for the current *sports day* (local date with rollover).
 *
 * Before SPORTS_DAY_ROLLOVER_HOUR the previous calendar day is returned so
 * that just-after-midnight visits still show the correct active slate.
 *
 * Examples (SPORTS_DAY_ROLLOVER_HOUR = 4):
 *   12:30 AM Sat Mar 7  →  "2026-03-06"  (Fri Mar 6 — active sports day)
 *    5:00 AM Sat Mar 7  →  "2026-03-07"  (Sat Mar 7)
 */
export function sportsDateStr() {
  const d = new Date();
  if (d.getHours() < SPORTS_DAY_ROLLOVER_HOUR) {
    d.setDate(d.getDate() - 1);
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Returns YYYY-MM-DD for the *next* sports day after the current one.
 *
 * Before SPORTS_DAY_ROLLOVER_HOUR, the current calendar day is "next"
 * because the prior calendar day is still the active sports day.
 *
 * Examples (SPORTS_DAY_ROLLOVER_HOUR = 4):
 *   12:30 AM Sat Mar 7  →  "2026-03-07"  (Sat Mar 7 — the actual next slate)
 *    5:00 AM Sat Mar 7  →  "2026-03-08"  (Sun Mar 8 — tomorrow)
 */
export function nextSportsDayStr() {
  const d = new Date();
  if (d.getHours() >= SPORTS_DAY_ROLLOVER_HOUR) {
    d.setDate(d.getDate() + 1);
  }
  // Before rollover hour: return today's calendar date (no adjustment needed)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Returns YYYYMMDD (no dashes) from a YYYY-MM-DD string — for API date params. */
export function toApiDateStr(iso) {
  return iso.replace(/-/g, '');
}
