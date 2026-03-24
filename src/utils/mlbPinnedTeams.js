/**
 * MLB-specific pinned teams localStorage helpers.
 * Mirrors the NCAAM pinnedTeams.js pattern but uses a separate key
 * so MLB and NCAAM pinned teams don't collide.
 *
 * Key: maximus-mlb-pinned-teams
 * Schema: JSON array of slug strings, e.g. ["nyy","bos"]
 */

const STORAGE_KEY = 'maximus-mlb-pinned-teams';

export function getMlbPinnedTeams() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter(s => typeof s === 'string' && s.length > 0);
    return [];
  } catch { return []; }
}

export function setMlbPinnedTeams(slugs) {
  try {
    const arr = Array.isArray(slugs) ? slugs.filter(s => typeof s === 'string') : [];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
    return arr;
  } catch { return getMlbPinnedTeams(); }
}

export function addMlbPinnedTeam(slug) {
  const current = getMlbPinnedTeams();
  if (current.includes(slug)) return current;
  return setMlbPinnedTeams([...current, slug]);
}

export function removeMlbPinnedTeam(slug) {
  return setMlbPinnedTeams(getMlbPinnedTeams().filter(s => s !== slug));
}

export function toggleMlbPinnedTeam(slug) {
  const current = getMlbPinnedTeams();
  return current.includes(slug)
    ? setMlbPinnedTeams(current.filter(s => s !== slug))
    : setMlbPinnedTeams([...current, slug]);
}
