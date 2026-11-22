/**
 * Active NFL picks config: the in-code default merged with the active
 * `picks_config` row for sport 'nfl', if there is one. Memoized so the
 * slate loader and the picks builder agree without two database reads.
 */

import { createCache } from '../_cache.js';
import { getActiveConfig } from './picksHistory.js';
import { NFL_DEFAULT_CONFIG } from '../../src/features/nfl/picks/buildNflPicksV2.js';

const memo = createCache(10 * 60 * 1000);
const KEY = 'nfl:config';

export async function getNflConfig() {
  const hit = memo.get(KEY);
  if (hit) return hit;
  let config = NFL_DEFAULT_CONFIG;
  try {
    const db = await getActiveConfig({ sport: 'nfl' });
    // Only a v2-shaped row may override: a row written for the v1 engine
    // carries weights and percentile cutoffs that mean nothing here.
    if (db && db.evThresholds) config = { ...NFL_DEFAULT_CONFIG, ...db };
  } catch (e) {
    console.warn(`[nflConfig] getActiveConfig failed: ${e?.message}`);
  }
  memo.set(KEY, config);
  return config;
}
