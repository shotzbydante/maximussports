/**
 * Shared builder for the active games payload used by Maximus Picks.
 *
 * Both the Home Page and the Dashboard / IG slides should derive their
 * picks game set from this function so the model sees the same universe
 * of games everywhere.
 *
 * Four-layer dedup:
 *   1. gameId dedup (catches ESPN duplicates)
 *   2. Slug-based matchup dedup (catches odds API duplicates)
 *   3. Bracket-consistency: each team appears in only ONE matchup
 *   4. Matchup integrity guard: both teams must be in tournament field
 */

import { isTournamentTeam, getTeamRegion, getTournamentPhase } from './tournamentHelpers.js';

/**
 * Build a canonical slug-based matchup key for dedup.
 */
function matchupKey(game, getSlug) {
  const home = getSlug?.(game.homeTeam) || (game.homeTeam || '').toLowerCase().trim();
  const away = getSlug?.(game.awayTeam) || (game.awayTeam || '').toLowerCase().trim();
  if (!home || !away) return null;
  return [home, away].sort().join('|');
}

/**
 * Resolve both team slugs from a game object.
 */
function resolveTeamSlugs(game, getSlug) {
  const home = getSlug?.(game.homeTeam) || null;
  const away = getSlug?.(game.awayTeam) || null;
  return { home, away };
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

  // ── Layer 1: gameId dedup + ESPN team priority ──
  // ESPN scores are the source of truth for team pairings.
  // Build a set of teams already claimed by ESPN games so that
  // odds-only games with stale pairings cannot steal team slots.
  const candidates = [...todayMerged];
  const seenIds = new Set(candidates.map((g) => g.gameId).filter(Boolean));
  const espnTeams = new Set();
  for (const g of todayMerged) {
    const hSlug = getSlug?.(g.homeTeam);
    const aSlug = getSlug?.(g.awayTeam);
    if (hSlug) espnTeams.add(hSlug);
    if (aSlug) espnTeams.add(aSlug);
  }

  for (const g of futureOdds) {
    if (g.gameId && seenIds.has(g.gameId)) continue;
    // Reject odds-only games where either team is already claimed by ESPN
    const hSlug = getSlug?.(g.homeTeam);
    const aSlug = getSlug?.(g.awayTeam);
    if ((hSlug && espnTeams.has(hSlug)) || (aSlug && espnTeams.has(aSlug))) continue;
    candidates.push(g);
    if (g.gameId) seenIds.add(g.gameId);
  }

  const extra = upcomingGamesWithSpreads.filter(
    (g) => !g.gameId || !seenIds.has(g.gameId),
  );
  if (extra.length > 0) candidates.push(...extra);

  // ── Layer 2: slug-based matchup dedup ──
  const seenMatchups = new Set();
  const matchupDeduped = [];
  for (const g of candidates) {
    const key = matchupKey(g, getSlug);
    if (key && seenMatchups.has(key)) continue;
    if (key) seenMatchups.add(key);
    matchupDeduped.push(g);
  }

  // ── Layer 3: bracket-consistency — each team appears in only ONE matchup ──
  // In a real tournament round, a team plays exactly one game.
  // If corrupted data has the same team in multiple matchups, keep only the first.
  // Priority: earlier in the array (todayScores > futureOdds > upcoming).
  const claimedTeams = new Set();
  const bracketConsistent = [];
  for (const g of matchupDeduped) {
    const { home, away } = resolveTeamSlugs(g, getSlug);
    const homeUsed = home && claimedTeams.has(home);
    const awayUsed = away && claimedTeams.has(away);

    if (homeUsed || awayUsed) {
      // Team already in another matchup — skip this game to preserve bracket integrity
      continue;
    }

    bracketConsistent.push(g);
    if (home) claimedTeams.add(home);
    if (away) claimedTeams.add(away);
  }

  // ── Layer 4: strict tournament integrity ──
  // During March Madness, enforce multiple guards:
  //   a) Both team slugs must be non-null
  //   b) Both teams must be in the NCAA men's tournament field
  //   c) During regional rounds (Sweet 16 / Elite 8), both teams must share a region
  // This catches stale odds pairings, NIT games, women's contamination,
  // and cross-round mismatches.
  let phase = 'off';
  try { phase = getTournamentPhase() || 'off'; } catch { /* ignore */ }
  const isTourneyActive = phase !== 'off' && phase !== 'pre_tournament';
  const isRegionalRound = phase === 'sweet_sixteen' || phase === 'elite_eight';

  if (isTourneyActive) {
    const validated = [];
    for (const g of bracketConsistent) {
      const hSlug = getSlug?.(g.homeTeam) || null;
      const aSlug = getSlug?.(g.awayTeam) || null;

      // Guard A: both slugs must resolve
      if (!hSlug || !aSlug) continue;

      // Guard B: both teams must be in tournament field
      if (!isTournamentTeam(hSlug) || !isTournamentTeam(aSlug)) continue;

      // Guard C: during regional rounds, both teams must share a region
      if (isRegionalRound) {
        const hRegion = getTeamRegion(hSlug);
        const aRegion = getTeamRegion(aSlug);
        if (hRegion && aRegion && hRegion !== aRegion) continue;
      }

      validated.push(g);
    }
    return validated;
  }

  return bracketConsistent;
}
