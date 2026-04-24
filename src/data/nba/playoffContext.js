/**
 * NBA Playoff Context — derives live playoff state from the static bracket
 * (src/data/nba/playoffBracket.js) + live game results.
 *
 * This is the canonical source for playoff framing used by the NBA Daily
 * Briefing. It mirrors the MLB `whyItMatters` + `buildMlbDailyHeadline`
 * contract: every "story" surfaced by the briefing engine carries a
 * `playoffSignal` attached here (series score, elimination pressure, upset
 * flag) so downstream builders never have to re-derive playoff state.
 *
 * Contract:
 *   buildNbaPlayoffContext({ liveGames, bracket? }) →
 *     {
 *       round: 'Round 1' | 'Conference Semifinals' | 'Conference Finals' | 'NBA Finals',
 *       roundNumber: 1 | 2 | 3 | 4,
 *       series: [{
 *         matchupId, conference, round,
 *         topTeam:    { slug, name, abbrev, seed, record, wins },
 *         bottomTeam: { slug, name, abbrev, seed, record, wins },
 *         seriesScore:   { top, bottom, summary },   // e.g. "BOS leads 2-1"
 *         gamesPlayed:   N,
 *         leader:        'top' | 'bottom' | 'tied',
 *         isElimination: boolean,                    // next game could end the series
 *         eliminationFor:'top' | 'bottom' | null,    // which team faces elimination
 *         eliminationLabel: 'Game 4 (closeout)' | 'Game 5 (elim)' | null,
 *         isUpset:       boolean,                    // lower seed currently ahead
 *         upsetLabel:    '(X)-seed leading (Y)' | null,
 *         sweepThreat:   boolean,
 *         mostRecentGame:{ winnerSlug, loserSlug, winScore, loseScore, gameDate } | null,
 *       }, ...],
 *       eliminationGames: Series[],   // series where next game can end it
 *       upsetWatch:       Series[],   // series where lower seed is currently leading
 *       sweepWatch:       Series[],   // series at 3-0 with a potential sweep pending
 *     }
 *
 * No HTTP, no server — pure deriver. Safe to import in both API routes and
 * React components.
 */

import {
  NBA_PLAYOFF_BRACKET,
  buildFullNbaBracket,
} from './playoffBracket.js';

const ROUND_LABEL = {
  1: 'Round 1',
  2: 'Conference Semifinals',
  3: 'Conference Finals',
  4: 'NBA Finals',
};

const CONF_SHORT = {
  Eastern: 'East',
  Western: 'West',
};

function lower(s) { return typeof s === 'string' ? s.toLowerCase() : ''; }

function teamMatches(team, slug) {
  if (!team || !slug) return false;
  return team.slug === slug || team.teamId === slug;
}

/**
 * For a given matchup, find all final games between these two teams and
 * count wins per side.
 */
function countSeriesWins(matchup, finalGames) {
  if (!matchup) return { top: 0, bottom: 0, games: [] };
  const topSlug = matchup.topTeam?.slug;
  const btmSlug = matchup.bottomTeam?.slug;
  if (!topSlug || !btmSlug) return { top: 0, bottom: 0, games: [] };

  const games = [];
  let top = 0, bottom = 0;

  for (const g of finalGames) {
    const away = g.teams?.away || {};
    const home = g.teams?.home || {};
    const awaySlug = away.slug;
    const homeSlug = home.slug;
    if (!awaySlug || !homeSlug) continue;

    // Only count games between these exact two teams
    const involved =
      (awaySlug === topSlug && homeSlug === btmSlug) ||
      (awaySlug === btmSlug && homeSlug === topSlug);
    if (!involved) continue;

    const awayScore = Number(away.score ?? 0);
    const homeScore = Number(home.score ?? 0);
    if (awayScore === 0 && homeScore === 0) continue; // no score yet

    const winnerSlug = awayScore > homeScore ? awaySlug : homeSlug;
    const loserSlug  = awayScore > homeScore ? homeSlug : awaySlug;
    const winScore   = Math.max(awayScore, homeScore);
    const loseScore  = Math.min(awayScore, homeScore);

    if (winnerSlug === topSlug) top += 1;
    else if (winnerSlug === btmSlug) bottom += 1;

    games.push({
      gameId: g.gameId,
      gameDate: g.startTime || null,
      winnerSlug,
      loserSlug,
      winScore,
      loseScore,
    });
  }

  // Sort games oldest → newest so mostRecentGame is deterministic
  games.sort((a, b) => {
    const ad = a.gameDate ? new Date(a.gameDate).getTime() : 0;
    const bd = b.gameDate ? new Date(b.gameDate).getTime() : 0;
    return ad - bd;
  });

  return { top, bottom, games };
}

