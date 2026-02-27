/**
 * Shared ATS KV key helpers.
 * Single source of truth for window normalization and key name generation.
 * All ATS writers (refresh, warmAll, warm, warmFull) and readers (leaders) should import from here.
 */
import {
  getAtsLeadersKeyForWindow,
  getAtsLeadersLastKnownKeyForWindow,
} from '../_globalCache.js';

/**
 * Normalise a raw window param to one of the three canonical values.
 * @param {string | undefined} win
 * @returns {'last30' | 'last7' | 'season'}
 */
export function normalizeWindow(win) {
  const w = String(win || 'last30').toLowerCase().trim();
  if (w === 'last7') return 'last7';
  if (w === 'season') return 'season';
  return 'last30';
}

/** Fresh KV key for a window. @param {string} win */
export const getFreshKey = (win) => getAtsLeadersKeyForWindow(normalizeWindow(win));

/** Long-lived last-known KV key for a window. @param {string} win */
export const getLastKnownKey = (win) => getAtsLeadersLastKnownKeyForWindow(normalizeWindow(win));
