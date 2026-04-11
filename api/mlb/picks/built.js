/**
 * GET /api/mlb/picks/built
 *
 * Returns fully classified MLB picks ready for rendering.
 * Fetches the board, runs buildMlbPicks(), and returns the result.
 *
 * This endpoint exists so the email pipeline can get built picks
 * via a simple HTTP fetch instead of fragile dynamic imports of
 * client-side modules.
 *
 * Response:
 * {
 *   categories: { pickEms: [...], ats: [...], leans: [...], totals: [...] },
 *   meta: { totalCandidates, qualifiedGames, skippedGames },
 *   generatedAt: ISO string
 * }
 */

import { createCache, coalesce } from '../../_cache.js';
import { normalizeEvent, ESPN_SCOREBOARD, FETCH_TIMEOUT_MS } from '../live/_normalize.js';
import { enrichGamesWithOdds } from '../live/_odds.js';
import { buildMlbPicks } from '../../../src/features/mlb/picks/buildMlbPicks.js';

const cache = createCache(120_000); // 2 min

function getDateStrings(days = 2) {
  const dates = [];
  for (let i = 0; i <= days; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    dates.push(d.toISOString().slice(0, 10).replace(/-/g, ''));
  }
  return dates;
}

async function fetchScoreboardForDate(dateStr) {
  const url = `${ESPN_SCOREBOARD}?dates=${dateStr}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: controller.signal });
    if (!r.ok) return [];
    const data = await r.json();
    return (Array.isArray(data.events) ? data.events : []).map(normalizeEvent).filter(Boolean);
  } catch { return []; }
  finally { clearTimeout(timer); }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=300');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const cacheKey = 'mlb:picks:built';
  const cached = cache.get(cacheKey);
  if (cached) return res.status(200).json({ ...cached, _cached: true });

  try {
    const dateStrings = getDateStrings(2);
    const allGamesArrays = await Promise.all(dateStrings.map(fetchScoreboardForDate));
    let allGames = allGamesArrays.flat();

    // Dedupe
    const seen = new Set();
    allGames = allGames.filter(g => { if (seen.has(g.gameId)) return false; seen.add(g.gameId); return true; });

    // Upcoming only
    const upcoming = allGames.filter(g =>
      g.status === 'upcoming' && !g.gameState?.isLive && !g.gameState?.isFinal
    );

    // Enrich with odds
    let enriched = upcoming;
    try { enriched = await enrichGamesWithOdds(upcoming); }
    catch (err) { console.warn('[mlb/picks/built] odds enrichment failed:', err?.message); }

    console.log(`[mlb/picks/built] Games: total=${allGames.length} upcoming=${upcoming.length} enriched=${enriched.length}`);

    // Build picks
    const result = buildMlbPicks({ games: enriched });

    const c = result.categories;
    console.log(`[mlb/picks/built] Picks: pickEms=${c.pickEms.length} ats=${c.ats.length} leans=${c.leans.length} totals=${c.totals.length} qualified=${result.meta.qualifiedGames}`);

    const payload = {
      ...result,
      generatedAt: new Date().toISOString(),
      _debug: { totalGames: allGames.length, upcoming: upcoming.length, enriched: enriched.length },
    };

    cache.set(cacheKey, payload);
    return res.status(200).json(payload);

  } catch (err) {
    console.error('[mlb/picks/built] FATAL ERROR:', err.message);
    console.error('[mlb/picks/built] Stack:', err.stack);
    // Return 200 with empty categories so the email pipeline doesn't get null
    // but the _error field signals the failure for diagnostics
    return res.status(200).json({
      categories: { pickEms: [], ats: [], leans: [], totals: [] },
      meta: { totalCandidates: 0, qualifiedGames: 0, skippedGames: 0 },
      generatedAt: new Date().toISOString(),
      _error: err.message,
    });
  }
}
