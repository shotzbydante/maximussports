/**
 * Bracket initialization — runs once at app startup to ensure tournament
 * helpers use official bracket data when available.
 *
 * This is a fire-and-forget call. If it fails, the app falls back to the
 * projected field — no user-facing error.
 */

import { fetchBracketData } from '../data/bracketData.js';
import { setOfficialBracketData, getTournamentDataMode } from './tournamentHelpers.js';

let _initPromise = null;

export function initOfficialBracket() {
  if (getTournamentDataMode() === 'official') return Promise.resolve();
  if (_initPromise) return _initPromise;

  _initPromise = fetchBracketData()
    .then(bracket => {
      if (bracket?.bracketMode === 'official') {
        setOfficialBracketData(bracket);
      }
    })
    .catch(() => {})
    .finally(() => { _initPromise = null; });

  return _initPromise;
}
