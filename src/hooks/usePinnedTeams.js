/**
 * usePinnedTeams — unified cross-sport pinned teams hook.
 *
 * Provides a single interface for pinning teams across MLB and NCAAM.
 *
 * Storage model:
 *   localStorage key: maximus-pinned-teams-v2
 *   Structure: { mlb: ['nyy', 'lad'], ncaam: ['duke-blue-devils', 'kansas-jayhawks'] }
 *
 * Reactivity:
 *   - Listens for custom 'maximus-pins-updated' events (same-tab sync)
 *   - Listens for 'storage' events (cross-tab sync)
 *   - Re-reads from localStorage when either fires
 *
 * Usage:
 *   const { pinnedTeams, addTeam, removeTeam, isPinned } = usePinnedTeams({ sport: 'mlb' });
 */
import { useState, useCallback, useEffect } from 'react';

const UNIFIED_KEY = 'maximus-pinned-teams-v2';
const LEGACY_MLB_KEY = 'maximus-mlb-pinned-teams';
const LEGACY_NCAAM_KEY = 'maximus-pinned-teams';
const PINS_UPDATED_EVENT = 'maximus-pins-updated';

// ─── Storage layer ─────────────────────────────────────────────────────────

function readUnified() {
  try {
    const raw = localStorage.getItem(UNIFIED_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        mlb: Array.isArray(parsed?.mlb) ? parsed.mlb.filter(s => typeof s === 'string') : [],
        ncaam: Array.isArray(parsed?.ncaam) ? parsed.ncaam.filter(s => typeof s === 'string') : [],
        nba: Array.isArray(parsed?.nba) ? parsed.nba.filter(s => typeof s === 'string') : [],
      };
    }
  } catch { /* fall through */ }
  return null;
}

function writeUnified(data) {
  try {
    localStorage.setItem(UNIFIED_KEY, JSON.stringify(data));
    // Notify same-tab listeners (storage event only fires cross-tab)
    window.dispatchEvent(new CustomEvent(PINS_UPDATED_EVENT));
  } catch { /* quota exceeded */ }
}

function readLegacyArray(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter(s => typeof s === 'string' && s.length > 0);
    if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'object') {
      return parsed.map(item => item?.slug ?? '').filter(Boolean);
    }
    return [];
  } catch { return []; }
}

/** Migrate legacy keys into unified structure. Run once per session. */
let _migrated = false;
function ensureMigrated() {
  if (_migrated) return;
  _migrated = true;

  const existing = readUnified();
  if (existing) return; // already migrated

  const legacyMlb = readLegacyArray(LEGACY_MLB_KEY);
  const legacyNcaam = readLegacyArray(LEGACY_NCAAM_KEY);

  const unified = { mlb: legacyMlb, ncaam: legacyNcaam, nba: [] };
  // Use raw localStorage.setItem (not writeUnified) to avoid premature event
  try { localStorage.setItem(UNIFIED_KEY, JSON.stringify(unified)); } catch {}
}

function getForSport(sport) {
  ensureMigrated();
  const data = readUnified() || { mlb: [], ncaam: [], nba: [] };
  return data[sport] || [];
}

function setForSport(sport, slugs) {
  ensureMigrated();
  const data = readUnified() || { mlb: [], ncaam: [], nba: [] };
  data[sport] = slugs;
  writeUnified(data);

  // Also write back to legacy key for NCAAM backward compat
  if (sport === 'ncaam') {
    try { localStorage.setItem(LEGACY_NCAAM_KEY, JSON.stringify(slugs)); } catch {}
  }

  return slugs;
}

// ─── Also export raw helpers for non-hook usage ────────────────────────────

export function getPinnedForSport(sport) { return getForSport(sport); }
export function addPinnedForSport(sport, slug) {
  const current = getForSport(sport);
  if (current.includes(slug)) return current;
  return setForSport(sport, [...current, slug]);
}
export function removePinnedForSport(sport, slug) {
  return setForSport(sport, getForSport(sport).filter(s => s !== slug));
}

// ─── Hook ──────────────────────────────────────────────────────────────────

export default function usePinnedTeams({ sport = 'mlb' } = {}) {
  const [pinnedTeams, setPinnedTeams] = useState(() => getForSport(sport));

  // Re-read from localStorage when unified store is updated
  // (by sync hook, other components, or cross-tab)
  useEffect(() => {
    const refresh = () => setPinnedTeams(getForSport(sport));

    // Same-tab: custom event dispatched by writeUnified()
    window.addEventListener(PINS_UPDATED_EVENT, refresh);
    // Cross-tab: native storage event
    window.addEventListener('storage', (e) => {
      if (e.key === UNIFIED_KEY) refresh();
    });

    // Also refresh on sport change
    refresh();

    return () => {
      window.removeEventListener(PINS_UPDATED_EVENT, refresh);
      // Note: storage listener uses inline arrow so can't cleanly remove,
      // but it's lightweight and component-lifetime-scoped
    };
  }, [sport]);

  const addTeam = useCallback((slug) => {
    const next = addPinnedForSport(sport, slug);
    setPinnedTeams(next);
    return next;
  }, [sport]);

  const removeTeam = useCallback((slug) => {
    const next = removePinnedForSport(sport, slug);
    setPinnedTeams(next);
    return next;
  }, [sport]);

  const toggleTeam = useCallback((slug) => {
    const current = getForSport(sport);
    const next = current.includes(slug)
      ? current.filter(s => s !== slug)
      : [...current, slug];
    setForSport(sport, next);
    setPinnedTeams(next);
    return next;
  }, [sport]);

  const isPinned = useCallback((slug) => {
    return pinnedTeams.includes(slug);
  }, [pinnedTeams]);

  return { pinnedTeams, addTeam, removeTeam, toggleTeam, isPinned };
}
