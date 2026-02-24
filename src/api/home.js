/**
 * Home API: full (legacy), fast + slow (stale-while-revalidate).
 * - fetchHome(): single /api/home (Games, DailySchedule, Insights, NewsFeed).
 * - fetchHomeFast() + fetchHomeSlow(): split for Home page; merge with mergeHomeData().
 */

const inFlight = new Map();

function coalesce(key, fetcher) {
  const existing = inFlight.get(key);
  if (existing) return existing;
  const promise = fetcher().finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, promise);
  return promise;
}

function qsFromOptions(options) {
  const { dates, pinnedSlugs } = options;
  const qs = new URLSearchParams();
  if (Array.isArray(dates) && dates.length > 0) qs.set('dates', dates.join(','));
  if (Array.isArray(pinnedSlugs) && pinnedSlugs.length > 0) qs.set('pinnedSlugs', pinnedSlugs.join(','));
  return qs;
}

/**
 * Merge fast + slow home payloads into one. Prefer slow for odds, headlines, ATS, pinned news.
 * @param {object} fast - from /api/home/fast
 * @param {object} [slow] - from /api/home/slow (optional, may arrive later)
 * @returns {object} merged shape: scores, rankings, odds, oddsHistory, headlines, atsLeaders, dataStatus, pinnedTeamNews, pinnedTeamsMeta, upcomingGamesWithSpreads
 */
export function mergeHomeData(fast, slow) {
  const f = fast || {};
  const s = slow || {};
  return {
    scores: f.scoresToday || [],
    scoresYesterday: f.scoresYesterday || [],
    rankings: f.rankings || { rankings: f.rankingsTop25 || [] },
    rankingsTop25: f.rankingsTop25 || [],
    pinnedTeamsMeta: f.pinnedTeamsMeta || [],
    atsLeaders: (s.atsLeaders?.best?.length || s.atsLeaders?.worst?.length) ? s.atsLeaders : (f.atsLeaders || { best: [], worst: [] }),
    headlines: s.headlines ?? f.headlines ?? [],
    pinnedTeamNews: (s.pinnedTeamNews && Object.keys(s.pinnedTeamNews).length > 0) ? s.pinnedTeamNews : (f.pinnedTeamNews || {}),
    upcomingGamesWithSpreads: s.upcomingGamesWithSpreads ?? f.upcomingGamesWithSpreads ?? [],
    odds: s.odds ?? f.odds ?? { games: [], error: null, hasOddsKey: false },
    oddsHistory: s.oddsHistory ?? f.oddsHistory ?? { games: [] },
    dataStatus: mergeDataStatus(f.dataStatus, s.slowDataStatus),
    _cached: f._cached || s._cached,
  };
}

function mergeDataStatus(fastStatus, slowStatus) {
  const f = fastStatus || {};
  const s = slowStatus || {};
  return {
    scoresCount: f.scoresCount ?? s.scoresCount ?? 0,
    scoresYesterdayCount: f.scoresYesterdayCount ?? 0,
    rankingsCount: f.rankingsCount ?? s.rankingsCount ?? 0,
    oddsCount: s.oddsCount ?? f.oddsCount ?? 0,
    oddsHistoryCount: s.oddsHistoryCount ?? f.oddsHistoryCount ?? 0,
    headlinesCount: s.headlinesCount ?? f.headlinesCount ?? 0,
    atsLeadersCount: s.atsLeadersCount ?? f.atsLeadersCount ?? 0,
    dataStatusLine: [f.dataStatusLine, s.dataStatusLine].filter(Boolean).join(' ') || 'Unknown',
  };
}

/**
 * Fetch fast home data (scores today/yesterday, rankings, pinned meta). Cache 1–3 min.
 * @param {{ pinnedSlugs?: string[] }} options
 */
export async function fetchHomeFast(options = {}) {
  const qs = qsFromOptions(options);
  const key = `home:fast:${qs.toString()}`;
  return coalesce(key, async () => {
    if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development') {
      console.time('[client] fetchHomeFast');
    }
    const url = qs.toString() ? `/api/home/fast?${qs.toString()}` : '/api/home/fast';
    const res = await fetch(url);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    const data = await res.json();
    if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development') {
      console.timeEnd('[client] fetchHomeFast');
    }
    return data;
  });
}

/**
 * Fetch slow home data (headlines, odds, ATS, pinned news, upcoming with spreads). Cache 15–30 min.
 * @param {{ pinnedSlugs?: string[] }} options
 */
export async function fetchHomeSlow(options = {}) {
  const qs = qsFromOptions(options);
  const key = `home:slow:${qs.toString()}`;
  return coalesce(key, async () => {
    if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development') {
      console.time('[client] fetchHomeSlow');
    }
    const url = qs.toString() ? `/api/home/slow?${qs.toString()}` : '/api/home/slow';
    const res = await fetch(url);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    const data = await res.json();
    if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development') {
      console.timeEnd('[client] fetchHomeSlow');
    }
    return data;
  });
}

/**
 * Full home in one call (legacy). Use for Games, DailySchedule, Insights, NewsFeed.
 * @param {{ dates?: string[], pinnedSlugs?: string[] }} options
 * @returns {Promise<{ scores, scoresByDate?, odds, oddsHistory, rankings, headlines, atsLeaders, dataStatus, pinnedTeamNews? }>}
 */
export async function fetchHome(options = {}) {
  const qs = qsFromOptions(options);
  const key = `home:full:${qs.toString()}`;
  return coalesce(key, async () => {
    if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development') {
      console.time('[client] fetchHome');
    }
    const url = qs.toString() ? `/api/home?${qs.toString()}` : '/api/home';
    const res = await fetch(url);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    const data = await res.json();
    if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development') {
      console.timeEnd('[client] fetchHome');
    }
    return data;
  });
}
