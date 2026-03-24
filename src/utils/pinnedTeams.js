/**
 * pinnedTeams.js — NCAAM pinned-team helpers.
 *
 * MIGRATED: now reads/writes through the unified v2 store
 * (maximus-pinned-teams-v2 → ncaam array) instead of the legacy
 * flat key (maximus-pinned-teams).
 *
 * On first access, migrates any legacy data into the v2 structure.
 * After migration, the legacy key is no longer the active source of truth.
 *
 * This file is kept as a stable API surface so all existing NCAAM consumers
 * (PinnedTeamsSection, Home, TeamPage, Settings, etc.) continue working
 * without import changes.
 */

import {
  getPinnedForSport,
  addPinnedForSport,
  removePinnedForSport,
} from '../hooks/usePinnedTeams';

// ─── Legacy migration (runs once) ─────────────────────────────────────────

const LEGACY_KEY = 'maximus-pinned-teams';
let _legacyMigrated = false;

function ensureLegacyMigrated() {
  if (_legacyMigrated) return;
  _legacyMigrated = true;

  // Check if unified v2 already has NCAAM data
  const existing = getPinnedForSport('ncaam');
  if (existing.length > 0) return; // already migrated or has data

  // Read legacy flat array
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return;
    let parsed;
    try { parsed = JSON.parse(raw); } catch { return; }

    let slugs = [];
    if (Array.isArray(parsed)) {
      if (parsed.length > 0 && typeof parsed[0] === 'object' && parsed[0] !== null) {
        slugs = parsed.map(item => item?.slug ?? '').filter(Boolean);
      } else {
        slugs = parsed.filter(s => typeof s === 'string' && s.length > 0);
      }
    } else if (typeof parsed === 'string') {
      slugs = parsed.split(',').map(s => s.trim()).filter(Boolean);
    }

    // Write each slug into unified v2 ncaam array
    slugs.forEach(slug => addPinnedForSport('ncaam', slug));
  } catch { /* migration failed — safe to continue without legacy data */ }
}

// ─── Public API (unchanged signatures) ─────────────────────────────────────

export function getPinnedTeams() {
  ensureLegacyMigrated();
  return getPinnedForSport('ncaam');
}

export function setPinnedTeams(slugs) {
  ensureLegacyMigrated();
  const arr = Array.isArray(slugs) ? slugs.filter(s => typeof s === 'string') : [];
  // Write to unified v2 by replacing the ncaam array
  // Use the raw unified write to do a full replace
  try {
    const UNIFIED_KEY = 'maximus-pinned-teams-v2';
    const raw = localStorage.getItem(UNIFIED_KEY);
    const data = raw ? JSON.parse(raw) : { mlb: [], ncaam: [] };
    data.ncaam = arr;
    localStorage.setItem(UNIFIED_KEY, JSON.stringify(data));
  } catch { /* quota exceeded */ }
  // Also update legacy key for any remaining direct localStorage reads
  try { localStorage.setItem(LEGACY_KEY, JSON.stringify(arr)); } catch {}
  return arr;
}

export function addPinnedTeam(slug) {
  ensureLegacyMigrated();
  return addPinnedForSport('ncaam', slug);
}

export function removePinnedTeam(slug) {
  ensureLegacyMigrated();
  return removePinnedForSport('ncaam', slug);
}

export function togglePinnedTeam(slug) {
  ensureLegacyMigrated();
  const current = getPinnedForSport('ncaam');
  const has = current.includes(slug);
  if (has) {
    return removePinnedForSport('ncaam', slug);
  } else {
    return addPinnedForSport('ncaam', slug);
  }
}
