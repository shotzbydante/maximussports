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
  PLAY_IN_TEAMS,
} from './playoffBracket.js';

/**
 * Lookup table: slug → real team metadata pulled from PLAY_IN_TEAMS.
 * Used by the placeholder-resolution pass to give a play-in winner the
 * proper name/shortName/record so downstream copy reads "76ers win
 * Game 7" instead of "PHI win Game 7".
 */
const PLAY_IN_BY_SLUG = (() => {
  const m = {};
  for (const conf of Object.values(PLAY_IN_TEAMS || {})) {
    for (const team of Object.values(conf || {})) {
      if (team?.slug) m[team.slug] = team;
    }
  }
  return m;
})();

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

/**
 * Replay the chronological games for a matchup and compute path-verified
 * series-state flags. Used to fix the comeback-narrative integrity bug:
 * the previous heuristic inferred "3-1 comeback" from the FINAL 4-3 score
 * alone — but a 4-3 series can also come from {2-0 → 2-2 → 3-2 → 3-3 →
 * 4-3} (no comeback) or {3-2 → 3-3 → 4-3} (no comeback). Game-by-game
 * replay is the only correct source.
 *
 * @param {Array} games  ordered chronological games (see countSeriesWins);
 *                       each entry has winnerSlug + loserSlug.
 * @param {string} topSlug
 * @param {string} btmSlug
 * @returns {{
 *   path: Array<{
 *     gameNumber, winnerSlug, loserSlug, winScore, loseScore,
 *     seriesAfter: { [topSlug]: number, [btmSlug]: number },
 *   }>,
 *   states: {
 *     winnerWasDown30: boolean,    // eventual winner trailed 0-3 at any point
 *     winnerWasDown31: boolean,    // eventual winner trailed 1-3 (after G4)
 *     winnerWasDown32: boolean,    // eventual winner trailed 2-3 (after G5/G6)
 *     winnerLed20: boolean,        // eventual winner led 2-0 at any point
 *     winnerLed30: boolean,        // eventual winner led 3-0 at any point
 *     winnerLed31: boolean,        // eventual winner led 3-1 at any point
 *     winnerLed32: boolean,        // eventual winner led 3-2 at any point
 *     wentGame7: boolean,          // series reached Game 7
 *     clinchedInGame7: boolean,    // winner clinched in Game 7
 *     pushedToGame7: boolean,      // series went to Game 7 from any state
 *     finalSeriesScore: { winner: number, loser: number } | null,
 *     winnerSlug: string | null,
 *     loserSlug: string | null,
 *   },
 * }}
 */