function seriesSummary(matchup, top, bottom) {
  const topAbbr = matchup.topTeam?.shortName || matchup.topTeam?.abbrev || matchup.topTeam?.slug?.toUpperCase() || 'TOP';
  const btmAbbr = matchup.bottomTeam?.shortName || matchup.bottomTeam?.abbrev || matchup.bottomTeam?.slug?.toUpperCase() || 'BTM';
  const played = top + bottom;
  if (played === 0) return 'Series tied 0-0';
  if (top === bottom) return `Series tied ${top}-${bottom}`;
  const leader = top > bottom ? topAbbr : btmAbbr;
  const hi = Math.max(top, bottom);
  const lo = Math.min(top, bottom);
  // Plural verb form is natural for both abbreviations ("TOR lead 2-1")
  // and nicknames ("Raptors lead 2-1"), and avoids subject-verb errors
  // when downstream copy interpolates a team name here.
  return `${leader} lead ${hi}-${lo}`;
}

/**
 * Elimination math for a best-of-7.
 * Returns { isElimination, eliminationFor, eliminationLabel }
 *   - isElimination: the NEXT game could end the series
 *   - eliminationFor: which side faces elimination (the team with fewer wins)
 *   - eliminationLabel: descriptor ('Game 5 (elim)', 'Game 7 (winner-take-all)', etc.)
 */
function computeElimination(top, bottom) {
  const played = top + bottom;
  const leaderWins = Math.max(top, bottom);
  const trailerWins = Math.min(top, bottom);

  // Leader already won the series
  if (leaderWins >= 4) {
    return { isElimination: false, eliminationFor: null, eliminationLabel: null };
  }
  // 3 wins by anyone means next game is an elimination game for the other side
  if (leaderWins === 3) {
    const eliminationFor = top < bottom ? 'top' : 'bottom';
    const nextGameNum = played + 1;
    if (trailerWins === 0) {
      return { isElimination: true, eliminationFor, eliminationLabel: `Game ${nextGameNum} (sweep)` };
    }
    if (trailerWins === 3) {
      return { isElimination: true, eliminationFor, eliminationLabel: 'Game 7 (winner-take-all)' };
    }
    return { isElimination: true, eliminationFor, eliminationLabel: `Game ${nextGameNum} (elim)` };
  }
  return { isElimination: false, eliminationFor: null, eliminationLabel: null };
}

/** Build a view-model for one bracket matchup enriched with live series data. */
function enrichMatchup(matchup, finalGames) {
  const { top, bottom, games } = countSeriesWins(matchup, finalGames);
  const { isElimination, eliminationFor, eliminationLabel } = computeElimination(top, bottom);
  const gamesPlayed = top + bottom;

  const topSeed = matchup.topTeam?.seed ?? null;
  const btmSeed = matchup.bottomTeam?.seed ?? null;

  // Upset: lower seed (higher number) currently has more wins
  let isUpset = false;
  let upsetLabel = null;
  if (topSeed != null && btmSeed != null && gamesPlayed > 0 && top !== bottom) {
    const leaderIsTop = top > bottom;
    const leaderSeed = leaderIsTop ? topSeed : btmSeed;
    const trailerSeed = leaderIsTop ? btmSeed : topSeed;
    if (leaderSeed > trailerSeed) {
      isUpset = true;
      upsetLabel = `(${leaderSeed})-seed leading (${trailerSeed})`;
    }
  }

  const sweepThreat = (top === 3 && bottom === 0) || (bottom === 3 && top === 0);

  let leader = 'tied';
  if (top > bottom) leader = 'top';
  else if (bottom > top) leader = 'bottom';

  const mostRecent = games.length > 0 ? games[games.length - 1] : null;

  const topTeam = matchup.topTeam ? {
    slug: matchup.topTeam.slug,
    name: matchup.topTeam.name,
    abbrev: matchup.topTeam.shortName || matchup.topTeam.abbrev || matchup.topTeam.slug?.toUpperCase() || null,
    seed: topSeed,
    record: matchup.topTeam.record || null,
    wins: top,
  } : null;
  const bottomTeam = matchup.bottomTeam ? {
    slug: matchup.bottomTeam.slug,
    name: matchup.bottomTeam.name,
    abbrev: matchup.bottomTeam.shortName || matchup.bottomTeam.abbrev || matchup.bottomTeam.slug?.toUpperCase() || null,
    seed: btmSeed,
    record: matchup.bottomTeam.record || null,
    wins: bottom,
  } : null;

  return {
    matchupId: matchup.matchupId,
    conference: matchup.conference,
    round: matchup.round,
    topTeam,
    bottomTeam,
    seriesScore: {
      top,
      bottom,
      summary: seriesSummary(matchup, top, bottom),
    },
    gamesPlayed,
    leader,
    isElimination,
    eliminationFor,
    eliminationLabel,
    isUpset,
    upsetLabel,
    sweepThreat,
    mostRecentGame: mostRecent,
  };
}

