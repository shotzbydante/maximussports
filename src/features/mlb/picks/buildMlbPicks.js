/**
 * buildMlbPicks — top-level orchestrator for MLB pick generation.
 *
 * Board assembly:
 *   1. Filter to upcoming games, sort tomorrow-first
 *   2. Score and classify all candidate games
 *   3. Sort picks: tomorrow-first, then confidence tier, then score
 *   4. Apply board-level diversity: cap same matchup to 2 columns
 *      (but Pick'Ems/ATS vs Leans/Totals are different market framings,
 *       so the cap tracks by matchup+framing rather than raw game ID)
 *   5. Target ~5 picks per section on a normal slate
 */

import { normalizeMlbMatchup } from './normalizeMlbMatchup.js';
import { scoreMlbMatchup } from './scoreMlbMatchup.js';
import { classifyMlbPick } from './classifyMlbPick.js';
import { MLB_PICK_THRESHOLDS, MAX_CANDIDATE_GAMES } from './mlbPickThresholds.js';

/** Max times a single game appears in "side" columns (Pick'Ems + ATS) */
const MAX_SIDE_APPEARANCES = 1;

/**
 * Get the calendar date string for a game (YYYY-MM-DD in local time)
 */
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

export function buildMlbPicks({ games = [] }) {
  const result = {
    generatedAt: new Date().toISOString(),
    meta: { totalCandidates: 0, qualifiedGames: 0, skippedGames: 0 },
    categories: { pickEms: [], ats: [], leans: [], totals: [] },
  };

  const today = getTodayDate();
  const tomorrow = getTomorrowDate();

  // Filter to upcoming/scheduled games only
  const candidates = games
    .filter(g => {
      const status = (g.status || '').toLowerCase();
      const isLive = g.gameState?.isLive;
      const isFinal = g.gameState?.isFinal;
      return !isLive && !isFinal && status !== 'final' && status !== 'in_progress';
    })
    // Sort: today first, then tomorrow, then later dates
    .sort((a, b) => {
      const aTime = a.startTime || a.date || '';
      const bTime = b.startTime || b.date || '';
      const aDate = getGameDate(aTime);
      const bDate = getGameDate(bTime);
      // Priority: today > tomorrow > later
      const aPriority = aDate === today ? 0 : aDate === tomorrow ? 1 : 2;
      const bPriority = bDate === today ? 0 : bDate === tomorrow ? 1 : 2;
      if (aPriority !== bPriority) return aPriority - bPriority;
      return aTime.localeCompare(bTime);
    })
    .slice(0, MAX_CANDIDATE_GAMES);

  result.meta.totalCandidates = candidates.length;

  const allPicks = [];

  for (const game of candidates) {
    try {
      const normalized = normalizeMlbMatchup(game);
      if (!normalized.ok || !normalized.matchup) { result.meta.skippedGames += 1; continue; }

      const score = scoreMlbMatchup(normalized.matchup);
      const picks = classifyMlbPick(normalized.matchup, score, MLB_PICK_THRESHOLDS);

      if (!picks.length) continue;
      result.meta.qualifiedGames += 1;

      // Tag each pick with its game date for tomorrow-first sorting
      const gameDate = getGameDate(normalized.matchup.startTime);
      for (const pick of picks) {
        pick._gameDate = gameDate;
      }
      allPicks.push(...picks);
    } catch {
      result.meta.skippedGames += 1;
    }
  }

  // Sort: today/tomorrow first, then by confidence tier, then score
  const sortFn = (a, b) => {
    // Date priority: today > tomorrow > later
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

  // Apply diversity: for "side" picks (Pick'Ems, ATS), cap at 1 appearance
  // per game to maximize unique games. Leans and Totals are independent
  // market framings, so they don't count against the side cap.
  const sideAppearances = new Map();

  for (const key of ['pickEms', 'ats']) {
    const filtered = [];
    for (const pick of byCat[key]) {
      const count = sideAppearances.get(pick.gameId) || 0;
      if (count >= MAX_SIDE_APPEARANCES) continue;
      filtered.push(pick);
      sideAppearances.set(pick.gameId, count + 1);
    }
    result.categories[key] = filtered;
  }

  // Leans and Totals pass through without side-column diversity cap
  // (they represent different market framings — directional value vs totals)
  result.categories.leans = byCat.leans;
  result.categories.totals = byCat.totals;

  return result;
}

/** Check if the picks payload has any content worth showing. */
export function hasAnyPicks(picks) {
  if (!picks?.categories) return false;
  const c = picks.categories;
  return (c.pickEms?.length > 0 || c.ats?.length > 0 || c.leans?.length > 0 || c.totals?.length > 0);
}
