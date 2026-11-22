/**
 * Team talent grades for the NFL engine.
 *
 * Read from the active `picks_config` row for sport `nfl_talent`. The row
 * holds Maximus's blended position-group grades per team (see
 * src/features/nfl/picks/v2/talent.js). The player ratings behind them
 * are kept out of this public repository and out of the app's responses.
 * With no row the engine simply runs without talent context.
 */

import { createCache } from '../_cache.js';
import { getActiveConfig } from './picksHistory.js';
import { talentAverages } from '../../src/features/nfl/picks/v2/talent.js';

const memo = createCache(30 * 60 * 1000);
const KEY = 'nfl:talent';

export function shapeTalent(row) {
  if (!row || typeof row.teams !== 'object' || !row.teams) return null;
  const teams = row.teams;
  if (Object.keys(teams).length < 8) return null;
  return { asOf: row.asOf || null, source: row.source || 'maximus-talent', version: row.version || null, teams, averages: talentAverages(teams) };
}

export async function getNflTalent() {
  const hit = memo.get(KEY);
  if (hit !== null && hit !== undefined) return hit || null;
  let talent = null;
  try { talent = shapeTalent(await getActiveConfig({ sport: 'nfl_talent' })); }
  catch (e) { console.warn(`[nflTalent] load failed: ${e?.message}`); }
  memo.set(KEY, talent || false);
  return talent;
}
