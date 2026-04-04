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

import { isTournamentTeam, isTournamentGame, getTournamentPhase } from './tournamentHelpers.js';
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
function buildBracketFirstGames({ todayScores, oddsGames, upcomingGamesWithSpreads, getSlug, mergeWithOdds }) {
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

  // Step 2: Build a lookup of feed games by matchup key for enrichment.
  // Use slug-based keys when available. Also index by bracket slug keys
  // so bracket games can find their feed match even when the feed uses
  // different team name formats (e.g., "Connecticut" vs "UConn").
  const allFeedGames = [...(todayScores || []), ...(oddsGames || []), ...(upcomingGamesWithSpreads || [])];
  const feedByKey = {};

  // Pre-build the set of bracket slug keys for cross-reference
  const bracketSlugKeys = new Set(
    CURRENT_MATCHUPS.map(m => [m.slugA, m.slugB].sort().join('|'))
  );

  for (const fg of allFeedGames) {
    const hSlug = getSlug?.(fg.homeTeam) || null;
    const aSlug = getSlug?.(fg.awayTeam) || null;
    if (!hSlug && !aSlug) continue; // need at least one slug

    // Try order-agnostic slug key first
    if (hSlug && aSlug) {
      const key = [hSlug, aSlug].sort().join('|');
      const existing = feedByKey[key];
      const isEspn = fg.gameId && /^\d+$/.test(String(fg.gameId));
      if (!existing || isEspn) {
        feedByKey[key] = fg;
      }
    }

    // If only one slug resolved, try matching against bracket entries directly.
    // This handles cases where the Odds API uses a name variant that only
    // partially resolves (e.g., one team resolves but the other doesn't).
    if ((!hSlug || !aSlug) && bracketSlugKeys.size > 0) {
      const resolvedSlug = hSlug || aSlug;
      for (const bKey of bracketSlugKeys) {
        if (bKey.includes(resolvedSlug) && !feedByKey[bKey]) {
          // Check if the unresolved team name partially matches the other bracket team
          const otherBracketSlug = bKey.split('|').find(s => s !== resolvedSlug);
          const unresolvedName = (!hSlug ? fg.homeTeam : fg.awayTeam) || '';
          const otherTeam = CURRENT_MATCHUPS.find(m =>
            m.slugA === otherBracketSlug || m.slugB === otherBracketSlug
          );
          if (otherTeam) {
            const otherName = otherTeam.slugA === otherBracketSlug ? otherTeam.teamA : otherTeam.teamB;
            // Check if unresolved name shares words with the bracket team name
            const unresolvedWords = unresolvedName.toLowerCase().split(/\s+/);
            const bracketWords = otherName.toLowerCase().split(/\s+/);
            const overlap = unresolvedWords.filter(w => w.length > 3 && bracketWords.includes(w));
            if (overlap.length > 0) {
              feedByKey[bKey] = fg;
            }
          }
        }
      }
    }
  }

  // Step 3: Enrich bracket games with feed data (odds, spreads, totals, times)
  // CRITICAL: Check if feed's home/away is swapped relative to bracket.
  // If so, flip spreads so they correspond to the bracket's team orientation.
  const enriched = bracketGames.map(bg => {
    const key = [bg.homeSlug, bg.awaySlug].sort().join('|');
    const feed = feedByKey[key];
    if (!feed) return bg; // No feed data — keep bracket shell with partial data

    // Detect orientation: is the feed's home team the bracket's home team?
    const feedHomeSlug = getSlug?.(feed.homeTeam) || null;
    const isSwapped = feedHomeSlug && feedHomeSlug !== bg.homeSlug;

    // Get raw spread values from feed
    let homeSpread = feed.homeSpread ?? null;
    let awaySpread = feed.awaySpread ?? null;
    let moneyline = feed.moneyline ?? null;

    // If feed teams are swapped relative to bracket, flip spreads AND moneyline
    if (isSwapped) {
      const tmpSpread = homeSpread;
      homeSpread = awaySpread != null ? awaySpread : (tmpSpread != null ? -tmpSpread : null);
      awaySpread = tmpSpread != null ? tmpSpread : (awaySpread != null ? -awaySpread : null);
      // Moneyline: format is "away_price / home_price" — swap the halves
      if (typeof moneyline === 'string' && moneyline.includes('/')) {
        const parts = moneyline.split('/').map(s => s.trim());
        if (parts.length === 2) moneyline = `${parts[1]} / ${parts[0]}`;
      }
    }

    return {
      ...feed,
      // Preserve bracket canonical identity (source of truth for team orientation)
      homeTeam: bg.homeTeam,
      awayTeam: bg.awayTeam,
      homeSlug: bg.homeSlug,
      awaySlug: bg.awaySlug,
      // Use feed's game metadata
      gameId: feed.gameId || bg.gameId,
      startTime: feed.startTime || feed.commenceTime || bg.startTime,
      // Use orientation-corrected spreads
      spread: homeSpread ?? null,
      homeSpread,
      awaySpread,
      total: feed.total ?? null,
      moneyline,
      overPrice: feed.overPrice ?? null,
      underPrice: feed.underPrice ?? null,
      // Track enrichment
      _bracketSeeded: true,
      _enrichedFromFeed: true,
      _spreadFlipped: !!isSwapped,
    };
  });

  // Step 4: Round-transition handling — when ALL bracket game dates are STRICTLY
  // in the past (not today), the current round is complete. Include upcoming
  // tournament games from the feed so the next round's slate appears automatically.
  // CRITICAL: Do NOT activate on the day games are being played — that causes
  // stale/extra games to leak into the picks board from the feed.
  const today = new Date().toISOString().slice(0, 10);
  const allBracketDatesInPast = CURRENT_MATCHUPS.length > 0 &&
    CURRENT_MATCHUPS.every(m => m.gameDate && m.gameDate < today);

  if (allBracketDatesInPast) {
    const bracketKeys = new Set(enriched.map(g => [g.homeSlug, g.awaySlug].sort().join('|')));
    const allFeedGames = [...(todayScores || []), ...(oddsGames || [])];
    for (const fg of allFeedGames) {
      const hSlug = getSlug?.(fg.homeTeam) || null;
      const aSlug = getSlug?.(fg.awayTeam) || null;
      if (!hSlug || !aSlug) continue;
      const key = [hSlug, aSlug].sort().join('|');
      if (bracketKeys.has(key)) continue; // already in bracket
      // Only add today's or future games where BOTH teams are seeded tournament teams.
      // Bracket dedup (line above) already prevents re-adding completed bracket games.
      const gameDate = (fg.startTime || fg.commenceTime || '').slice(0, 10);
      if (gameDate && gameDate < today) continue; // skip past games only
      if (!isTournamentGame(fg)) continue;
      bracketKeys.add(key);
      enriched.push({
        ...fg,
        homeSlug: hSlug,
        awaySlug: aSlug,
        _bracketSeeded: false,
        _nextRoundFromFeed: true,
      });
    }
  }

  // Step 5: If mergeWithOdds helper is available, do a final pass to attach
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
    return buildBracketFirstGames({ todayScores, oddsGames, upcomingGamesWithSpreads, getSlug, mergeWithOdds });
  }

  // FEED-FIRST: standard behavior outside tournament
  return buildFeedFirstGames({ todayScores, oddsGames, upcomingGamesWithSpreads, getSlug, mergeWithOdds });
}
