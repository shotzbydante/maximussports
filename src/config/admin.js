/**
 * Client-side admin email constant.
 * Resolution order: VITE_ADMIN_EMAIL env var → hardcoded fallback.
 * Always normalized to lowercase + trimmed so casing can never break the gate.
 *
 * Add VITE_ADMIN_EMAIL=dantedicicco@gmail.com to Vercel env vars to avoid the fallback.
 */
export const ADMIN_EMAIL = (
  import.meta.env.VITE_ADMIN_EMAIL || 'dantedicicco@gmail.com'
).trim().toLowerCase();

/** Returns true when the given email belongs to the admin. */
export function isAdminUser(email) {
  return Boolean(email) && email.trim().toLowerCase() === ADMIN_EMAIL;
}
