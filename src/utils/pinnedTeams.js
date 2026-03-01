/**
 * localStorage helpers for pinned teams (slugs array).
 * Key: maximus-pinned-teams
 *
 * Schema: JSON array of slug strings, e.g. ["duke-blue-devils","kansas-jayhawks"]
 *
 * Migration: handles legacy shapes:
 *   - comma-separated string  → split to array
 *   - array of objects {slug} → extract slugs
 *   - anything unrecognised   → return []  (preserve prev state, log error)
 */

const STORAGE_KEY = 'maximus-pinned-teams';

/** Normalise any stored value into a clean string[]. Returns null on unrecoverable error. */
function normalise(raw) {
  if (!raw) return [];
  // Already an array of strings (happy path)
  let parsed;
  try { parsed = JSON.parse(raw); } catch { return null; }

  if (Array.isArray(parsed)) {
    // Array of objects ({slug, …}) — extract slug strings
    if (parsed.length > 0 && typeof parsed[0] === 'object' && parsed[0] !== null) {
      return parsed.map((item) => item?.slug ?? '').filter(Boolean);
    }
    // Array of strings — return as-is (filter out non-strings)
    return parsed.filter((s) => typeof s === 'string' && s.length > 0);
  }
  // Legacy: comma-separated string
  if (typeof parsed === 'string') {
    return parsed.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return null; // unrecognised — caller will preserve previous state
}

export function getPinnedTeams() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const result = normalise(raw);
    if (result === null) {
      // Parsing failed or unrecognised schema — preserve storage as-is, return []
      console.warn('[pinnedTeams] unrecognised schema in storage; returning []', raw);
      return [];
    }
    return result;
  } catch {
    return [];
  }
}

export function setPinnedTeams(slugs) {
  try {
    const arr = Array.isArray(slugs) ? slugs.filter((s) => typeof s === 'string') : [];
    const serialised = JSON.stringify(arr);
    localStorage.setItem(STORAGE_KEY, serialised);
    // Verify write succeeded (handles private-mode storage quota exceeded)
    const readBack = localStorage.getItem(STORAGE_KEY);
    if (readBack !== serialised) {
      console.warn('[pinnedTeams] write verification failed — storage may be full or restricted');
    }
    return arr;
  } catch {
    return getPinnedTeams();
  }
}

/** Atomic add: deduplicates and preserves existing order. */
export function addPinnedTeam(slug) {
  const current = getPinnedTeams();
  if (current.includes(slug)) return current;
  const next = [...current, slug];
  return setPinnedTeams(next);
}

/** Atomic remove. */
export function removePinnedTeam(slug) {
  const current = getPinnedTeams();
  const next = current.filter((s) => s !== slug);
  return setPinnedTeams(next);
}

/** Atomic toggle. */
export function togglePinnedTeam(slug) {
  const current = getPinnedTeams();
  const has = current.includes(slug);
  const next = has ? current.filter((s) => s !== slug) : [...current, slug];
  return setPinnedTeams(next);
}
