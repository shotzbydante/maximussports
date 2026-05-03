/**
 * annotatePick — shape one persisted pick + its pick_results row into the
 * UI-facing object the NBA scorecard endpoint returns.
 *
 * Single source of truth for:
 *   - pickLabel  (e.g. "HOU +4", "LAL -8", "OVER 220.5", "BOS ML -160")
 *   - finalScore (e.g. "HOU 78 – LAL 98")
 *   - resultReason ("Covered by 3.5 points.", "Lost cover by 16.0 points.", …)
 *
 * The 2026-05-02 grading display bug ("HOU +4 ... WIN ... Covered by 24.0
 * points." for HOU losing 78–98) was caused by this function flipping the
 * `line_value` sign for the away side. `line_value` is already the
 * SIDE-SPECIFIC line at persistence time (buildNbaPicksV2 stores
 * `awayLine` for away picks and `homeLine` for home picks), so the flip
 * was incorrect. Both pickLabel AND the cover/loss math are now derived
 * directly from the persisted side-specific line.
 *
 * Cover math:
 *   teamScore = score for the picked side
 *   oppScore  = score for the opposing side
 *   adjusted  = teamScore + line_value           // spread applied to OUR side
 *   cover     = adjusted - oppScore
 *   cover > 0  → won (covered by |cover|)
 *   cover < 0  → lost (missed cover by |cover|)
 *   cover ===0 → push
 */

export function annotatePick(pick, opts = {}) {
  // pick_results joins via primary key (pick_id is PK referencing picks.id),
  // so PostgREST returns it as either an object (1-to-1) or array depending
  // on relationship inference. Handle both shapes.
  const rawResult = pick?.pick_results;
  const result = Array.isArray(rawResult) ? rawResult[0] : rawResult || null;
  const status = result?.status || 'pending';
  const awayScore = result?.final_away_score;
  const homeScore = result?.final_home_score;
  const hasFinal = awayScore != null && homeScore != null;

  const market = pick.market_type;       // 'moneyline' | 'runline' | 'total'
  const side = pick.selection_side;      // 'home'|'away'|'over'|'under'
  const line = pick.line_value;          // numeric, may be null
  const price = pick.price_american;     // moneyline price

  // Build human-readable pick label.
  // `line_value` is already the side-specific line — do NOT flip the sign
  // for the away side. (See module-level comment for the bug history.)
  let pickLabel = '';
  if (market === 'moneyline') {
    const team = side === 'home' ? pick.home_team_slug : pick.away_team_slug;
    pickLabel = `${(team || '').toUpperCase()} ML${price != null ? ` ${price > 0 ? '+' : ''}${price}` : ''}`;
  } else if (market === 'runline' || market === 'spread') {
    const team = side === 'home' ? pick.home_team_slug : pick.away_team_slug;
    const lineStr = line != null ? `${line > 0 ? '+' : ''}${line}` : '';
    pickLabel = `${(team || '').toUpperCase()} ${lineStr}`.trim();
  } else if (market === 'total') {
    const ouLabel = side === 'over' ? 'OVER' : 'UNDER';
    pickLabel = `${ouLabel} ${line != null ? line : ''}`.trim();
  }

  // Final score display + result reason text
  let finalScore = null;
  let resultReason = null;
  if (hasFinal) {
    finalScore = `${(pick.away_team_slug || '').toUpperCase()} ${awayScore} – ${(pick.home_team_slug || '').toUpperCase()} ${homeScore}`;

    if (market === 'moneyline') {
      const winner = awayScore > homeScore ? 'away' : awayScore < homeScore ? 'home' : 'tie';
      const winnerName = winner === 'away' ? pick.away_team_slug
                       : winner === 'home' ? pick.home_team_slug : null;
      if (status === 'won') resultReason = `${(winnerName || '').toUpperCase()} won outright.`;
      else if (status === 'lost') resultReason = `${(winnerName || '').toUpperCase()} won the game.`;
      else if (status === 'push') resultReason = `Game ended tied.`;
    } else if (market === 'runline' || market === 'spread') {
      const teamScore = side === 'home' ? homeScore : awayScore;
      const oppScore  = side === 'home' ? awayScore : homeScore;
      if (line != null) {
        const cover = (teamScore + line) - oppScore;
        if (status === 'won') resultReason = `Covered by ${Math.abs(cover).toFixed(1)} points.`;
        else if (status === 'lost') resultReason = `Lost cover by ${Math.abs(cover).toFixed(1)} points.`;
        else if (status === 'push') resultReason = `Margin landed exactly on the spread.`;
      }
    } else if (market === 'total') {
      const totalScore = awayScore + homeScore;
      if (line != null) {
        const diff = totalScore - line;
        if (status === 'won') resultReason = side === 'over'
          ? `Total finished ${totalScore} — over by ${diff.toFixed(1)}.`
          : `Total finished ${totalScore} — under by ${Math.abs(diff).toFixed(1)}.`;
        else if (status === 'lost') resultReason = side === 'over'
          ? `Total finished ${totalScore} — came up ${Math.abs(diff).toFixed(1)} short.`
          : `Total finished ${totalScore} — went ${diff.toFixed(1)} over.`;
        else if (status === 'push') resultReason = `Total landed exactly on the line.`;
      }
    }
  }

  // Optional series/date context (Phase 3 of the repeat-matchup audit).
  // Surfaced on every pick row so the UI can render unambiguous labels for
  // repeat playoff matchups (HOU/LAL Game 5 vs Game 6, etc.).
  const ctx = opts.seriesContext || null;

  return {
    id: pick.id,
    pickKey: pick.pick_key,
    gameId: pick.game_id,
    slateDate: pick.slate_date || null,
    awayTeam: pick.away_team_slug,
    homeTeam: pick.home_team_slug,
    matchup: `${(pick.away_team_slug || '').toUpperCase()} @ ${(pick.home_team_slug || '').toUpperCase()}`,
    marketType: market,
    selectionSide: side,
    lineValue: line,
    priceAmerican: price,
    pickLabel,
    convictionTier: pick.tier,
    betScore: pick.bet_score,
    rawEdge: pick.raw_edge,
    modelProb: pick.model_prob,
    impliedProb: pick.implied_prob,
    topSignals: pick.top_signals,
    rationale: pick.rationale,
    startTime: pick.start_time,
    status,
    finalAwayScore: awayScore,
    finalHomeScore: homeScore,
    finalScore,
    resultReason,
    // Game identity / series context (nullable when ctx is not supplied
    // or the matchup isn't a tracked playoff series).
    gameDate:           ctx?.gameDate ?? null,
    gameDateLabel:      ctx?.gameDateLabel ?? null,
    gameNumber:         ctx?.gameNumber ?? null,
    seriesRound:        ctx?.seriesRound ?? null,
    seriesRoundShort:   ctx?.seriesRoundShort ?? null,
    seriesScoreSummary: ctx?.seriesScoreSummary ?? null,
    isElimination:      !!ctx?.isElimination,
    isGameSeven:        !!ctx?.isGameSeven,
    contextLabel:       ctx?.contextLabel ?? null,
  };
}
