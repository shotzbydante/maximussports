/**
 * Personalization utilities for email templates and other server-side use.
 */

/**
 * Derive a user's display name with graceful fallbacks.
 *
 * Priority:
 *  1. profile.full_name
 *  2. profile.display_name
 *  3. profile.username
 *  4. user.user_metadata.full_name
 *  5. user.user_metadata.name
 *  6. Title-cased email local-part (before @)
 *  7. 'there'
 *
 * @param {object} opts
 * @param {object|null} [opts.user]    — Supabase auth user object
 * @param {object|null} [opts.profile] — profiles table row
 * @returns {string}
 */
export function getUserDisplayName({ user = null, profile = null } = {}) {
  const candidates = [
    profile?.full_name,
    profile?.display_name,
    profile?.username,
    user?.user_metadata?.full_name,
    user?.user_metadata?.name,
  ];

  for (const c of candidates) {
    const trimmed = typeof c === 'string' ? c.trim() : null;
    if (trimmed) return trimmed;
  }

  // Derive from email local-part
  const email = user?.email || '';
  if (email.includes('@')) {
    const local = email.split('@')[0];
    const titleCased = local
      .replace(/[._+-]/g, ' ')
      .split(' ')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ')
      .trim();
    if (titleCased) return titleCased;
  }

  return 'there';
}

/**
 * Returns just the first name portion for use in greetings.
 * @param {string} displayName
 * @returns {string}
 */
export function getFirstName(displayName) {
  if (!displayName) return 'there';
  return displayName.split(' ')[0];
}
