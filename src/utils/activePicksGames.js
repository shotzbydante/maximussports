/**
 * Shared builder for the active games payload used by Maximus Picks.
 *
 * Architecture:
 *   During March Madness → BRACKET-FIRST
 *     Seeds from canonical bracket matchups, then enriches with odds.
 *     Feed-only games CANNOT create new matchups.
 *   Outside March Madness → FEED-FIRST (original behavior)
 *     Assembles from ESPN scores + Odds API, deduped.
 */

import { isTournamentTeam, getTournamentPhase } from './tournamentHelpers.js';
import { CURRENT_MATCHUPS } from '../data/currentBracketMatchups.js';

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
 * BRACKET-FIRST mode: Build canonical games from official bracket matchups,
 * then enrich with odds/spreads/totals from feeds.
 */
function buildBracketFirstGames({ todayScores, oddsGames, getSlug, mergeWithOdds }) {
  // Step 1: Create canonical game shells from bracket matchups
  const bracketGames = CURRENT_MATCHUPS.map(m => ({
    homeTeam: m.teamA,
    awayTeam: m.teamB,
    homeSlug: m.slugA,
    awaySlug: m.slugB,
    gameId: `bracket-${m.slugA}-${m.slugB}`,
    startTime: m.gameDate ? `${m.gameDate}T00:00:00Z` : null,
    _bracketSeeded: true,
  }));

  // Step 2: Build a lookup of feed games by matchup key for enrichment
  const allFeedGames = [...(todayScores || []), ...(oddsGames || [])];
  const feedByKey = {};
  for (const fg of allFeedGames) {
    const hSlug = getSlug?.(fg.homeTeam) || null;
    const aSlug = getSlug?.(fg.awayTeam) || null;
    if (!hSlug || !aSlug) continue;
    const key = [hSlug, aSlug].sort().join('|');
    // Prefer ESPN (has gameId with numbers) over odds-only
    const existing = feedByKey[key];
    const isEspn = fg.gameId && /^\d+$/.test(String(fg.gameId));
    if (!existing || isEspn) {
      feedByKey[key] = fg;
    }
  }

  // Step 3: Enrich bracket games with feed data (odds, spreads, totals, times)
  const enriched = bracketGames.map(bg => {
    const key = [bg.homeSlug, bg.awaySlug].sort().join('|');
    const feed = feedByKey[key];
    if (!feed) return bg; // No feed data — keep bracket shell with partial data

    // Merge: use feed's rich data but keep bracket's team identity
    return {
      ...feed,
      // Preserve bracket canonical identity
      homeTeam: bg.homeTeam,
      awayTeam: bg.awayTeam,
      homeSlug: bg.homeSlug,
      awaySlug: bg.awaySlug,
      // Use feed's game metadata
      gameId: feed.gameId || bg.gameId,
      startTime: feed.startTime || feed.commenceTime || bg.startTime,
      // Keep spread/odds from feed
      spread: feed.spread ?? feed.homeSpread ?? null,
      homeSpread: feed.homeSpread ?? null,
      awaySpread: feed.awaySpread ?? null,
      total: feed.total ?? null,
      moneyline: feed.moneyline ?? null,
      overPrice: feed.overPrice ?? null,
      underPrice: feed.underPrice ?? null,
      // Track enrichment
      _bracketSeeded: true,
      _enrichedFromFeed: true,
    };
  });

  // Step 4: If mergeWithOdds helper is available, do a final pass to attach
  // any odds data that matched by team name (catches format variations)
  if (mergeWithOdds && oddsGames?.length) {
    return mergeWithOdds(enriched, oddsGames, getSlug);
  }

  return enriched;
}

/**
 * FEED-FIRST mode: Original behavior for non-tournament use.
 */
function buildFeedFirstGames({ todayScores, oddsGames, upcomingGamesWithSpreads, getSlug, mergeWithOdds }) {
  const todayMerged = mergeWithOdds
    ? mergeWithOdds(todayScores, oddsGames, getSlug)
    : todayScores;

  const scoreDates = new Set(
    todayScores.flatMap((g) => {
      const dt = g.startTime ? new Date(g.startTime).toISOString().slice(0, 10) : '';
      return dt ? [dt] : [];
    }),
  );

  const futureOdds = oddsGames.filter((og) => {
    const dt = og.commenceTime ? new Date(og.commenceTime).toISOString().slice(0, 10) : '';
    return dt && !scoreDates.has(dt);
  });

  const candidates = [...todayMerged];
  const seenIds = new Set(candidates.map((g) => g.gameId).filter(Boolean));

  for (const g of futureOdds) {
    if (g.gameId && seenIds.has(g.gameId)) continue;
    candidates.push(g);
    if (g.gameId) seenIds.add(g.gameId);
  }

  const extra = (upcomingGamesWithSpreads || []).filter(
    (g) => !g.gameId || !seenIds.has(g.gameId),
  );
  if (extra.length > 0) candidates.push(...extra);

  // Matchup dedup
  const seenMatchups = new Set();
  const deduped = [];
  for (const g of candidates) {
    const key = matchupKey(g, getSlug);
    if (key && seenMatchups.has(key)) continue;
    if (key) seenMatchups.add(key);
    deduped.push(g);
  }

  return deduped;
}

export function buildActivePicksGames({
  todayScores = [],
  oddsGames = [],
  upcomingGamesWithSpreads = [],
  getSlug,
  mergeWithOdds,
}) {
  // Determine if we're in March Madness mode
  let phase = 'off';
  try { phase = getTournamentPhase() || 'off'; } catch { /* ignore */ }
  const isTourneyActive = phase !== 'off' && phase !== 'pre_tournament';

  if (isTourneyActive && CURRENT_MATCHUPS.length > 0) {
    // BRACKET-FIRST: canonical matchups from official bracket
    return buildBracketFirstGames({ todayScores, oddsGames, getSlug, mergeWithOdds });
  }

  // FEED-FIRST: standard behavior outside tournament
  return buildFeedFirstGames({ todayScores, oddsGames, upcomingGamesWithSpreads, getSlug, mergeWithOdds });
}
