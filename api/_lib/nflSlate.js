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
import { getNflModelData } from './nflModelData.js';
import { getWeatherForGames } from './nflWeather.js';
import { getNflConfig } from './nflConfig.js';
import { getNflTalent } from './nflTalent.js';
import { projectNflGame, priceNflGame } from '../../src/features/nfl/picks/nflModel.js';
import { analyzeGame } from '../../src/features/nfl/picks/v2/engine.js';

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
 * Attach the v2 engine block to every game that has not finished, and
 * point the game's `model` fields at the v2 projection so the games page,
 * the briefing and the picks board all quote the same number. Games the
 * engine cannot project keep the v1 numbers from attachModel().
 */
export function attachEngine(games, { model, weather = {}, config, talent = null } = {}) {
  return games.map((g) => {
    const s = (g?.status || '').toLowerCase();
    if (!g || s === 'final' || g.gameState?.isFinal) return g;
    let engine;
    try {
      engine = analyzeGame({ game: g, model, weather: weather[String(g.gameId)] || null, config, talent });
    } catch (err) {
      console.warn(`[nflSlate] engine failed for ${g.gameId}: ${err?.message}`);
      return g;
    }
    if (!engine.projection) return { ...g, engine };
    return {
      ...g,
      engine,
      model: {
        ...g.model,
        fairSpread: engine.projection.fairSpreadHome,
        fairTotal: engine.projection.total,
        homeWinProb: engine.fair?.homeWin ?? g.model?.homeWinProb ?? null,
        projectedHome: engine.projection.homePoints,
        projectedAway: engine.projection.awayPoints,
        pregameEdge: engine.modelGap?.side ?? null,
        confidence: null,
        version: 'v2',
      },
    };
  });
}

/**
 * @returns {Promise<{ games, week, seasonType, seasonYear, byeTeams, ratings, engine }>}
 */
export async function getNflSlate({ modelWaitMs = 6000 } = {}) {
  const cached = cache.get(CACHE_KEY);
  if (cached) return cached;

  const slate = await coalesce(CACHE_KEY, async () => {
    const [page, ratings, injuries, config] = await Promise.all([
      fetchScoreboardPage(),
      getNflRatings().catch(() => null),
      getNflInjuries().catch(() => null),
      getNflConfig(),
    ]);
    let games = page.games;
    try { games = await enrichGamesWithOdds(games); }
    catch (err) { console.warn('[nflSlate] odds enrichment failed:', err?.message); }
    games = dropLookaheadOpeners(games);
    games = attachModel(games, ratings);
    games = attachInjuries(games, injuries);

    // v2 engine: nflverse ratings and quarterbacks, kickoff weather, and a
    // per-book consensus. Each piece degrades on its own; the engine block
    // says what was missing.
    // A cold model build downloads several megabytes from nflverse. Page
    // requests wait a few seconds and then go on without it; the picks
    // cron waits it out and leaves the reduced files in KV for everyone.
    let modelTimedOut = false;
    const model = page.ok
      ? await Promise.race([
          getNflModelData({ seasonYear: page.seasonYear, seasonType: page.seasonType, week: page.week }),
          new Promise((resolve) => setTimeout(() => { modelTimedOut = true; resolve({ ok: false, reasons: ['model data is still loading'] }); }, modelWaitMs)),
        ])
      : { ok: false, reasons: ['ESPN scoreboard unavailable'] };
    let weather = {};
    try { weather = await getWeatherForGames(games, { schedule: model?.schedule || {} }); }
    catch (err) { console.warn('[nflSlate] weather failed:', err?.message); }
    let talent = null;
    try { talent = await getNflTalent(); } catch { /* context only */ }
    games = attachEngine(games, { model, weather, config, talent });

    return {
      games,
      week: page.week,
      seasonType: page.seasonType,
      seasonYear: page.seasonYear,
      byeTeams: page.byeTeams,
      ratings,
      engine: {
        ok: !!model?.ok,
        asOf: model?.asOf || null,
        reasons: model?.reasons || [],
        source: model?.source || null,
        injuriesOk: !!injuries?.teams && Object.keys(injuries.teams).length > 0 && injuries.ok !== false,
        injuriesStale: !!injuries?.stale,
        weatherGames: Object.keys(weather).length,
        loading: modelTimedOut,
      },
      ok: page.ok,
    };
  });

  if (slate.games.length > 0) {
    // A slate built while the model was still loading is not cached, so
    // the next request gets the full engine as soon as it is ready.
    if (!slate.engine?.loading) cache.set(CACHE_KEY, slate);
    return slate;
  }
  // Empty response (ESPN hiccup or true offseason): prefer the last good slate.
  const stale = cache.getMaybeStale(CACHE_KEY);
  return stale?.value?.games?.length > 0 ? stale.value : slate;
}
