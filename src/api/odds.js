/**
 * Client-side odds API wrapper.
 * Fetches NCAA basketball odds from /api/odds (proxies The Odds API).
 * Requires ODDS_API_KEY on the server.
 */

/**
 * @param {{ date?: string, team?: string }} params
 * @param {string} [params.date] - YYYY-MM-DD (optional)
 * @param {string} [params.team] - team slug for filtering (optional, done client-side)
 * @returns {Promise<{ games: Array<{ gameId: string, homeTeam: string, awayTeam: string, commenceTime: string, spread: string | null, total: string | null, moneyline: string | null, sportsbook: string }>, meta?: { requestsRemaining: number, requestsUsed: number } }>}
 */
export async function fetchOdds(params = {}) {
  const search = new URLSearchParams();
  if (params.date) search.set('date', params.date);
  if (params.team) search.set('team', params.team);

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
 * @param {{ from: string, to: string }} params - YYYY-MM-DD
 * @returns {Promise<{ games: Array<{ gameId, homeTeam, awayTeam, commenceTime, spread, sportsbook }> }>}
 */
export async function fetchOddsHistory(params) {
  const { from, to } = params || {};
  if (!from || !to) throw new Error('from and to (YYYY-MM-DD) required');
  const url = `/api/odds-history?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

/** Normalize team name for matching: lowercase, collapse whitespace, remove common suffixes */
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

function namesMatch(a, b) {
  const na = normName(a);
  const nb = normName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const ta = na.replace(/\s+/g, '');
  const tb = nb.replace(/\s+/g, '');
  return ta === tb || ta.includes(tb) || tb.includes(ta);
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
 * Merge ESPN scores with Odds API games by matching home/away teams and date.
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

  const norm = (s) => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();

  const matchOdds = (home, away, dateKey) => {
    for (const o of oddsGames) {
      if (toDateKey(o.commenceTime) !== dateKey) continue;
      const oHome = norm(o.homeTeam);
      const oAway = norm(o.awayTeam);
      const sHome = norm(home);
      const sAway = norm(away);
      if ((oHome.includes(sHome) || sHome.includes(oHome)) && (oAway.includes(sAway) || sAway.includes(oAway))) {
        return o;
      }
      if (getSlug && getSlug(home) && getSlug(away) && getSlug(o.homeTeam) === getSlug(home) && getSlug(o.awayTeam) === getSlug(away)) {
        return o;
      }
    }
    return null;
  };

  return scoreGames.map((g) => {
    const odds = matchOdds(g.homeTeam, g.awayTeam, toDateKey(g.startTime));
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
