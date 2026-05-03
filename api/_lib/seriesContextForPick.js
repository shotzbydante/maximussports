/**
 * seriesContextForPick — resolve playoff series context for one persisted
 * pick (or one ESPN game). Used by the NBA scorecard endpoint to render
 * unambiguous row labels for repeat playoff matchups:
 *
 *   "HOU @ LAL · Fri, May 1 · West Round 1 · Game 5"
 *
 * Inputs:
 *   pick — picks-table row (away_team_slug, home_team_slug, game_id, slate_date)
 *   gameStartTimeISO — final game's startTime (ISO 8601)
 *   playoffContext — full output of buildNbaPlayoffContext({ liveGames, windowGames })
 *
 * Output (always returns an object; fields are nullable when context isn't tracked):
 *   {
 *     gameDate:           'YYYY-MM-DD' | null
 *     gameDateLabel:      'Fri, May 1' | null
 *     gameNumber:         1..7 | null    — playoff game number when matched
 *     seriesRound:        'Round 1' | 'Conference Semifinals' | 'Conference Finals' | 'NBA Finals' | null
 *     seriesRoundShort:   'West Round 1' | 'East Conf. Semis' | 'NBA Finals' | null
 *     seriesScoreSummary: 'HOU lead 3-2' | 'Series tied 2-2' | null
 *     isElimination:      boolean
 *     isGameSeven:        boolean
 *     contextLabel:       human-readable single line built from the above
 *   }
 */

import { etDayFromISO } from './dateWindows.js';

const ROUND_LONG = {
  1: 'Round 1',
  2: 'Conference Semifinals',
  3: 'Conference Finals',
  4: 'NBA Finals',
};

const ROUND_SHORT = {
  1: 'Round 1',
  2: 'Conf. Semis',
  3: 'Conf. Finals',
  4: 'NBA Finals',
};

const CONF_SHORT = {
  Eastern: 'East',
  Western: 'West',
};

function formatGameDateLabel(ymd) {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  try {
    const d = new Date(`${ymd}T12:00:00`);
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  } catch { return null; }
}

function findSeriesForTeams(awaySlug, homeSlug, playoffContext) {
  if (!playoffContext) return null;
  const sources = [
    Array.isArray(playoffContext.allSeries) ? playoffContext.allSeries : null,
    Array.isArray(playoffContext.series) ? playoffContext.series : null,
  ].filter(Boolean);
  for (const list of sources) {
    for (const s of list) {
      const a = s.topTeam?.slug || s.teamA?.slug;
      const b = s.bottomTeam?.slug || s.teamB?.slug;
      if (!a || !b) continue;
      if ((a === awaySlug && b === homeSlug) || (a === homeSlug && b === awaySlug)) return s;
    }
  }
  return null;
}

/**
 * Compute the playoff game number for a given gameStartTime within a
 * series. Counts: number of finals already played BEFORE this game's
 * startTime + 1.
 */
function gameNumberWithinSeries(series, gameStartTimeISO) {
  if (!series || !gameStartTimeISO) return null;
  const ts = new Date(gameStartTimeISO).getTime();
  if (Number.isNaN(ts)) return null;
  // playoffContext attaches `mostRecentGame` and a list of historical games
  // through the buildNbaPlayoffContext path — use the games[] when present
  // (the enricher may attach this) or fall back to seriesScore arithmetic.
  const games = Array.isArray(series.games) ? series.games
              : Array.isArray(series._games) ? series._games
              : null;
  if (Array.isArray(games)) {
    let count = 0;
    for (const g of games) {
      const gts = g?.gameDate ? new Date(g.gameDate).getTime() : null;
      if (gts != null && gts < ts) count += 1;
    }
    return count + 1;
  }
  // Fallback: total games played in the series. If gamesPlayed is N, the
  // most recent finished game IS Game N. If the lookup target is the
  // most-recent game, return N. If it's a future game, return N+1.
  const gp = series.gamesPlayed ?? null;
  const recentTs = series.mostRecentGameTs ?? null;
  if (gp == null) return null;
  if (recentTs != null && Math.abs(ts - recentTs) < 60 * 60 * 1000) return gp;
  if (recentTs != null && ts > recentTs) return gp + 1;
  return null;
}

export function seriesContextForPick({ pick, gameStartTimeISO, playoffContext }) {
  const out = {
    gameDate: null,
    gameDateLabel: null,
    gameNumber: null,
    seriesRound: null,
    seriesRoundShort: null,
    seriesScoreSummary: null,
    isElimination: false,
    isGameSeven: false,
    contextLabel: null,
  };

  out.gameDate = etDayFromISO(gameStartTimeISO) || pick?.slate_date || null;
  out.gameDateLabel = formatGameDateLabel(out.gameDate);

  const series = findSeriesForTeams(
    pick?.away_team_slug,
    pick?.home_team_slug,
    playoffContext,
  );
  if (series) {
    const round = series.round ?? null;
    out.seriesRound = round != null ? (ROUND_LONG[round] || null) : null;
    const conf = series.conference || null;
    const confShort = conf ? CONF_SHORT[conf] || null : null;
    if (round != null) {
      const r = ROUND_SHORT[round] || null;
      out.seriesRoundShort = round >= 4
        ? r                                 // "NBA Finals"
        : (confShort && r) ? `${confShort} ${r}` : r;
    }
    out.seriesScoreSummary = series.seriesScore?.summary || null;
    out.isElimination = !!series.isElimination;
    out.isGameSeven = !!series.isGameSeven;
    out.gameNumber = gameNumberWithinSeries(series, gameStartTimeISO);
  }

  // Single-line context label for the UI:
  //   "Fri, May 1 · West Round 1 · Game 5"
  // Falls back to date only when we don't have a tracked series.
  const parts = [];
  if (out.gameDateLabel) parts.push(out.gameDateLabel);
  if (out.seriesRoundShort) parts.push(out.seriesRoundShort);
  if (out.gameNumber) parts.push(`Game ${out.gameNumber}`);
  if (out.isGameSeven) parts.push('Game 7');
  out.contextLabel = parts.length ? parts.join(' · ') : null;

  return out;
}
