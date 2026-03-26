/**
 * Odds helpers: merge games with odds, match odds history to events/games.
 * Odds data is provided by /api/home and /api/team/[slug].
 */

import { getTeamSlug } from '../utils/teamSlug.js';

const isDev = typeof process !== 'undefined' && process.env && process.env.NODE_ENV !== 'production';

/** Normalize team name for matching: lowercase, strip punctuation */
function normName(s) {
  if (!s || typeof s !== 'string') return '';
  return s
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[.,()\-&]/g, ' ')
    .replace(/\b(university|univ\.?|college|of)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalize preserving "state" — critical for distinguishing Michigan vs Michigan State.
 * Used for strict matching only.
 */
function normNameStrict(s) {
  if (!s || typeof s !== 'string') return '';
  return s
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[.,()\-&]/g, ' ')
    .replace(/\b(university|univ\.?|college|of)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Strip mascot (last word) for school-name matching */
function stripMascot(name) {
  if (!name || typeof name !== 'string') return '';
  const n = normName(name);
  const parts = n.split(/\s+/).filter(Boolean);
  if (parts.length <= 2) return n;
  return parts.slice(0, -1).join(' ');
}

/**
 * Match two team names. Prioritizes canonical slug comparison to avoid
 * substring collisions (e.g. Michigan vs Michigan State).
 */
function namesMatch(a, b) {
  if (!a || !b) return false;

  // Priority 1: canonical slug comparison (most reliable)
  const slugA = getTeamSlug(a);
  const slugB = getTeamSlug(b);
  if (slugA && slugB) return slugA === slugB;

  // Priority 2: strict normalized name comparison (preserves "state")
  const sa = normNameStrict(a);
  const sb = normNameStrict(b);
  if (sa && sb) {
    if (sa === sb) return true;
    // Only allow includes if the shorter string is 80%+ of the longer string length
    // This prevents "michigan" (8 chars) from matching "michigan state spartans" (23 chars)
    const shorter = sa.length <= sb.length ? sa : sb;
    const longer = sa.length > sb.length ? sa : sb;
    if (longer.includes(shorter) && shorter.length >= longer.length * 0.75) return true;
  }

  // Priority 3: mascot-stripped comparison with same length guard
  const ma = stripMascot(a);
  const mb = stripMascot(b);
  if (ma && mb) {
    if (ma === mb) return true;
    const shorter = ma.length <= mb.length ? ma : mb;
    const longer = ma.length > mb.length ? ma : mb;
    if (longer.includes(shorter) && shorter.length >= longer.length * 0.75) return true;
  }

  return false;
}

/**
 * Match odds history game to schedule event.
 * Uses normalized team names, same game date, and home/away alignment.
 * If multiple match, returns first (API returns earliest snapshot first).
 */
export function matchOddsHistoryToEvent(ev, oddsGames, teamName) {
  if (!oddsGames?.length || !teamName) return null;
  const evDate = ev.date ? new Date(ev.date).toISOString().slice(0, 10) : '';
  const evOpp = ev.opponent || '';
  const isHome = ev.homeAway === 'home';

  const candidates = [];
  for (const o of oddsGames) {
    const oDate = o.commenceTime ? new Date(o.commenceTime).toISOString().slice(0, 10) : '';
    if (oDate !== evDate) continue;

    const oHome = o.homeTeam || '';
    const oAway = o.awayTeam || '';

    const teamMatchesHome = namesMatch(teamName, oHome);
    const teamMatchesAway = namesMatch(teamName, oAway);
    const oppMatchesHome = namesMatch(evOpp, oHome);
    const oppMatchesAway = namesMatch(evOpp, oAway);

    if (isHome && teamMatchesHome && oppMatchesAway) candidates.push(o);
    else if (!isHome && teamMatchesAway && oppMatchesHome) candidates.push(o);
    else if ((teamMatchesHome || teamMatchesAway) && (oppMatchesHome || oppMatchesAway)) candidates.push(o);
  }

  if (candidates.length === 0) return null;
  return candidates[0];
}

/**
 * Match odds history game to a score game (homeTeam, awayTeam, startTime).
 * Used for DynamicAlerts closing spread.
 */
export function matchOddsHistoryToGame(game, oddsGames) {
  if (!oddsGames?.length || !game?.homeTeam || !game?.awayTeam) return null;
  const evDate = game.startTime ? new Date(game.startTime).toISOString().slice(0, 10) : '';
  for (const o of oddsGames) {
    const oDate = o.commenceTime ? new Date(o.commenceTime).toISOString().slice(0, 10) : '';
    if (oDate !== evDate) continue;
    const h = namesMatch(game.homeTeam, o.homeTeam);
    const a = namesMatch(game.awayTeam, o.awayTeam);
    if (h && a) return o;
  }
  return null;
}

/**
 * Merge ESPN scores with Odds API games by matching home/away teams and date.
 * - Normalizes team names (strip mascots, punctuation, University, State)
 * - Matches by date (same day)
 * - If multiple matches, chooses closest commenceTime to score game
 * - Debug logs (dev only) when match not found
 * @param {Array} scoreGames - from /api/home scores
 * @param {Array} oddsGames - from /api/home odds.games
 * @param {function} getSlug - (name) => slug | null, e.g. getTeamSlug
 * @returns {Array} score games with spread, total, moneyline, oddsSource merged in
 */
export function mergeGamesWithOdds(scoreGames, oddsGames, getSlug) {
  if (!oddsGames?.length) return scoreGames;

  const toDateKey = (iso) => {
    if (!iso) return '';
    try {
      return new Date(iso).toISOString().slice(0, 10);
    } catch {
      return '';
    }
  };

  const matchOdds = (home, away, dateKey, scoreStartTime) => {
    const candidates = [];
    for (const o of oddsGames) {
      if (toDateKey(o.commenceTime) !== dateKey) continue;
      const hMatch = namesMatch(home, o.homeTeam);
      const aMatch = namesMatch(away, o.awayTeam);
      const slugMatch = getSlug && getSlug(home) && getSlug(away) && getSlug(o.homeTeam) === getSlug(home) && getSlug(o.awayTeam) === getSlug(away);
      if ((hMatch && aMatch) || slugMatch) {
        candidates.push(o);
      }
    }
    if (candidates.length === 0) {
      if (isDev) {
        console.debug('[mergeGamesWithOdds] No match:', { home, away, dateKey, oddsCount: oddsGames.length });
      }
      return null;
    }
    if (candidates.length === 1) return candidates[0];
    const scoreTs = scoreStartTime ? new Date(scoreStartTime).getTime() : 0;
    candidates.sort((a, b) => {
      const ta = a.commenceTime ? new Date(a.commenceTime).getTime() : 0;
      const tb = b.commenceTime ? new Date(b.commenceTime).getTime() : 0;
      return Math.abs(ta - scoreTs) - Math.abs(tb - scoreTs);
    });
    return candidates[0];
  };

  return scoreGames.map((g) => {
    const dateKey = toDateKey(g.startTime);
    const odds = matchOdds(g.homeTeam, g.awayTeam, dateKey, g.startTime);
    if (!odds) return g;
    return {
      ...g,
      spread: odds.spread,
      homeSpread: odds.homeSpread ?? null,
      awaySpread: odds.awaySpread ?? null,
      total: odds.total,
      overPrice: odds.overPrice ?? null,
      underPrice: odds.underPrice ?? null,
      moneyline: odds.moneyline,
      oddsSource: odds.sportsbook || 'Odds API',
    };
  });
}
