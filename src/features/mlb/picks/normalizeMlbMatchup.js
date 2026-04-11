/**
 * normalizeMlbMatchup — canonical away/home matchup normalization.
 *
 * Accepts a raw game object (from /api/mlb/picks/board or /api/mlb/live/games)
 * and enriches with team metadata from the season model + model inputs.
 */

import { getTeamProjection } from '../../../data/mlb/seasonModel.js';
import { getTeamMeta } from '../../../data/mlb/teamMeta.js';
import { getTeamInputs } from '../../../data/mlb/seasonModelInputs.js';
import { getMlbEspnLogoUrl } from '../../../utils/espnMlbLogos.js';

/**
 * @param {Object} game - normalized game from API
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
  const awayInputs = getTeamInputs(awaySl);
  const homeInputs = getTeamInputs(homeSl);

  const buildTeam = (sl, gameTeam, proj, meta, inputs) => ({
    slug: sl,
    name: gameTeam?.name || proj?.name || sl,
    shortName: gameTeam?.abbrev || proj?.abbrev || sl.toUpperCase(),
    logo: getMlbEspnLogoUrl(sl) || gameTeam?.logo || null,
    record: meta?.record2025 || null,
    projectedWins: proj?.projectedWins ?? null,
    confidenceScore: proj?.confidenceScore ?? null,
    floor: proj?.floor ?? null,
    ceiling: proj?.ceiling ?? null,
    // Model inputs for scoring (1-10 scale)
    topOfLineup: inputs?.topOfLineup ?? null,
    lineupDepth: inputs?.lineupDepth ?? null,
    frontlineRotation: inputs?.frontlineRotation ?? null,
    rotationDepth: inputs?.rotationDepth ?? null,
    bullpenQuality: inputs?.bullpenQuality ?? null,
    bullpenVolatility: inputs?.bullpenVolatility ?? null,
    // Derived offense/defense composite scores
    offenseScore: inputs ? (inputs.topOfLineup + inputs.lineupDepth) / 2 : null,
    runPreventionScore: inputs ? (inputs.frontlineRotation + inputs.rotationDepth + inputs.bullpenQuality) / 3 : null,
  });

  const awayTeam = buildTeam(awaySl, game.teams.away, awayProj, awayMeta, awayInputs);
  const homeTeam = buildTeam(homeSl, game.teams.home, homeProj, homeMeta, homeInputs);

  // Normalize market data — keep aligned to away/home orientation
  const market = {
    moneyline: {
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

/** Estimate opposite moneyline from one side using vig-adjusted implied prob. */
function estimateOppositeML(ml) {
  if (ml == null || !isFinite(ml)) return null;
  const imp = ml > 0 ? 100 / (ml + 100) : -ml / (-ml + 100);
  const oppImp = Math.max(0.05, Math.min(0.95, 1 - imp + 0.045));
  if (oppImp >= 0.5) return Math.round(-oppImp / (1 - oppImp) * 100);
  return Math.round((1 - oppImp) / oppImp * 100);
}
