/**
 * Shared builder for the active games payload used by Maximus Picks.
 *
 * Both the Home Page and the Dashboard / IG slides should derive their
 * picks game set from this function so the model sees the same universe
 * of games everywhere.
 *
 * Inputs mirror what mergeHomeData() already exposes:
 *   todayScores          – ESPN score games for today  (dashData.scores / fast.scoresToday)
 *   oddsGames            – raw Odds API games          (dashData.odds.games)
 *   upcomingGamesWithSpreads – tomorrow ESPN+odds      (dashData.upcomingGamesWithSpreads)
 *   getSlug              – team-slug resolver           (getTeamSlug)
 *   mergeWithOdds        – mergeGamesWithOdds function
 */

/**
 * Build a canonical slug-based matchup key for dedup.
 * Uses the same identity resolution as the picks model.
 */
function matchupKey(game, getSlug) {
  const home = getSlug?.(game.homeTeam) || (game.homeTeam || '').toLowerCase().trim();
  const away = getSlug?.(game.awayTeam) || (game.awayTeam || '').toLowerCase().trim();
  if (!home || !away) return null;
  // Sort to make key order-independent (same game regardless of home/away orientation)
  return [home, away].sort().join('|');
}

export function buildActivePicksGames({
  todayScores = [],
  oddsGames = [],
  upcomingGamesWithSpreads = [],
  getSlug,
  mergeWithOdds,
}) {
  const todayMerged = mergeWithOdds
    ? mergeWithOdds(todayScores, oddsGames, getSlug)
    : todayScores;

  const scoreDates = new Set(
    todayScores.flatMap((g) => {
      const dt = g.startTime
        ? new Date(g.startTime).toISOString().slice(0, 10)
        : '';
      return dt ? [dt] : [];
    }),
  );

  const futureOdds = oddsGames.filter((og) => {
    const dt = og.commenceTime
      ? new Date(og.commenceTime).toISOString().slice(0, 10)
      : '';
    return dt && !scoreDates.has(dt);
  });

  // Build candidate list from all sources
  const candidates = [...todayMerged];
  const seenIds = new Set(candidates.map((g) => g.gameId).filter(Boolean));

  for (const g of futureOdds) {
    if (!g.gameId || !seenIds.has(g.gameId)) {
      candidates.push(g);
      if (g.gameId) seenIds.add(g.gameId);
    }
  }

  const extra = upcomingGamesWithSpreads.filter(
    (g) => !g.gameId || !seenIds.has(g.gameId),
  );
  if (extra.length > 0) candidates.push(...extra);

  // ── Slug-based dedup: prevent same matchup from appearing multiple times ──
  // This is critical because odds games often lack gameId, so the ID-based
  // dedup above doesn't catch them. Uses canonical team slugs for precision.
  const seenMatchups = new Set();
  const deduped = [];
  for (const g of candidates) {
    const key = matchupKey(g, getSlug);
    if (key && seenMatchups.has(key)) continue; // duplicate matchup
    if (key) seenMatchups.add(key);
    deduped.push(g);
  }

  return deduped;
}
