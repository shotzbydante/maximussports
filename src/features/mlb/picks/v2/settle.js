/**
 * Settlement — grade a single pick against a final game.
 *
 *   pick:       row from `picks` table (market_type, selection_side, line_value, away/home slugs)
 *   finalGame:  normalized ESPN final ({ teams: { away: { slug, score }, home: { slug, score } }, gameState })
 *
 * Returns { status, final_away_score, final_home_score, notes }.
 * Idempotent: settling the same (pick, final) pair twice returns the same outcome.
 *
 * Supported outcomes: won | lost | push | void | pending
 */

export function settlePick(pick, finalGame) {
  const away = finalGame?.teams?.away;
  const home = finalGame?.teams?.home;
  const awayScore = Number(away?.score ?? NaN);
  const homeScore = Number(home?.score ?? NaN);

  // Game still in flight or postponed
  const isFinal = finalGame?.gameState?.isFinal || finalGame?.status === 'final';
  if (!isFinal) {
    return { status: 'pending', final_away_score: null, final_home_score: null, notes: 'not final' };
  }
  if (!isFinite(awayScore) || !isFinite(homeScore)) {
    return { status: 'pending', final_away_score: null, final_home_score: null, notes: 'missing score' };
  }

  const margin = awayScore - homeScore;                      // positive => away won
  const total  = awayScore + homeScore;

  const common = { final_away_score: awayScore, final_home_score: homeScore };

  switch (pick.market_type) {
    case 'moneyline': {
      const side = pick.selection_side;
      if (margin === 0) return { status: 'push', ...common, notes: 'tie (rare; likely void)' };
      if (side === 'away') return { status: margin > 0 ? 'won' : 'lost', ...common, notes: '' };
      if (side === 'home') return { status: margin < 0 ? 'won' : 'lost', ...common, notes: '' };
      return { status: 'void', ...common, notes: `unknown side ${side}` };
    }
    case 'runline': {
      // Number(null) === 0 — guard explicitly against null/undefined so a
      // missing line voids instead of silently grading as if the spread
      // were 0.
      if (pick.line_value == null) return { status: 'void', ...common, notes: 'missing line' };
      const line = Number(pick.line_value);
      if (!isFinite(line)) return { status: 'void', ...common, notes: 'missing line' };
      // selection_side: 'away' means "away team covers line_value (awayLine)";
      //                 'home' means home covers line_value (homeLine)
      if (pick.selection_side === 'away') {
        // away covers if (awayScore + line) > homeScore
        const net = awayScore + line - homeScore;
        if (net === 0) return { status: 'push', ...common, notes: '' };
        return { status: net > 0 ? 'won' : 'lost', ...common, notes: '' };
      }
      if (pick.selection_side === 'home') {
        const net = homeScore + line - awayScore;
        if (net === 0) return { status: 'push', ...common, notes: '' };
        return { status: net > 0 ? 'won' : 'lost', ...common, notes: '' };
      }
      return { status: 'void', ...common, notes: `unknown side ${pick.selection_side}` };
    }
    case 'total': {
      if (pick.line_value == null) return { status: 'void', ...common, notes: 'missing line' };
      const line = Number(pick.line_value);
      if (!isFinite(line)) return { status: 'void', ...common, notes: 'missing line' };
      if (total === line) return { status: 'push', ...common, notes: '' };
      if (pick.selection_side === 'over')  return { status: total > line ? 'won' : 'lost', ...common, notes: '' };
      if (pick.selection_side === 'under') return { status: total < line ? 'won' : 'lost', ...common, notes: '' };
      return { status: 'void', ...common, notes: `unknown side ${pick.selection_side}` };
    }
    default:
      return { status: 'void', ...common, notes: `unknown market_type ${pick.market_type}` };
  }
}

/**
 * Grade all picks for a slate given a map of gameId → finalGame.
 * Skips picks that are already graded (caller supplies `alreadyGraded` set).
 */
export function gradePicks(picks, finalsByGameId, alreadyGraded = new Set()) {
  const results = [];
  for (const p of picks) {
    if (alreadyGraded.has(p.id)) continue;
    const final = finalsByGameId.get(p.game_id);
    if (!final) { results.push({ pick_id: p.id, ...{ status: 'pending', final_away_score: null, final_home_score: null, notes: 'no final found' } }); continue; }
    const r = settlePick(p, final);
    results.push({ pick_id: p.id, ...r });
  }
  return results;
}
