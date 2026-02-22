/**
 * Client-side odds API wrapper.
 * Fetches NCAA basketball odds from /api/odds (proxies The Odds API).
 * Requires ODDS_API_KEY on the server.
 */

import { getTeamSlug } from '../utils/teamSlug';

/**
 * @param {{ date?: string, team?: string, debug?: boolean }} params
 * @param {string} [params.date] - YYYY-MM-DD (optional)
 * @param {string} [params.team] - team slug for filtering (optional, done client-side)
 * @returns {Promise<{ games: Array, error?: string, hasOddsKey?: boolean, meta?: object, debug?: object }>}
 */
export async function fetchOdds(params = {}) {
  const search = new URLSearchParams();
  if (params.date) search.set('date', params.date);
  if (params.team) search.set('team', params.team);
  if (params.debug) search.set('debug', 'true');

  const qs = search.toString();
  const url = `/api/odds${qs ? `?${qs}` : ''}`;
  const res = await fetch(url);

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  return res.json();
}

/**
 * Fetch historical odds for ATS computation (requires paid Odds API plan).
 * @param {{ from: string, to: string, debug?: boolean }} params - YYYY-MM-DD
 * @returns {Promise<{ games: Array, error?: string, hasOddsKey?: boolean, debug?: object }>}
 */
export async function fetchOddsHistory(params) {
  const { from, to, debug } = params || {};
  if (!from || !to) throw new Error('from and to (YYYY-MM-DD) required');
  const qs = new URLSearchParams({ from, to });
  if (debug) qs.set('debug', 'true');
  const url = `/api/odds-history?${qs.toString()}`;
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

/** Normalize team name for matching: lowercase, strip mascots, punctuation, University, State */
function normName(s) {
  if (!s || typeof s !== 'string') return '';
  return s
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[.,()\-&]/g, ' ')
    .replace(/\b(university|univ\.?|college|of|state)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Strip mascot (last word or two) for looser school-name matching */
function stripMascot(name) {
  if (!name || typeof name !== 'string') return '';
  const n = normName(name);
  const parts = n.split(/\s+/).filter(Boolean);
  if (parts.length <= 2) return n;
  return parts.slice(0, -1).join(' ');
}

function namesMatch(a, b) {
  if (!a || !b) return false;
  const na = normName(a);
  const nb = normName(b);
  if (na && nb) {
    if (na === nb) return true;
    if (na.includes(nb) || nb.includes(na)) return true;
    const sa = stripMascot(a);
    const sb = stripMascot(b);
    if (sa && sb && (sa.includes(sb) || sb.includes(sa) || sa === sb)) return true;
    const ta = na.replace(/\s+/g, '');
    const tb = nb.replace(/\s+/g, '');
    if (ta === tb || ta.includes(tb) || tb.includes(ta)) return true;
  }
  const slugA = getTeamSlug(a);
  const slugB = getTeamSlug(b);
  if (slugA && slugB) return slugA === slugB;
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
 * @param {Array} scoreGames - from fetchScores
 * @param {Array} oddsGames - from fetchOdds().games
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
      if (import.meta.env.DEV) {
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
      total: odds.total,
      moneyline: odds.moneyline,
      oddsSource: odds.sportsbook || 'Odds API',
    };
  });
}
