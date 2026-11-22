/**
 * Where a locked pick stands against the scoreboard, in plain words.
 *
 * Pure and shared: the home page uses it for picks whose games are under
 * way or over, and the weekly brief uses it so the writer never has to do
 * arithmetic on a live score.
 *
 * A pick here is the minimum needed to grade it:
 *   { market: 'total'|'runline'|'moneyline', side: 'over'|'under'|'home'|'away', line: number|null }
 * A game is the live feed's shape: teams.{home,away}.{score,abbrev}, status, gameState.
 */

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const pts = (n) => `${n} ${n === 1 ? 'point' : 'points'}`;
const tidy = (n) => (Number.isInteger(n) ? `${n}` : n.toFixed(1));

function clockText(game) {
  const gs = game?.gameState || {};
  if (gs.isHalftime) return 'at halftime';
  if (gs.periodLabel) return `at ${gs.periodLabel}`;
  return 'so far';
}

/**
 * @returns {{ state: 'upcoming'|'live'|'final', verdict: 'won'|'lost'|'push'|'ahead'|'behind'|'level'|null, text: string }}
 *   `verdict` is settled ('won'/'lost'/'push') once the result cannot change,
 *   and 'ahead'/'behind'/'level' while the game can still turn it.
 */
export function pickLiveStatus(pick, game) {
  const status = game?.status;
  if (!pick || !game || status === 'upcoming' || !status) return { state: 'upcoming', verdict: null, text: '' };
  const home = num(game.teams?.home?.score);
  const away = num(game.teams?.away?.score);
  if (home == null || away == null) return { state: status === 'final' ? 'final' : 'live', verdict: null, text: '' };
  const final = status === 'final';
  const state = final ? 'final' : 'live';
  const total = home + away;
  const when = clockText(game);
  const line = num(pick.line);

  if (pick.market === 'total' && line != null) {
    const over = pick.side === 'over';
    if (final) {
      const verdict = total === line ? 'push' : (total > line) === over ? 'won' : 'lost';
      return { state, verdict, text: `Finished with ${pts(total)} against a total of ${tidy(line)}.` };
    }
    if (total > line) {
      // The total has already gone over: an over is won and an under is lost, whatever happens next.
      return { state, verdict: over ? 'won' : 'lost', text: `${pts(total)} ${when}, already past ${tidy(line)}.` };
    }
    const room = line - total;                          // points left before the total is passed
    const most = Math.ceil(room) - 1;                   // an under survives this many more
    const need = Math.floor(room) + 1;                  // an over needs this many more
    if (over) return { state, verdict: 'behind', text: `${pts(total)} ${when}. Needs ${need} more to go over ${tidy(line)}.` };
    return {
      state,
      verdict: 'ahead',
      text: most > 0
        ? `${pts(total)} ${when}. Stays under ${tidy(line)} with ${most} or fewer more.`
        : `${pts(total)} ${when}. Any more scoring puts it over ${tidy(line)}.`,
    };
  }

  const pickedHome = pick.side === 'home';
  const us = pickedHome ? game.teams.home : game.teams.away;
  const margin = pickedHome ? home - away : away - home;   // positive when the picked team leads
  const lead = margin === 0 ? 'tied' : margin > 0 ? `up ${margin}` : `down ${-margin}`;

  if (pick.market === 'runline' && line != null) {
    const cover = margin + line;                        // positive when the pick is covering
    const lineText = `${line > 0 ? '+' : ''}${tidy(line)}`;
    if (final) {
      const verdict = cover === 0 ? 'push' : cover > 0 ? 'won' : 'lost';
      return { state, verdict, text: `${us.abbrev} finished ${lead} against ${lineText}.` };
    }
    const verdict = cover === 0 ? 'level' : cover > 0 ? 'ahead' : 'behind';
    const how = cover === 0 ? 'right on the number' : cover > 0 ? `covering by ${tidy(cover)}` : `${tidy(-cover)} short of covering`;
    return { state, verdict, text: `${us.abbrev} ${lead} ${when}, ${how} at ${lineText}.` };
  }

  if (pick.market === 'moneyline') {
    if (final) {
      const verdict = margin === 0 ? 'push' : margin > 0 ? 'won' : 'lost';
      return { state, verdict, text: `${us.abbrev} finished ${lead}.` };
    }
    const verdict = margin === 0 ? 'level' : margin > 0 ? 'ahead' : 'behind';
    return { state, verdict, text: `${us.abbrev} ${lead} ${when}.` };
  }

  return { state, verdict: null, text: '' };
}

/** How a game stands against the line it closed at, for a game with no pick on it. */
export function gameVsClose(game, close) {
  const home = num(game?.teams?.home?.score);
  const away = num(game?.teams?.away?.score);
  if (home == null || away == null || !close) return null;
  const out = {};
  const spread = num(close.spreadHome);
  if (spread != null) {
    const favHome = spread <= 0;
    const fav = favHome ? game.teams.home : game.teams.away;
    const favMargin = favHome ? home - away : away - home;
    const give = Math.abs(spread);
    const cover = favMargin - give;
    out.spread = cover === 0
      ? `${fav.abbrev} is right on the ${tidy(give)}-point number`
      : cover > 0
        ? `${fav.abbrev} is covering the ${tidy(give)} by ${tidy(cover)}`
        : favMargin < 0
          ? `${fav.abbrev}, a ${tidy(give)}-point favorite, trails by ${-favMargin}`
          : `${fav.abbrev} leads by ${favMargin} but is ${tidy(-cover)} short of covering ${tidy(give)}`;
  }
  const total = num(close.total);
  if (total != null) {
    const sum = home + away;
    out.total = sum > total
      ? `${pts(sum)} scored, already over the ${tidy(total)} total`
      : `${pts(sum)} scored against a total of ${tidy(total)}`;
  }
  return out;
}
