/**
 * buildMlbPicks — top-level orchestrator for MLB pick generation.
 *
 * Board assembly:
 *   1. Filter to upcoming games, sort today > tomorrow > later
 *   2. Later games prefer non-duplicate matchups (diversity fill)
 *   3. Score and classify all candidate games
 *   4. Apply board-level diversity fill:
 *      - Each column picks unique games first, shared games last
 *      - Target 5 picks per column with max diversity
 *   5. Sort by date priority > confidence > score
 */

import { normalizeMlbMatchup } from './normalizeMlbMatchup.js';
import { scoreMlbMatchup } from './scoreMlbMatchup.js';
import { classifyMlbPick } from './classifyMlbPick.js';
import { MLB_PICK_THRESHOLDS, MAX_CANDIDATE_GAMES } from './mlbPickThresholds.js';

/** Target picks per column in the final board */
const SECTION_TARGET = 5;

function getGameDate(startTime) {
  if (!startTime) return '';
  try {
    const d = new Date(startTime);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  } catch { return ''; }
}

function getTomorrowDate() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getTodayDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Create a matchup key like "bos-vs-nyy" to detect same-series games */
function getMatchupKey(game) {
  const away = game.teams?.away?.slug || game.awaySlug || game.awayTeam?.slug || '';
  const home = game.teams?.home?.slug || game.homeSlug || game.homeTeam?.slug || '';
  if (!away || !home) return '';
  const pair = [away, home].sort();
  return pair.join('-vs-');
}

/** Get matchup key from a pick object (uses the enriched matchup payload) */
function getPickMatchupKey(pick) {
  const away = pick.matchup?.awayTeam?.slug || '';
  const home = pick.matchup?.homeTeam?.slug || '';
  if (!away || !home) return pick.gameId || '';
  const pair = [away, home].sort();
  return pair.join('-vs-');
}

export function buildMlbPicks({ games = [] }) {
  const result = {
    generatedAt: new Date().toISOString(),
    meta: { totalCandidates: 0, qualifiedGames: 0, skippedGames: 0 },
    categories: { pickEms: [], ats: [], leans: [], totals: [] },
  };

  const today = getTodayDate();
  const tomorrow = getTomorrowDate();

  // Filter to upcoming/scheduled games only
  const upcoming = games.filter(g => {
    const status = (g.status || '').toLowerCase();
    const isLive = g.gameState?.isLive;
    const isFinal = g.gameState?.isFinal;
    return !isLive && !isFinal && status !== 'final' && status !== 'in_progress';
  });

  // Split by date tier
  const todayGames = upcoming.filter(g => getGameDate(g.startTime || g.date || '') === today);
  const tomorrowGames = upcoming.filter(g => getGameDate(g.startTime || g.date || '') === tomorrow);
  const laterGames = upcoming.filter(g => {
    const d = getGameDate(g.startTime || g.date || '');
    return d !== today && d !== tomorrow;
  });

  // Collect matchup keys from today+tomorrow for diversity filtering
  const nearTermMatchups = new Set();
  for (const g of [...todayGames, ...tomorrowGames]) {
    const key = getMatchupKey(g);
    if (key) nearTermMatchups.add(key);
  }

  // Sort later games: non-duplicate matchups first, then duplicates
  const laterSorted = [...laterGames].sort((a, b) => {
    const aKey = getMatchupKey(a);
    const bKey = getMatchupKey(b);
    const aIsDupe = aKey && nearTermMatchups.has(aKey) ? 1 : 0;
    const bIsDupe = bKey && nearTermMatchups.has(bKey) ? 1 : 0;
    if (aIsDupe !== bIsDupe) return aIsDupe - bIsDupe;
    return (a.startTime || '').localeCompare(b.startTime || '');
  });

  // Assemble candidates: today first, tomorrow next, then diversity-sorted later
  const candidates = [...todayGames, ...tomorrowGames, ...laterSorted]
    .slice(0, MAX_CANDIDATE_GAMES);

  result.meta.totalCandidates = candidates.length;

  // Score and classify all candidates
  const allPicks = [];
  for (const game of candidates) {
    try {
      const normalized = normalizeMlbMatchup(game);
      if (!normalized.ok || !normalized.matchup) { result.meta.skippedGames += 1; continue; }

      const score = scoreMlbMatchup(normalized.matchup);
      const picks = classifyMlbPick(normalized.matchup, score, MLB_PICK_THRESHOLDS);

      if (!picks.length) continue;
      result.meta.qualifiedGames += 1;

      const gameDate = getGameDate(normalized.matchup.startTime);
      for (const pick of picks) {
        pick._gameDate = gameDate;
      }
      allPicks.push(...picks);
    } catch {
      result.meta.skippedGames += 1;
    }
  }

  // Sort: today/tomorrow first, then confidence tier, then score
  const sortFn = (a, b) => {
    const aPriority = a._gameDate === today ? 0 : a._gameDate === tomorrow ? 1 : 2;
    const bPriority = b._gameDate === today ? 0 : b._gameDate === tomorrow ? 1 : 2;
    if (aPriority !== bPriority) return aPriority - bPriority;

    const tierOrder = { high: 0, medium: 1, low: 2 };
    const ta = tierOrder[a.confidence] ?? 3;
    const tb = tierOrder[b.confidence] ?? 3;
    if (ta !== tb) return ta - tb;
    return (b.confidenceScore || 0) - (a.confidenceScore || 0);
  };

  // Group by category
  const byCat = { pickEms: [], ats: [], leans: [], totals: [] };
  for (const pick of allPicks) {
    if (byCat[pick.category]) byCat[pick.category].push(pick);
  }

  // Sort each category
  for (const key of Object.keys(byCat)) {
    byCat[key].sort(sortFn);
  }

  // ── Board-level diversity fill ──
  // Fill each column to SECTION_TARGET, preferring unique matchups
  // across the entire board. Track which matchup keys have been used
  // board-wide, and prefer picks from unused matchups.
  const boardUsedMatchups = new Set();

  for (const key of ['pickEms', 'ats', 'leans', 'totals']) {
    const candidates = byCat[key];
    const selected = [];
    const deferred = []; // picks from already-used matchups

    for (const pick of candidates) {
      if (selected.length >= SECTION_TARGET) break;
      const mk = getPickMatchupKey(pick);
      if (boardUsedMatchups.has(mk)) {
        deferred.push(pick);
      } else {
        selected.push(pick);
        boardUsedMatchups.add(mk);
      }
    }

    // If we haven't reached target, fill with deferred (already-used matchups)
    for (const pick of deferred) {
      if (selected.length >= SECTION_TARGET) break;
      selected.push(pick);
    }

    result.categories[key] = selected;
  }

  return result;
}

/** Check if the picks payload has any content worth showing. */
export function hasAnyPicks(picks) {
  if (!picks?.categories) return false;
  const c = picks.categories;
  return (c.pickEms?.length > 0 || c.ats?.length > 0 || c.leans?.length > 0 || c.totals?.length > 0);
}
