/**
 * normalizeMlbMatchup — canonical away/home matchup normalization.
 *
 * Accepts a raw game object (from /api/mlb/live/games) and enriches
 * with team metadata from the season model.
 */

import { getTeamProjection } from '../../../data/mlb/seasonModel';
import { getTeamMeta } from '../../../data/mlb/teamMeta';
import { getMlbEspnLogoUrl } from '../../../utils/espnMlbLogos';

/**
 * @param {Object} game - normalized game from /api/mlb/live/games
 * @returns {{ ok: boolean, matchup?: Object, reason?: string }}
 */
export function normalizeMlbMatchup(game) {
  if (!game?.teams?.away?.slug || !game?.teams?.home?.slug) {
    return { ok: false, reason: 'missing_team_slugs' };
  }

  const awaySl = game.teams.away.slug;
  const homeSl = game.teams.home.slug;

  const awayProj = getTeamProjection(awaySl);
  const homeProj = getTeamProjection(homeSl);
  const awayMeta = getTeamMeta(awaySl);
  const homeMeta = getTeamMeta(homeSl);

  const awayTeam = {
    slug: awaySl,
    name: game.teams.away.name || awayProj?.name || awaySl,
    shortName: game.teams.away.abbrev || awayProj?.abbrev || awaySl.toUpperCase(),
    logo: getMlbEspnLogoUrl(awaySl) || game.teams.away.logo || null,
    record: awayMeta?.record2025 || null,
    projectedWins: awayProj?.projectedWins ?? null,
    confidenceScore: awayProj?.confidenceScore ?? null,
    floor: awayProj?.floor ?? null,
    ceiling: awayProj?.ceiling ?? null,
    // Scoring inputs (may be null if unavailable)
    recentFormScore: null, // TODO: derive from schedule when available
    startingPitcherScore: null, // TODO: add starter data source
    runPreventionScore: null, // TODO: derive from model inputs
    offenseScore: null, // TODO: derive from model inputs
  };

  const homeTeam = {
    slug: homeSl,
    name: game.teams.home.name || homeProj?.name || homeSl,
    shortName: game.teams.home.abbrev || homeProj?.abbrev || homeSl.toUpperCase(),
    logo: getMlbEspnLogoUrl(homeSl) || game.teams.home.logo || null,
    record: homeMeta?.record2025 || null,
    projectedWins: homeProj?.projectedWins ?? null,
    confidenceScore: homeProj?.confidenceScore ?? null,
    floor: homeProj?.floor ?? null,
    ceiling: homeProj?.ceiling ?? null,
    recentFormScore: null,
    startingPitcherScore: null,
    runPreventionScore: null,
    offenseScore: null,
  };

  // Normalize market data — keep aligned to away/home orientation
  const market = {
    moneyline: {
      // game.market.moneyline is typically the home ML from the odds enricher
      away: null,
      home: game.market?.moneyline ?? null,
    },
    runLine: {
      awayLine: null,
      awayPrice: null,
      homeLine: game.market?.pregameSpread != null ? game.market.pregameSpread : null,
      homePrice: null,
    },
    total: {
      points: game.market?.pregameTotal ?? null,
      overPrice: null,
      underPrice: null,
    },
  };

  // Derive away ML from home ML if available
  if (market.moneyline.home != null) {
    market.moneyline.away = estimateOppositeML(market.moneyline.home);
  }

  // Away spread is inverse of home spread
  if (market.runLine.homeLine != null) {
    market.runLine.awayLine = -market.runLine.homeLine;
  }

  return {
    ok: true,
    matchup: {
      gameId: game.gameId || `${awaySl}-${homeSl}-${game.startTime || 'unknown'}`,
      startTime: game.startTime || null,
      awayTeam,
      homeTeam,
      market,
      status: game.status || 'upcoming',
      venue: null,
      modelEdge: game.model?.pregameEdge ?? null,
      modelConfidence: game.model?.confidence ?? null,
    },
  };
}

/**
 * Estimate opposite moneyline from one side.
 * Uses vig-adjusted approximation.
 */
function estimateOppositeML(ml) {
  if (ml == null || !isFinite(ml)) return null;
  // Convert to implied probability
  const imp = ml > 0 ? 100 / (ml + 100) : -ml / (-ml + 100);
  // Assume ~4.5% total vig → opposite implied = 1 - imp + 0.045
  const oppImp = Math.max(0.05, Math.min(0.95, 1 - imp + 0.045));
  // Convert back to American
  if (oppImp >= 0.5) {
    return Math.round(-oppImp / (1 - oppImp) * 100);
  } else {
    return Math.round((1 - oppImp) / oppImp * 100);
  }
}
