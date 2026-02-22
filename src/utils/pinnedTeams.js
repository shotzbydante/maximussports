/**
 * localStorage helpers for pinned teams ( slugs ).
 * Key: maximus-pinned-teams
 */

const STORAGE_KEY = 'maximus-pinned-teams';

export function getPinnedTeams() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function setPinnedTeams(slugs) {
  try {
    const arr = Array.isArray(slugs) ? slugs : [];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
    return arr;
  } catch {
    return getPinnedTeams();
  }
}

export function addPinnedTeam(slug) {
  const current = getPinnedTeams();
  if (current.includes(slug)) return current;
  const next = [...current, slug];
  setPinnedTeams(next);
  return next;
}

export function removePinnedTeam(slug) {
  const current = getPinnedTeams();
  const next = current.filter((s) => s !== slug);
  setPinnedTeams(next);
  return next;
}

export function togglePinnedTeam(slug) {
  const current = getPinnedTeams();
  const has = current.includes(slug);
  const next = has ? current.filter((s) => s !== slug) : [...current, slug];
  setPinnedTeams(next);
  return next;
}
