/**
 * Server-side admin email constant.
 * Resolution order: ADMIN_EMAIL env var → VITE_ADMIN_EMAIL env var → hardcoded fallback.
 * Always normalized to lowercase + trimmed so typos/casing can never break the gate.
 */
export const ADMIN_EMAIL = (
  process.env.ADMIN_EMAIL ||
  process.env.VITE_ADMIN_EMAIL ||
  'dantedicicco@gmail.com'
).trim().toLowerCase();

/** Returns true when the given email belongs to the admin. */
export function isAdminEmail(email) {
  return Boolean(email) && email.trim().toLowerCase() === ADMIN_EMAIL;
}
