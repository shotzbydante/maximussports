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

  const base = [...todayMerged];
  const seenIds = new Set(base.map((g) => g.gameId).filter(Boolean));

  for (const g of futureOdds) {
    if (!g.gameId || !seenIds.has(g.gameId)) {
      base.push(g);
      if (g.gameId) seenIds.add(g.gameId);
    }
  }

  const extra = upcomingGamesWithSpreads.filter(
    (g) => !g.gameId || !seenIds.has(g.gameId),
  );

  return extra.length > 0 ? [...base, ...extra] : base;
}
