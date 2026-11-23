/**
 * Season ratings for the NBA picks engine: each team's scoring margin per
 * game from ESPN's standings, keyed by team slug.
 *
 * Best effort. If the fetch fails or the payload carries no margins, this
 * returns {} and the engine builds sides the way it did before v2.6.0.
 */

import { createCache, coalesce } from '../_cache.js';
import { NBA_ESPN_IDS } from '../../src/sports/nba/teams.js';
import { parseStandingsRatings } from '../../src/features/nba/picks/v2/seasonRatings.js';

const ESPN_STANDINGS = 'https://site.api.espn.com/apis/v2/sports/basketball/nba/standings';
const TIMEOUT_MS = 4000;
const cache = createCache(30 * 60 * 1000);

const espnIdToSlug = Object.fromEntries(Object.entries(NBA_ESPN_IDS).map(([slug, id]) => [String(id), slug]));

/** @returns {Promise<Record<string, { pointDiff: number, games: number }>>} */
export async function getNbaSeasonRatings() {
  const key = 'nba:seasonRatings';
  const hit = cache.get(key);
  if (hit) return hit;
  try {
    const ratings = await coalesce(key, async () => {
      const r = await fetch(ESPN_STANDINGS, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!r.ok) throw new Error(`ESPN NBA standings: ${r.status}`);
      const byId = parseStandingsRatings(await r.json());
      const bySlug = {};
      for (const [id, rating] of Object.entries(byId)) {
        const slug = espnIdToSlug[id];
        if (slug) bySlug[slug] = rating;
      }
      return bySlug;
    });
    // Only keep a full table; a partial one would rate some games and not others.
    if (Object.keys(ratings).length >= 28) cache.set(key, ratings);
    else console.warn(`[nbaSeasonRatings] only ${Object.keys(ratings).length} teams rated; sides fall back to the market`);
    return ratings;
  } catch (err) {
    console.warn(`[nbaSeasonRatings] unavailable: ${err?.message}`);
    return {};
  }
}
