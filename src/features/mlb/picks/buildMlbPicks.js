/**
 * buildMlbPicks — top-level orchestrator for MLB pick generation.
 *
 * Board assembly:
 *   1. Filter to upcoming games, sort today > tomorrow > later
 *   2. When tomorrow's slate is thin, fill with Friday games that
 *      are NOT the same matchup as tomorrow's games (diversity fill)
 *   3. Score and classify all candidate games
 *   4. Sort picks: date priority > confidence > score
 *   5. No cross-column game caps — each category is independent
 *   6. Target ~5 picks per section on a normal slate
 */

import { normalizeMlbMatchup } from './normalizeMlbMatchup.js';
import { scoreMlbMatchup } from './scoreMlbMatchup.js';
import { classifyMlbPick } from './classifyMlbPick.js';
import { MLB_PICK_THRESHOLDS, MAX_CANDIDATE_GAMES } from './mlbPickThresholds.js';

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

/** Create a matchup key like "nyy-vs-bos" to detect same-series games */
function getMatchupKey(game) {
  const away = game.awaySlug || game.awayTeam?.slug || game.awayTeam?.shortName || '';
  const home = game.homeSlug || game.homeTeam?.slug || game.homeTeam?.shortName || '';
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
    nearTermMatchups.add(getMatchupKey(g));
  }

  // Sort later games: non-duplicate matchups first, then duplicates
  const laterSorted = laterGames.sort((a, b) => {
    const aIsDupe = nearTermMatchups.has(getMatchupKey(a)) ? 1 : 0;
    const bIsDupe = nearTermMatchups.has(getMatchupKey(b)) ? 1 : 0;
    if (aIsDupe !== bIsDupe) return aIsDupe - bIsDupe;
    return (a.startTime || '').localeCompare(b.startTime || '');
  });

  // Assemble candidates: today first, tomorrow next, then diversity-sorted later
  const candidates = [...todayGames, ...tomorrowGames, ...laterSorted]
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

  // Group by category and sort independently
  // Each category gets its own independent pool — no cross-column caps
  for (const pick of allPicks) {
    if (result.categories[pick.category]) {
      result.categories[pick.category].push(pick);
    }
  }

  for (const key of Object.keys(result.categories)) {
    result.categories[key].sort(sortFn);
  }

  return result;
}

/** Check if the picks payload has any content worth showing. */
export function hasAnyPicks(picks) {
  if (!picks?.categories) return false;
  const c = picks.categories;
  return (c.pickEms?.length > 0 || c.ats?.length > 0 || c.leans?.length > 0 || c.totals?.length > 0);
}
