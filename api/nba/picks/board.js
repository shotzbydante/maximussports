/**
 * GET /api/nba/picks/board
 *
 * Canonical NBA picks board — mirrors MLB pattern.
 * Fetches 3 days of scheduled games (today + next 2), enriches with odds,
 * returns a normalized candidate list. Picks are classified CLIENT-SIDE
 * from this payload so Home + Odds Insights consume the same contract.
 */

import { createCache } from '../../_cache.js';
import { normalizeEvent, ESPN_SCOREBOARD, FETCH_TIMEOUT_MS } from '../live/_normalize.js';
import { enrichGamesWithOdds } from '../live/_odds.js';

const cache = createCache(90_000); // 90s — don't let empty boards linger

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
  res.setHeader('Cache-Control', 'public, s-maxage=90, stale-while-revalidate=240');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const t0 = Date.now();
  const cacheKey = 'nba:picks:board:v2';

  // Only serve cached payload if it has content; empty caches expire fast
  const cached = cache.get(cacheKey);
  if (cached?.games?.length > 0) {
    return res.status(200).json({ ...cached, _cached: true });
  }

  // Fetch 3 days of games
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

  // Upcoming/scheduled only (exclude live + final)
  const upcoming = allGames.filter(g =>
    g.status === 'upcoming' && !g.gameState?.isLive && !g.gameState?.isFinal
  );

  // Enrich with Odds API (non-blocking — keep games if enrichment fails)
  let enriched = upcoming;
  let oddsJoined = 0;
  let oddsError = null;
  try {
    enriched = await enrichGamesWithOdds(upcoming);
    oddsJoined = enriched.filter(g =>
      g.market?.moneyline != null || g.market?.pregameSpread != null || g.market?.pregameTotal != null
    ).length;
  } catch (err) {
    oddsError = err?.message || 'odds enrichment failed';
    console.warn('[nba/picks/board] odds enrichment failed:', oddsError);
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
      oddsError,
    },
  };

  // Cache only when we have content to serve
  if (enriched.length > 0) cache.set(cacheKey, payload);

  return res.status(200).json(payload);
}
