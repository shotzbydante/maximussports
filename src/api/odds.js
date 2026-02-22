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
