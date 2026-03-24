/**
 * usePinnedTeams — unified cross-sport pinned teams hook.
 *
 * Provides a single interface for pinning teams across MLB and NCAAM.
 *
 * Storage model:
 *   localStorage key: maximus-pinned-teams-v2
 *   Structure: { mlb: ['nyy', 'lad'], ncaam: ['duke-blue-devils', 'kansas-jayhawks'] }
 *
 * Migration:
 *   - Reads legacy maximus-mlb-pinned-teams (MLB v1 key) on first access
 *   - Reads legacy maximus-pinned-teams (NCAAM key) on first access
 *   - Merges into unified structure, removes legacy keys
 *
 * Usage:
 *   const { pinnedTeams, addTeam, removeTeam, isPinned } = usePinnedTeams({ sport: 'mlb' });
 *
 * Future: plug in Supabase user_teams sync (sport-aware rows).
 */
import { useState, useCallback, useEffect } from 'react';

const UNIFIED_KEY = 'maximus-pinned-teams-v2';
const LEGACY_MLB_KEY = 'maximus-mlb-pinned-teams';
const LEGACY_NCAAM_KEY = 'maximus-pinned-teams';

// ─── Storage layer ─────────────────────────────────────────────────────────

function readUnified() {
  try {
    const raw = localStorage.getItem(UNIFIED_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        mlb: Array.isArray(parsed?.mlb) ? parsed.mlb.filter(s => typeof s === 'string') : [],
        ncaam: Array.isArray(parsed?.ncaam) ? parsed.ncaam.filter(s => typeof s === 'string') : [],
      };
    }
  } catch { /* fall through */ }
  return null;
}

function writeUnified(data) {
  try {
    localStorage.setItem(UNIFIED_KEY, JSON.stringify(data));
  } catch { /* quota exceeded */ }
}

function readLegacyArray(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter(s => typeof s === 'string' && s.length > 0);
    // NCAAM legacy: might be array of objects with .slug
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

  const unified = {
    mlb: legacyMlb,
    ncaam: legacyNcaam,
  };

  writeUnified(unified);

  // Don't delete legacy keys yet — NCAAM still reads from its own key
  // We'll read from unified going forward for MLB
}

function getForSport(sport) {
  ensureMigrated();
  const data = readUnified() || { mlb: [], ncaam: [] };
  return data[sport] || [];
}

function setForSport(sport, slugs) {
  ensureMigrated();
  const data = readUnified() || { mlb: [], ncaam: [] };
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

  // Sync on mount and when sport changes
  useEffect(() => {
    setPinnedTeams(getForSport(sport));
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
