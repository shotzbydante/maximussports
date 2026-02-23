/**
 * Consolidated Home/Games API: one call for scores, odds, rankings, headlines, atsLeaders, dataStatus.
 * Optional: ?dates=YYYYMMDD,YYYYMMDD for scoresByDate; ?pinnedSlugs=slug1,slug2 for pinnedTeamNews.
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

/**
 * @param {{ dates?: string[], pinnedSlugs?: string[] }} options
 * @returns {Promise<{ scores, scoresByDate?, odds, oddsHistory, rankings, headlines, atsLeaders, dataStatus, pinnedTeamNews? }>}
 */
export async function fetchHome(options = {}) {
  const { dates, pinnedSlugs } = options;
  const qs = new URLSearchParams();
  if (Array.isArray(dates) && dates.length > 0) qs.set('dates', dates.join(','));
  if (Array.isArray(pinnedSlugs) && pinnedSlugs.length > 0) qs.set('pinnedSlugs', pinnedSlugs.join(','));
  const key = `home:${qs.toString()}`;
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
