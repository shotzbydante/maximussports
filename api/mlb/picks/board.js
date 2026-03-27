/**
 * GET /api/mlb/picks/board
 *
 * MLB upcoming picks board — fetches scheduled games for the next 2 days,
 * enriches with odds, and returns a normalized candidate list ready for
 * client-side pick generation.
 *
 * This is the canonical data source for MLB Maximus's Picks.
 */

import { createCache, coalesce } from '../../_cache.js';
import { normalizeEvent, resolveTeam, ESPN_SCOREBOARD, FETCH_TIMEOUT_MS } from '../live/_normalize.js';
import { enrichGamesWithOdds } from '../live/_odds.js';

const cache = createCache(120_000); // 2 min cache

/**
 * Fetch ESPN scoreboard for a specific date.
 * @param {string} dateStr - YYYYMMDD format
 */
async function fetchScoreboardForDate(dateStr) {
  const url = `${ESPN_SCOREBOARD}?dates=${dateStr}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: controller.signal });
    if (!r.ok) return [];
    const data = await r.json();
    const events = Array.isArray(data.events) ? data.events : [];
    return events.map(normalizeEvent).filter(Boolean);
  } catch { return []; }
  finally { clearTimeout(timer); }
}

/**
 * Get YYYYMMDD strings for today and next N days.
 */
function getDateStrings(days = 2) {
  const dates = [];
  for (let i = 0; i <= days; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    dates.push(d.toISOString().slice(0, 10).replace(/-/g, ''));
  }
  return dates;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=300');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const t0 = Date.now();
  const cacheKey = 'mlb:picks:board';
  const cached = cache.get(cacheKey);
  if (cached) {
    return res.status(200).json({ ...cached, _cached: true });
  }

  // Fetch 3 days of games (today + next 2)
  const dateStrings = getDateStrings(2);
  const allGamesArrays = await Promise.all(dateStrings.map(fetchScoreboardForDate));
  let allGames = allGamesArrays.flat();

  // Dedupe by gameId
  const seen = new Set();
  allGames = allGames.filter(g => {
    if (seen.has(g.gameId)) return false;
    seen.add(g.gameId);
    return true;
  });

  // Filter to upcoming/scheduled only (not live, not final)
  const upcoming = allGames.filter(g =>
    g.status === 'upcoming' && !g.gameState?.isLive && !g.gameState?.isFinal
  );

  // Enrich with Odds API data
  let enriched = upcoming;
  let oddsJoined = 0;
  try {
    enriched = await enrichGamesWithOdds(upcoming);
    oddsJoined = enriched.filter(g =>
      g.market?.moneyline != null || g.market?.pregameSpread != null
    ).length;
  } catch (err) {
    console.warn('[mlb/picks/board] odds enrichment failed:', err?.message);
  }

  const payload = {
    games: enriched,
    meta: {
      totalFetched: allGames.length,
      upcoming: upcoming.length,
      withOdds: oddsJoined,
      dates: dateStrings,
      generatedAt: new Date().toISOString(),
      durationMs: Date.now() - t0,
    },
  };

  cache.set(cacheKey, payload);
  return res.status(200).json(payload);
}