function computeSeriesPath(games, topSlug, btmSlug) {
  const path = [];
  const states = {
    winnerWasDown30: false,
    winnerWasDown31: false,
    winnerWasDown32: false,
    winnerLed20: false,
    winnerLed30: false,
    winnerLed31: false,
    winnerLed32: false,
    wentGame7: false,
    clinchedInGame7: false,
    pushedToGame7: false,
    finalSeriesScore: null,
    winnerSlug: null,
    loserSlug: null,
  };
  if (!Array.isArray(games) || games.length === 0) {
    return { path, states };
  }

  // Final series counts — used to identify the eventual winner/loser.
  let finalTop = 0, finalBtm = 0;
  for (const g of games) {
    if (g.winnerSlug === topSlug) finalTop += 1;
    else if (g.winnerSlug === btmSlug) finalBtm += 1;
  }
  const seriesIsComplete = finalTop >= 4 || finalBtm >= 4;
  const eventualWinnerSlug = finalTop > finalBtm ? topSlug : btmSlug;
  const eventualLoserSlug  = finalTop > finalBtm ? btmSlug : topSlug;

  // Replay chronologically, tracking cumulative wins for each side and
  // checking states from the EVENTUAL WINNER's perspective.
  let topWins = 0, btmWins = 0;
  for (let i = 0; i < games.length; i++) {
    const g = games[i];
    if (g.winnerSlug === topSlug) topWins += 1;
    else if (g.winnerSlug === btmSlug) btmWins += 1;

    const winnerCumulative = eventualWinnerSlug === topSlug ? topWins : btmWins;
    const loserCumulative  = eventualWinnerSlug === topSlug ? btmWins : topWins;

    // Path-verified flags: every state below requires the eventual winner
    // to actually have been at that exact (winnerCumulative, loserCumulative)
    // point in time. No inference from final score.
    if (winnerCumulative === 0 && loserCumulative === 3) states.winnerWasDown30 = true;
    if (winnerCumulative === 1 && loserCumulative === 3) states.winnerWasDown31 = true;
    if (winnerCumulative === 2 && loserCumulative === 3) states.winnerWasDown32 = true;
    if (winnerCumulative === 2 && loserCumulative === 0) states.winnerLed20 = true;
    if (winnerCumulative === 3 && loserCumulative === 0) states.winnerLed30 = true;
    if (winnerCumulative === 3 && loserCumulative === 1) states.winnerLed31 = true;
    if (winnerCumulative === 3 && loserCumulative === 2) states.winnerLed32 = true;
    if ((topWins + btmWins) === 7) states.wentGame7 = true;

    path.push({
      gameNumber: i + 1,
      winnerSlug: g.winnerSlug,
      loserSlug: g.loserSlug,
      winScore: g.winScore,
      loseScore: g.loseScore,
      seriesAfter: { [topSlug]: topWins, [btmSlug]: btmWins },
    });
  }

  states.pushedToGame7 = states.wentGame7;
  if (seriesIsComplete) {
    states.winnerSlug = eventualWinnerSlug;
    states.loserSlug = eventualLoserSlug;
    states.finalSeriesScore = {
      winner: Math.max(finalTop, finalBtm),
      loser: Math.min(finalTop, finalBtm),
    };
    states.clinchedInGame7 = states.wentGame7 && (finalTop + finalBtm) === 7;
  }
  return { path, states };
}