/**
 * Determine the active round from bracket state.
 * A round is "active" when at least one of its series still has <4 wins on
 * both sides AND at least one game has been played. If no round 1 games
 * have finals yet, we still report Round 1 (the default playoff framing).
 */
function computeActiveRound(enrichedSeries) {
  if (!enrichedSeries || enrichedSeries.length === 0) return 1;

  let maxActive = 1;
  for (const s of enrichedSeries) {
    const decided = s.seriesScore.top >= 4 || s.seriesScore.bottom >= 4;
    if (!decided && s.gamesPlayed >= 0 && s.round > maxActive) {
      maxActive = s.round;
    }
  }
  return maxActive;
}

/**
 * Main builder.
 *
 * @param {object} opts
 * @param {Array}  opts.liveGames  — output of /api/nba/live/games (or similar)
 * @param {object} [opts.bracket]  — defaults to NBA_PLAYOFF_BRACKET
 */
export function buildNbaPlayoffContext({ liveGames = [], bracket = NBA_PLAYOFF_BRACKET } = {}) {
  const finals = (liveGames || []).filter(g =>
    g?.gameState?.isFinal || lower(g?.status) === 'final'
  );

  // Round 1 matchups are authoritative in the static bracket.
  const round1 = [
    ...(bracket?.western?.matchups || []),
    ...(bracket?.eastern?.matchups || []),
  ];

  // Include scaffold rounds (R2, R3, Finals) so we can report when those
  // series activate. buildFullNbaBracket returns the full map; we only use
  // matchups where both teams are resolved (not placeholders).
  const full = buildFullNbaBracket(bracket);
  const laterRounds = Object.values(full).filter(m =>
    m.round >= 2 &&
    m.topTeam && !m.topTeam.isPlaceholder &&
    m.bottomTeam && !m.bottomTeam.isPlaceholder
  );

  const allMatchups = [...round1, ...laterRounds];
  const enrichedSeries = allMatchups.map(m => enrichMatchup(m, finals));

  const roundNumber = computeActiveRound(enrichedSeries);
  const round = ROUND_LABEL[roundNumber] || 'Round 1';

  // Only report series that are in the active round (avoids echoing R2+
  // placeholders during R1).
  const activeSeries = enrichedSeries.filter(s => s.round === roundNumber);

  const eliminationGames = activeSeries.filter(s => s.isElimination);
  const upsetWatch       = activeSeries.filter(s => s.isUpset);
  const sweepWatch       = activeSeries.filter(s => s.sweepThreat);

  return {
    round,
    roundNumber,
    series: activeSeries,
    eliminationGames,
    upsetWatch,
    sweepWatch,
  };
}

/**
 * Look up the series a game belongs to, given the playoff context.
 * Returns { series, sideWinning, gameInSeriesLabel } or null if the game
 * isn't part of a tracked playoff series.
 */
export function findSeriesForGame(game, context) {
  if (!game || !context?.series) return null;
  const awaySlug = game?.teams?.away?.slug;
  const homeSlug = game?.teams?.home?.slug;
  if (!awaySlug || !homeSlug) return null;

  for (const s of context.series) {
    const topSlug = s.topTeam?.slug;
    const btmSlug = s.bottomTeam?.slug;
    if (!topSlug || !btmSlug) continue;
    const matches =
      (topSlug === awaySlug && btmSlug === homeSlug) ||
      (topSlug === homeSlug && btmSlug === awaySlug);
    if (!matches) continue;

    const gameInSeries = s.gamesPlayed + 1;
    return { series: s, gameInSeriesLabel: `Game ${gameInSeries}` };
  }
  return null;
}

export default buildNbaPlayoffContext;
export { ROUND_LABEL, CONF_SHORT };
