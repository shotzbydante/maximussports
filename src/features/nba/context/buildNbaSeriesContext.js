/**
 * buildNbaSeriesContext — view-model adapter over playoffContext.
 *
 * Re-projects the canonical playoff context (src/data/nba/playoffContext.js,
 * which is the source of truth for series state) into the spec'd shape
 * for narrative engines + UI consumption, and adds two derived flags:
 *   - isPivotGame:        Game 2 or Game 3 of a series tied 0-0 or 1-1
 *   - isEliminationGame:  next game can end the series (any team at 3 wins)
 * along with nextGameDate (today's scheduled live game between the same
 * two teams, when present).
 *
 * Input:
 *   buildNbaSeriesContext({ liveGames, playoffContext? })
 *
 * Output:
 *   {
 *     round,
 *     roundNumber,
 *     series: [{
 *       matchupId,
 *       teamA: { slug, name, abbrev, seed, record },
 *       teamB: { slug, name, abbrev, seed, record },
 *       winsA, winsB, gamesPlayed,
 *       leader: 'A' | 'B' | 'tied',
 *       seriesScoreSummary,
 *       nextGameDate,                       // ISO or null
 *       isPivotGame, isEliminationGame,
 *       isUpset, sweepThreat,
 *       eliminationFor, eliminationLabel,
 *     }],
 *     hasUpset,
 *     hasElimination,
 *     hasPivotGame,
 *   }
 *
 * Throws [NBA_SERIES_BUILD_FAILED] if the underlying playoff context
 * cannot be derived (per Part 6 of the audit brief).
 */

import { buildNbaPlayoffContext } from '../../../data/nba/playoffContext.js';

function asTeam(side) {
  if (!side) return null;
  return {
    slug: side.slug || null,
    name: side.name || null,
    abbrev: side.abbrev || side.slug?.toUpperCase() || null,
    seed: side.seed ?? null,
    record: side.record || null,
  };
}

function findNextGame(series, liveGames) {
  if (!series || !Array.isArray(liveGames)) return null;
  const a = series.topTeam?.slug;
  const b = series.bottomTeam?.slug;
  if (!a || !b) return null;

  const upcoming = liveGames.filter(g => {
    const status = (g?.status || '').toLowerCase();
    if (status === 'final' || status === 'live' || status === 'in_progress') return false;
    if (g?.gameState?.isFinal || g?.gameState?.isLive) return false;
    const away = g?.teams?.away?.slug;
    const home = g?.teams?.home?.slug;
    return (away === a && home === b) || (away === b && home === a);
  });

  if (upcoming.length === 0) return null;

  // Earliest first
  upcoming.sort((x, y) => {
    const xd = x.startTime ? new Date(x.startTime).getTime() : 0;
    const yd = y.startTime ? new Date(y.startTime).getTime() : 0;
    return xd - yd;
  });

  return upcoming[0]?.startTime || null;
}

function classifyPivot(winsA, winsB) {
  // Per Part 2 spec:
  //   Game 2/3 → pivot
  //   Game 4+ → pressure (not pivot)
  //   Game 6/7 → elimination (handled by computeElimination)
  const played = winsA + winsB;
  if (played === 1 || played === 2) return true;          // next is Game 2 or 3
  return false;
}

function classifyElim(winsA, winsB) {
  return winsA === 3 || winsB === 3;
}

/**
 * Build the series context view-model.
 *
 * @param {object} opts
 * @param {Array}  opts.liveGames  — output of /api/nba/live/games
 * @param {object} [opts.playoffContext] — optional override; otherwise derived
 * @returns {{ round, roundNumber, series, hasUpset, hasElimination, hasPivotGame }}
 */
export function buildNbaSeriesContext({ liveGames = [], playoffContext = null } = {}) {
  let pc;
  try {
    pc = playoffContext || buildNbaPlayoffContext({ liveGames });
  } catch (err) {
    throw new Error(`[NBA_SERIES_BUILD_FAILED] underlying playoff context threw: ${err.message}`);
  }

  if (!pc || !Array.isArray(pc.series)) {
    throw new Error('[NBA_SERIES_BUILD_FAILED] playoff context returned no series');
  }

  const series = pc.series.map(s => {
    const winsA = s.seriesScore?.top ?? 0;
    const winsB = s.seriesScore?.bottom ?? 0;
    const leader = winsA > winsB ? 'A' : winsB > winsA ? 'B' : 'tied';
    const isElimComputed = classifyElim(winsA, winsB);
    const isPivot = classifyPivot(winsA, winsB);

    return {
      matchupId: s.matchupId,
      conference: s.conference,
      round: s.round,
      teamA: asTeam(s.topTeam),
      teamB: asTeam(s.bottomTeam),
      winsA,
      winsB,
      gamesPlayed: s.gamesPlayed,
      leader,
      seriesScoreSummary: s.seriesScore?.summary || null,
      nextGameDate: findNextGame(s, liveGames),
      isPivotGame: isPivot,
      // Use the canonical playoff-context elimination flag where available;
      // fall back to the win-count check so we still surface elim state on
      // synthetic series.
      isEliminationGame: !!s.isElimination || isElimComputed,
      eliminationFor: s.eliminationFor || null,
      eliminationLabel: s.eliminationLabel || null,
      isUpset: !!s.isUpset,
      sweepThreat: !!s.sweepThreat,
      mostRecentGame: s.mostRecentGame || null,
    };
  });

  const hasUpset = series.some(s => s.isUpset);
  const hasElimination = series.some(s => s.isEliminationGame);
  const hasPivotGame = series.some(s => s.isPivotGame);

  return {
    round: pc.round,
    roundNumber: pc.roundNumber,
    series,
    hasUpset,
    hasElimination,
    hasPivotGame,
  };
}

export default buildNbaSeriesContext;