function seriesSummary(matchup, top, bottom) {
  const topAbbr = matchup.topTeam?.shortName || matchup.topTeam?.abbrev || matchup.topTeam?.slug?.toUpperCase() || 'TOP';
  const btmAbbr = matchup.bottomTeam?.shortName || matchup.bottomTeam?.abbrev || matchup.bottomTeam?.slug?.toUpperCase() || 'BTM';
  const played = top + bottom;
  if (played === 0) return 'Series tied 0-0';
  if (top === bottom) return `Series tied ${top}-${bottom}`;
  const winnerAbbr = top > bottom ? topAbbr : btmAbbr;
  const hi = Math.max(top, bottom);
  const lo = Math.min(top, bottom);
  // Integrity fix: a series with one side at 4 wins is COMPLETE. Saying
  // "CLE lead 4-3" after CLE has already won the series is wrong (you
  // can't lead a series you already finished). Switch verb to "won"
  // when isComplete, or "swept" for 4-0.
  if (hi >= 4) {
    if (lo === 0) return `${winnerAbbr} swept ${hi}-${lo}`;
    return `${winnerAbbr} won ${hi}-${lo}`;
  }
  return `${winnerAbbr} lead ${hi}-${lo}`;
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

/**
 * Find the next scheduled (or live) game between two team slugs from the
 * full game window. Returns the soonest non-final game, or null.
 */
function findNextGameInWindow(slugA, slugB, allGames) {
  if (!slugA || !slugB || !Array.isArray(allGames)) return null;
  const now = Date.now();
  const candidates = allGames.filter(g => {
    if (g?.gameState?.isFinal || g?.status === 'final') return false;
    const a = g?.teams?.away?.slug;
    const h = g?.teams?.home?.slug;
    if (!a || !h) return false;
    return (a === slugA && h === slugB) || (a === slugB && h === slugA);
  });
  if (candidates.length === 0) return null;
  candidates.sort((x, y) => {
    const xd = x.startTime ? new Date(x.startTime).getTime() : 0;
    const yd = y.startTime ? new Date(y.startTime).getTime() : 0;
    return xd - yd;
  });
  // Prefer the earliest UPCOMING game, but if it's already in the past
  // (live or stale) include it so we still surface "Game N tonight".
  return candidates[0] || null;
}

/** Build a view-model for one bracket matchup enriched with live series data. */
function enrichMatchup(matchup, finalGames, allGames = []) {
  const { top, bottom, games } = countSeriesWins(matchup, finalGames);
  const { isElimination, eliminationFor, eliminationLabel } = computeElimination(top, bottom);
  const gamesPlayed = top + bottom;

  // Path-verified series-state flags. Replays the chronological games
  // and answers questions the final-score heuristic cannot:
  //   - Was the winner ever down 3-1?
  //   - Did they lead 2-0 / 3-2 first?
  //   - Did the series go the distance?
  // Used by the narrative layer to decide between "complete the 3-1
  // comeback" (verified) and "survive in Game 7" (any other 4-3 path).
  const seriesPath = computeSeriesPath(games, matchup.topTeam?.slug, matchup.bottomTeam?.slug);

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

  // Series state derivations (Phase B: real playoff state, not just bracket seeds)
  //   - isComplete:  one side reached 4 wins → series decided
  //   - winner/loser: derived from 4-win threshold
  //   - isClincher:   the most-recent final IS the winning game
  //   - mostRecentGameTs: epoch ms of the most-recent final, used by HOTP
  //                      to prioritize "last 24-48 hr" outcomes
  //   - nextGame / nextGameNumber: from upcoming/live games in the window
  //   - isStalePlaceholder: the bracket has both teams resolved but neither
  //                         a played game nor an upcoming game exists in the
  //                         window — i.e. we have no real signal for this
  //                         matchup yet. HOTP/contender lists exclude these.
  const isComplete = top >= 4 || bottom >= 4;
  const winnerSide = top >= 4 ? 'top' : bottom >= 4 ? 'bottom' : null;
  const winnerSlug = winnerSide === 'top' ? matchup.topTeam?.slug
    : winnerSide === 'bottom' ? matchup.bottomTeam?.slug
    : null;
  const loserSlug = winnerSide === 'top' ? matchup.bottomTeam?.slug
    : winnerSide === 'bottom' ? matchup.topTeam?.slug
    : null;

  const mostRecent = games.length > 0 ? games[games.length - 1] : null;
  const mostRecentGameTs = mostRecent?.gameDate ? new Date(mostRecent.gameDate).getTime() : null;
  const isClincher = isComplete && mostRecent && (
    (winnerSide === 'top' && mostRecent.winnerSlug === matchup.topTeam?.slug) ||
    (winnerSide === 'bottom' && mostRecent.winnerSlug === matchup.bottomTeam?.slug)
  );

  const slugA = matchup.topTeam?.slug;
  const slugB = matchup.bottomTeam?.slug;
  const next = findNextGameInWindow(slugA, slugB, allGames);
  const nextGameNumber = next ? gamesPlayed + 1 : null;

  // ── New series flags (Phase B: data-accuracy upgrade) ───────────
  //   isCloseoutGame:     not complete + leading team has 3 wins
  //                       (a single win away from clinching the series)
  //   isGameSeven:        the next scheduled game would be Game 7
  //   isSwingGame:        series tied 1-1 or 2-2; next game tilts the
  //                       series leverage decisively
  const isCloseoutGame = !isComplete && (top === 3 || bottom === 3);
  const isGameSeven = !isComplete && nextGameNumber === 7;
  const isSwingGame = !isComplete && top === bottom && (top === 1 || top === 2) && !!next;

  // Stale placeholder detection: bracket has both teams resolved but no
  // games (final OR scheduled) reference this matchup. This covers the
  // "Round 1 OKC vs Play-In Winner — series tied 0-0, pivot game up next"
  // bug from the audit screenshots: those static placeholders haven't
  // been seen in live data so we should NOT promote them in HOTP.
  const bothTeamsResolved = !matchup.topTeam?.isPlaceholder && !matchup.bottomTeam?.isPlaceholder
    && !!slugA && !!slugB;
  const hasAnyGameSignal = gamesPlayed > 0 || !!next;
  const isStalePlaceholder = !bothTeamsResolved || !hasAnyGameSignal;

  const topTeam = matchup.topTeam ? {
    slug: matchup.topTeam.slug,
    name: matchup.topTeam.name,
    abbrev: matchup.topTeam.shortName || matchup.topTeam.abbrev || matchup.topTeam.slug?.toUpperCase() || null,
    seed: topSeed,
    record: matchup.topTeam.record || null,
    wins: top,
    isPlaceholder: !!matchup.topTeam.isPlaceholder,
  } : null;
  const bottomTeam = matchup.bottomTeam ? {
    slug: matchup.bottomTeam.slug,
    name: matchup.bottomTeam.name,
    abbrev: matchup.bottomTeam.shortName || matchup.bottomTeam.abbrev || matchup.bottomTeam.slug?.toUpperCase() || null,
    seed: btmSeed,
    record: matchup.bottomTeam.record || null,
    wins: bottom,
    isPlaceholder: !!matchup.bottomTeam.isPlaceholder,
  } : null;

  // ── Diagnostic log per series ───────────────────────────────────
  // Emits the EXACT games counted into the series score so future
  // wrong-score bugs (e.g. "HOU lead 2-1" when truth is "LAL lead 3-2")
  // are diagnosable straight from the browser/server console without
  // needing to instrument the failing run.
  //
  // ALWAYS emits — including 0-0 series — so we can see "I have no
  // games for this matchup" cases (= window too short / ESPN gap)
  // separately from "I see the games but counted them wrong" cases.
  if (typeof console !== 'undefined' && bothTeamsResolved) {
    const aAbbr = matchup.topTeam?.shortName || matchup.topTeam?.abbrev || matchup.topTeam?.slug?.toUpperCase() || '???';
    const bAbbr = matchup.bottomTeam?.shortName || matchup.bottomTeam?.abbrev || matchup.bottomTeam?.slug?.toUpperCase() || '???';
    console.log('[NBA_SERIES_DEBUG]', JSON.stringify({
      matchup: `${aAbbr} vs ${bAbbr}`,
      gamesCounted: games.length,
      countedGames: games.map(g => ({
        id: g.gameId,
        date: g.gameDate,
        winner: g.winnerSlug,
        loser: g.loserSlug,
        score: `${g.winScore}-${g.loseScore}`,
      })),
      winsA: top,
      winsB: bottom,
      leaderText: top === bottom
        ? (top === 0 ? 'no games yet' : `tied ${top}-${bottom}`)
        : (top > bottom ? `${aAbbr} leads ${top}-${bottom}` : `${bAbbr} leads ${bottom}-${top}`),
      hasNextGame: !!next,
      isStalePlaceholder,
      isComplete,
      isClincher: !!isClincher,
      isCloseoutGame,
      isGameSeven,
      isSwingGame,
    }));
    // Series-path integrity log (audit Part 6). Always emit when both
    // teams resolved — gives a single line of game-by-game truth +
    // states for every series, so a future "where did the comeback
    // claim come from?" question can be answered from logs alone.
    console.log('[NBA_SERIES_PATH_RESOLVED]', JSON.stringify({
      matchup: `${aAbbr} vs ${bAbbr}`,
      gameCount: seriesPath.path.length,
      path: seriesPath.path.map(p => ({
        g: p.gameNumber,
        win: p.winnerSlug,
        score: `${p.winScore}-${p.loseScore}`,
        state: `${aAbbr} ${p.seriesAfter[matchup.topTeam?.slug] ?? 0}, ${bAbbr} ${p.seriesAfter[matchup.bottomTeam?.slug] ?? 0}`,
      })),
      states: seriesPath.states,
    }));
  }

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
    isComplete,
    winnerSlug,
    loserSlug,
    isClincher: !!isClincher,
    isCloseoutGame,
    isGameSeven,
    isSwingGame,
    mostRecentGame: mostRecent,
    mostRecentGameTs,
    nextGame: next,
    nextGameNumber,
    isStalePlaceholder,
    // Path-verified series state (audit Part 1 fix). Narrative builders
    // MUST read flags from `seriesStates` instead of inferring from
    // final-score shape. `seriesPath` is the per-game chronology that
    // backs the flags.
    seriesPath: seriesPath.path,
    seriesStates: seriesPath.states,
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
 * @param {Array}  opts.liveGames     — today-only games (back-compat)
 * @param {Array}  [opts.windowGames] — wider game window from
 *                                       fetchNbaPlayoffScheduleWindow().
 *                                       When supplied, series state is
 *                                       computed from this set so we
 *                                       see real wins from past days.
 * @param {object} [opts.bracket]     — defaults to NBA_PLAYOFF_BRACKET
 *
 * Returns the existing shape PLUS:
 *   recentFinals          — finals in the last 48hr (sorted newest first)
 *   todayGames            — non-final games scheduled today
 *   completedSeries       — series with isComplete: true
 *   activeNonStaleSeries  — series excluding isStalePlaceholder rows
 */
export function buildNbaPlayoffContext({ liveGames = [], windowGames = null, bracket = NBA_PLAYOFF_BRACKET } = {}) {
  // Combine: live (today) is authoritative for "live now"; window covers
  // last N days. Dedupe by gameId.
  const seen = new Set();
  const allGames = [];
  for (const g of [...(windowGames || []), ...(liveGames || [])]) {
    if (!g?.gameId || seen.has(g.gameId)) continue;
    seen.add(g.gameId);
    allGames.push(g);
  }

  const finals = allGames.filter(g =>
    g?.gameState?.isFinal || lower(g?.status) === 'final'
  );

  // Round 1 matchups are authoritative in the static bracket.
  // CLONE so placeholder resolution below doesn't mutate the imported
  // module-level constant.
  const round1 = [
    ...(bracket?.western?.matchups || []),
    ...(bracket?.eastern?.matchups || []),
  ].map(m => ({ ...m, topTeam: { ...m.topTeam }, bottomTeam: { ...m.bottomTeam } }));

  // ── Placeholder resolution pass ────────────────────────────────────
  // The static bracket carries Play-In-Winner placeholders (e.g.
  // "BOS vs Play-In Winner"). When real games show BOS playing PHI,
  // those games are invisible to the rest of the pipeline because the
  // bracket's placeholder slot has slug=null. Resolve placeholders by
  // scanning finals: if a bracket-anchored team has played consistently
  // against a single non-bracket opponent, that opponent IS the
  // play-in winner.
  const resolvedTeamCache = new Map();
  function resolvePlaceholderOpponent(matchup) {
    const topPh = !!matchup.topTeam?.isPlaceholder;
    const botPh = !!matchup.bottomTeam?.isPlaceholder;
    if (!topPh && !botPh) return; // nothing to resolve
    const anchor = topPh ? matchup.bottomTeam : matchup.topTeam;
    if (!anchor?.slug) return;
    const cacheKey = anchor.slug;
    if (resolvedTeamCache.has(cacheKey)) {
      const opponent = resolvedTeamCache.get(cacheKey);
      if (opponent) applyOpponent(matchup, topPh, opponent);
      return;
    }
    // Find the most-frequent non-anchor opponent in finals against
    // this anchor. We don't worry about play-in confusion here —
    // bracket-anchored teams in Round 1 only face their R1 opponent.
    const opponentCounts = new Map();
    for (const g of finals) {
      const a = g?.teams?.away?.slug;
      const h = g?.teams?.home?.slug;
      if (!a || !h) continue;
      let other = null;
      if (a === anchor.slug) other = h;
      else if (h === anchor.slug) other = a;
      if (!other || other === anchor.slug) continue;
      opponentCounts.set(other, (opponentCounts.get(other) || 0) + 1);
    }
    let best = null;
    let bestCount = 0;
    for (const [slug, n] of opponentCounts) {
      if (n > bestCount) { best = slug; bestCount = n; }
    }
    if (!best || bestCount === 0) {
      resolvedTeamCache.set(cacheKey, null);
      return;
    }
    // Build a resolved team object using PLAY_IN_TEAMS metadata when
    // available — gives downstream copy "76ers" instead of "PHI" for
    // a play-in winner. Falls back to slug-derived shape if the
    // resolved opponent isn't in the play-in pool (rare edge case).
    const meta = PLAY_IN_BY_SLUG[best];
    const slotSeed = matchup.topTeam?.isPlaceholder ? matchup.topTeam.seed : matchup.bottomTeam.seed;
    const resolved = meta
      ? { ...meta, seed: slotSeed, isPlaceholder: false, _resolvedFromPlayInGames: true }
      : {
          seed: slotSeed,
          slug: best,
          teamId: best,
          name: best.toUpperCase(),
          shortName: best.toUpperCase(),
          record: null,
          logo: null,
          isPlaceholder: false,
          _resolvedFromPlayInGames: true,
        };
    resolvedTeamCache.set(cacheKey, resolved);
    applyOpponent(matchup, topPh, resolved);
  }
  function applyOpponent(matchup, topIsPh, resolved) {
    if (topIsPh) matchup.topTeam = resolved;
    else matchup.bottomTeam = resolved;
  }
  for (const m of round1) resolvePlaceholderOpponent(m);

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
  const enrichedSeries = allMatchups.map(m => enrichMatchup(m, finals, allGames));

  const roundNumber = computeActiveRound(enrichedSeries);
  const round = ROUND_LABEL[roundNumber] || 'Round 1';

  // Only report series that are in the active round (avoids echoing R2+
  // placeholders during R1).
  const activeSeries = enrichedSeries.filter(s => s.round === roundNumber);
  const activeNonStaleSeries = activeSeries.filter(s => !s.isStalePlaceholder);

  const eliminationGames = activeNonStaleSeries.filter(s => s.isElimination);
  const upsetWatch       = activeNonStaleSeries.filter(s => s.isUpset);
  const sweepWatch       = activeNonStaleSeries.filter(s => s.sweepThreat);
  const completedSeries  = activeNonStaleSeries.filter(s => s.isComplete);

  // Recent finals (last 48hr) sorted newest-first — drives HOTP "what
  // happened last night" prioritization.
  const cutoff = Date.now() - 48 * 60 * 60 * 1000;
  const recentFinals = finals
    .filter(g => g.startTime && new Date(g.startTime).getTime() >= cutoff)
    .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());

  // Today's scheduled (non-final, non-live OR live-now) games — drives
  // "elimination tonight" / "Game N tonight" framing.
  const todayKey = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
  const todayGames = allGames.filter(g => {
    if (g?.gameState?.isFinal || g?.status === 'final') return false;
    if (!g?.startTime) return false;
    try {
      const localDay = new Date(g.startTime).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
      return localDay === todayKey;
    } catch { return false; }
  });

  // Cross-round bookkeeping (audit Part 5): expose every enriched
  // series — including completed prior-round series — so the active-
  // team derivation can include winners that have already advanced.
  // Without this, when Round 2 starts the Round-1 winners would
  // disappear from `series` (filtered to current round) and Slide 3
  // would lose Boston / OKC / etc.
  const allSeries = enrichedSeries.filter(s => !s.isStalePlaceholder);
  const completedSeriesAllRounds = allSeries.filter(s => s.isComplete);

  return {
    round,
    roundNumber,
    series: activeNonStaleSeries,    // EXCLUDES stale placeholders by default (current round only)
    seriesAll: activeSeries,          // back-compat: includes stale rows for any caller that needs them
    allSeries,                        // NEW: all rounds, no-stale, all enriched
    completedSeriesAllRounds,         // NEW: any completed series across all rounds
    eliminationGames,
    upsetWatch,
    sweepWatch,
    completedSeries,
    recentFinals,
    todayGames,
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
