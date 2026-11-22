/**
 * NFL slate loader — the current week's games with consensus odds and the
 * model's projection attached. Shared by the games endpoint, the picks
 * builder, the briefing and the season page so they all describe the same
 * week from the same numbers.
 */

import { createCache, coalesce } from '../_cache.js';
import { fetchScoreboardPage } from '../nfl/live/_normalize.js';
import { enrichGamesWithOdds } from '../nfl/live/_odds.js';
import { getNflRatings } from './nflRatings.js';
import { getNflInjuries, attachInjuries } from './nflInjuries.js';
import { projectNflGame, priceNflGame } from '../../src/features/nfl/picks/nflModel.js';

const cache = createCache(30_000);
const CACHE_KEY = 'nfl:slate:v1';

/**
 * ESPN's "open" is often a look-ahead number posted months before the
 * game, so the gap to today's line can be a whole season of news rather
 * than this week's betting. Beyond these sizes the opener is dropped, so
 * nothing downstream reports it as line movement.
 */
const MAX_OPEN_GAP = { spread: 3.5, total: 4 };

export function dropLookaheadOpeners(games) {
  return games.map((g) => {
    const m = g?.market;
    if (!m) return g;
    const far = (open, now, max) => open != null && now != null && Math.abs(now - open) > max;
    const dropSpread = far(m.openSpread, m.pregameSpread, MAX_OPEN_GAP.spread);
    const dropTotal = far(m.openTotal, m.pregameTotal, MAX_OPEN_GAP.total);
    if (!dropSpread && !dropTotal) return g;
    return {
      ...g,
      market: {
        ...m,
        openSpread: dropSpread ? null : m.openSpread,
        openTotal: dropTotal ? null : m.openTotal,
      },
    };
  });
}

/** Attach the rating projection to each game's `model` block. */
export function attachModel(games, ratings) {
  if (!ratings?.teams || Object.keys(ratings.teams).length === 0) return games;
  return games.map((g) => {
    const projection = projectNflGame({
      homeSlug: g.teams?.home?.slug,
      awaySlug: g.teams?.away?.slug,
      ratings,
      neutralSite: !!g.venue?.neutralSite,
    });
    if (!projection) return g;
    const priced = priceNflGame({
      projection,
      market: {
        spreadHome: g.market?.pregameSpread,
        total: g.market?.pregameTotal,
        moneylineHome: g.market?.moneyline?.home,
        moneylineAway: g.market?.moneyline?.away,
      },
    });
    return {
      ...g,
      model: {
        ...g.model,
        fairSpread: projection.fairSpreadHome,
        fairTotal: projection.total,
        homeWinProb: priced?.moneyline?.homeWinProb ?? projection.homeWinProb,
        projectedHome: projection.homePoints,
        projectedAway: projection.awayPoints,
        pregameEdge: priced?.side ? priced.side.rawGap : null,
        confidence: null,
      },
    };
  });
}

/**
 * @returns {Promise<{ games, week, seasonType, seasonYear, byeTeams, ratings }>}
 */
export async function getNflSlate() {
  const cached = cache.get(CACHE_KEY);
  if (cached) return cached;

  const slate = await coalesce(CACHE_KEY, async () => {
    const [page, ratings, injuries] = await Promise.all([
      fetchScoreboardPage(),
      getNflRatings().catch(() => null),
      getNflInjuries().catch(() => null),
    ]);
    let games = page.games;
    try { games = await enrichGamesWithOdds(games); }
    catch (err) { console.warn('[nflSlate] odds enrichment failed:', err?.message); }
    games = dropLookaheadOpeners(games);
    games = attachModel(games, ratings);
    games = attachInjuries(games, injuries);
    return {
      games,
      week: page.week,
      seasonType: page.seasonType,
      seasonYear: page.seasonYear,
      byeTeams: page.byeTeams,
      ratings,
      ok: page.ok,
    };
  });

  if (slate.games.length > 0) {
    cache.set(CACHE_KEY, slate);
    return slate;
  }
  // Empty response (ESPN hiccup or true offseason): prefer the last good slate.
  const stale = cache.getMaybeStale(CACHE_KEY);
  return stale?.value?.games?.length > 0 ? stale.value : slate;
}
