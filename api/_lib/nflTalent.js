/**
 * Team talent grades for the NFL engine.
 *
 * Read from the active `picks_config` row for sport `nfl_talent`. The row
 * holds Maximus's blended unit grades per team (see
 * src/features/nfl/picks/v2/talent.js). With no row the engine simply
 * runs without talent context.
 *
 * A second row, sport `nfl_talent_detail`, holds each team's
 * position-group grades and counted starters with their ratings. It
 * feeds the team and game pages only. Neither data set is committed to
 * this public repository: both live in the database.
 */

import { createCache } from '../_cache.js';
import { getActiveConfig } from './picksHistory.js';
import { talentAverages } from '../../src/features/nfl/picks/v2/talent.js';
import { buildTalentLeague } from '../../src/features/nfl/talent/talentView.js';

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

const LEAGUE_KEY = 'nfl:talent:league';

/** Units, position groups and starters for every team, or null. */
export async function getNflTalentLeague() {
  const hit = memo.get(LEAGUE_KEY);
  if (hit !== null && hit !== undefined) return hit || null;
  let league = null;
  try {
    const [units, detail] = await Promise.all([
      getNflTalent(),
      getActiveConfig({ sport: 'nfl_talent_detail' }),
    ]);
    league = buildTalentLeague({ detail, units });
  } catch (e) { console.warn(`[nflTalent] league load failed: ${e?.message}`); }
  memo.set(LEAGUE_KEY, league || false);
  return league;
}
