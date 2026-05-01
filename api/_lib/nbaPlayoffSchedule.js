/**
 * nbaPlayoffSchedule — multi-day ESPN scoreboard window fetcher.
 *
 * The default /api/nba/live/games endpoint only pulls today. The Daily
 * Briefing needs a wider window to compute real series state:
 *   - last 7 days of finals → series wins, clinchers
 *   - today → live + scheduled games
 *   - tomorrow → "next game" hints
 *
 * Implementation: fan out N parallel ESPN scoreboard calls keyed by date,
 * then dedupe by gameId. Each call uses the same normalizeEvent() that
 * the live endpoint uses, so downstream consumers see one canonical
 * game shape regardless of source.
 *
 * Also emits [NBA_PLAYOFF_SCHEDULE_WINDOW] for diagnosability.
 */

import { normalizeEvent, ESPN_SCOREBOARD, FETCH_TIMEOUT_MS } from '../nba/live/_normalize.js';
import { enrichGamesWithOdds } from '../nba/live/_odds.js';

/** Format a Date as YYYYMMDD (ESPN's required format). */
function fmt(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${dd}`;
}

function dayKey(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return fmt(d);
  } catch { return ''; }
}

/**
 * Build a date list from `daysBack` ago (inclusive) through `daysForward`.
 *
 * @param {object} opts
 * @param {number} [opts.daysBack=21]
 * @param {number} [opts.daysForward=1]
 *
 * Default 21 days back: NBA Round 1 series can extend up to 17 calendar
 * days (Game 1 to Game 7 with travel days). Plus we add safety margin
 * for ESPN's date convention quirks — games that start at 9pm Pacific
 * appear under the next UTC day in some ESPN endpoints, so a 14-day
 * window from May 1 might not see an Apr 18 9pm-Pacific tipoff at all
 * (it'd be filed under Apr 19 UTC, but only if our query happened to
 * hit that day). 21 days covers any Round 1 series start through Round 2
 * with comfortable overlap.
 *
 * @returns {string[]} array of YYYYMMDD strings
 */
function getDateRange({ daysBack = 21, daysForward = 1 } = {}) {
  const dates = [];
  const today = new Date();
  for (let i = -daysBack; i <= daysForward; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    dates.push(fmt(d));
  }
  return dates;
}

async function fetchScoreboardForDate(dateStr) {
  const url = `${ESPN_SCOREBOARD}?dates=${dateStr}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: controller.signal });
    if (!r.ok) {
      console.warn(`[NBA_PLAYOFF_WINDOW_FETCH] ${dateStr} http=${r.status} games=0`);
      return [];
    }
    const data = await r.json();
    const events = Array.isArray(data.events) ? data.events : [];
    const normalized = events.map(normalizeEvent).filter(Boolean);
    // Per-date diagnostic so we can see exactly what ESPN returned for
    // each day. Critical when debugging series-score bugs (e.g.
    // "Lakers lead 3-2" vs "Rockets lead 2-1" — if a Game 1 is missing,
    // this log shows the gap).
    const finalCount = normalized.filter(g => g.gameState?.isFinal || g.status === 'final').length;
    console.log(`[NBA_PLAYOFF_WINDOW_FETCH] ${dateStr} games=${normalized.length} finals=${finalCount}`);
    return normalized;
  } catch (err) {
    console.warn(`[NBA_PLAYOFF_WINDOW_FETCH] ${dateStr} error="${err.message}" games=0`);
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch a multi-day ESPN scoreboard window and dedupe by gameId.
 * Optionally enriches with odds (for picks/spread context).
 *
 * @param {object} [opts]
 * @param {number} [opts.daysBack=14]   — default 14 to cover full Round 1
 * @param {number} [opts.daysForward=1]
 * @param {boolean} [opts.enrichOdds=false]
 * @returns {Promise<{ games: Array, dates: string[], counts: object }>}
 */
export async function fetchNbaPlayoffScheduleWindow(opts = {}) {
  const { daysBack = 14, daysForward = 1, enrichOdds = false } = opts;
  const dates = getDateRange({ daysBack, daysForward });

  const arrays = await Promise.all(dates.map(fetchScoreboardForDate));
  let allGames = arrays.flat();

  // Dedupe by gameId — same game may appear in adjacent days when the
  // scheduled time crosses midnight UTC.
  const seen = new Set();
  allGames = allGames.filter(g => {
    if (!g?.gameId || seen.has(g.gameId)) return false;
    seen.add(g.gameId);
    return true;
  });

  if (enrichOdds) {
    try { allGames = await enrichGamesWithOdds(allGames); }
    catch { /* odds enrichment is non-fatal */ }
  }

  // Counts by status for diagnostics
  const counts = {
    total: allGames.length,
    final: 0,
    live: 0,
    upcoming: 0,
  };
  for (const g of allGames) {
    if (g.gameState?.isFinal || g.status === 'final') counts.final += 1;
    else if (g.gameState?.isLive || g.status === 'live') counts.live += 1;
    else counts.upcoming += 1;
  }

  console.log('[NBA_PLAYOFF_SCHEDULE_WINDOW]', JSON.stringify({
    startDate: dates[0],
    endDate: dates[dates.length - 1],
    dateCount: dates.length,
    gameCount: allGames.length,
    finalCount: counts.final,
    scheduledCount: counts.upcoming,
    liveCount: counts.live,
  }));

  return { games: allGames, dates, counts };
}

export { dayKey, fmt as formatDateKey };
