/**
 * buildMlbPicks — top-level orchestrator for MLB pick generation.
 *
 * Takes game data + odds and returns categorized pick cards
 * ready for UI consumption.
 *
 * Board assembly:
 *   1. Score and classify all candidate games
 *   2. Collect picks by category
 *   3. Sort by confidence (high > medium > low)
 *   4. Apply board-level diversity: cap each game to max 2 board appearances
 *      (prevents one matchup from dominating all 4 columns)
 *   5. Target ~5 picks per section on a normal slate
 */

import { normalizeMlbMatchup } from './normalizeMlbMatchup.js';
import { scoreMlbMatchup } from './scoreMlbMatchup.js';
import { classifyMlbPick } from './classifyMlbPick.js';
import { MLB_PICK_THRESHOLDS, MAX_CANDIDATE_GAMES } from './mlbPickThresholds.js';

/** Max times a single game can appear across all board columns */
const MAX_BOARD_APPEARANCES = 2;

/** Target picks per section (soft cap — fills to this if candidates exist) */
const SECTION_TARGET = 5;

/**
 * @param {Object} input
 * @param {Array} input.games - from /api/mlb/live/games or homeFeed
 * @returns {Object} categorized picks payload
 */
export function buildMlbPicks({ games = [] }) {
  const result = {
    generatedAt: new Date().toISOString(),
    meta: {
      totalCandidates: 0,
      qualifiedGames: 0,
      skippedGames: 0,
    },
    categories: {
      pickEms: [],
      ats: [],
      leans: [],
      totals: [],
    },
  };

  // Filter to upcoming/scheduled games only (not final, not live)
  const candidates = games
    .filter(g => {
      const status = (g.status || '').toLowerCase();
      const isLive = g.gameState?.isLive;
      const isFinal = g.gameState?.isFinal;
      return !isLive && !isFinal && status !== 'final' && status !== 'in_progress';
    })
    .slice(0, MAX_CANDIDATE_GAMES);

  result.meta.totalCandidates = candidates.length;

  // Collect all picks from all games
  const allPicks = [];

  for (const game of candidates) {
    try {
      const normalized = normalizeMlbMatchup(game);

      if (!normalized.ok || !normalized.matchup) {
        result.meta.skippedGames += 1;
        continue;
      }

      const score = scoreMlbMatchup(normalized.matchup);
      const picks = classifyMlbPick(normalized.matchup, score, MLB_PICK_THRESHOLDS);

      if (!picks.length) continue;

      result.meta.qualifiedGames += 1;
      allPicks.push(...picks);
    } catch {
      result.meta.skippedGames += 1;
    }
  }

  // Sort all picks by confidence tier then score
  const sortFn = (a, b) => {
    const tierOrder = { high: 0, medium: 1, low: 2 };
    const ta = tierOrder[a.confidence] ?? 3;
    const tb = tierOrder[b.confidence] ?? 3;
    if (ta !== tb) return ta - tb;
    if (a.confidenceScore !== b.confidenceScore) return b.confidenceScore - a.confidenceScore;
    return (a.matchup?.startTime || '').localeCompare(b.matchup?.startTime || '');
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

  // Apply board-level diversity: track how many times each game appears
  // across ALL columns, and cap at MAX_BOARD_APPEARANCES.
  // Process categories in priority order so stronger sections fill first.
  const gameAppearances = new Map();

  for (const key of ['pickEms', 'ats', 'leans', 'totals']) {
    const filtered = [];
    for (const pick of byCat[key]) {
      const count = gameAppearances.get(pick.gameId) || 0;
      if (count >= MAX_BOARD_APPEARANCES) continue;
      filtered.push(pick);
      gameAppearances.set(pick.gameId, count + 1);
    }
    result.categories[key] = filtered;
  }

  return result;
}

/** Check if the picks payload has any content worth showing. */
export function hasAnyPicks(picks) {
  if (!picks?.categories) return false;
  const c = picks.categories;
  return (c.pickEms?.length > 0 || c.ats?.length > 0 || c.leans?.length > 0 || c.totals?.length > 0);
}
