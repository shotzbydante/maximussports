/**
 * buildMlbPicks — top-level orchestrator for MLB pick generation.
 *
 * Takes game data + odds and returns categorized pick cards
 * ready for UI consumption.
 */

import { normalizeMlbMatchup } from './normalizeMlbMatchup.js';
import { scoreMlbMatchup } from './scoreMlbMatchup.js';
import { classifyMlbPick } from './classifyMlbPick.js';
import { MLB_PICK_THRESHOLDS, MAX_CANDIDATE_GAMES } from './mlbPickThresholds.js';

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
      // Keep only upcoming/scheduled games
      return !isLive && !isFinal && status !== 'final' && status !== 'in_progress';
    })
    .slice(0, MAX_CANDIDATE_GAMES);

  result.meta.totalCandidates = candidates.length;

  for (const game of candidates) {
    try {
      const normalized = normalizeMlbMatchup(game);

      if (!normalized.ok || !normalized.matchup) {
        result.meta.skippedGames += 1;
        continue;
      }

      const score = scoreMlbMatchup(normalized.matchup);
      const picks = classifyMlbPick(normalized.matchup, score, MLB_PICK_THRESHOLDS);

      if (!picks.length) {
        continue;
      }

      result.meta.qualifiedGames += 1;

      for (const pick of picks) {
        switch (pick.category) {
          case 'pickEms': result.categories.pickEms.push(pick); break;
          case 'ats': result.categories.ats.push(pick); break;
          case 'leans': result.categories.leans.push(pick); break;
          case 'totals': result.categories.totals.push(pick); break;
        }
      }
    } catch {
      result.meta.skippedGames += 1;
    }
  }

  // Sort each category: high confidence first, then score, then start time
  const sortFn = (a, b) => {
    const tierOrder = { high: 0, medium: 1, low: 2 };
    const ta = tierOrder[a.confidence] ?? 3;
    const tb = tierOrder[b.confidence] ?? 3;
    if (ta !== tb) return ta - tb;
    if (a.confidenceScore !== b.confidenceScore) return b.confidenceScore - a.confidenceScore;
    return (a.matchup?.startTime || '').localeCompare(b.matchup?.startTime || '');
  };

  result.categories.pickEms.sort(sortFn);
  result.categories.ats.sort(sortFn);
  result.categories.leans.sort(sortFn);
  result.categories.totals.sort(sortFn);

  return result;
}

/** Check if the picks payload has any content worth showing. */
export function hasAnyPicks(picks) {
  if (!picks?.categories) return false;
  const c = picks.categories;
  return (c.pickEms?.length > 0 || c.ats?.length > 0 || c.leans?.length > 0 || c.totals?.length > 0);
}
