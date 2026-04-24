/**
 * GET /api/nba/picks/built
 *
 * Canonical NBA picks endpoint — mirrors /api/mlb/picks/built.
 * Builds v2 payload (tiers + coverage + topPick + scorecardSummary + meta)
 * from the live NBA scoreboard + odds enricher. Persists every build to
 * `picks_runs` + `picks` non-blocking so settlement + scorecards can run.
 */

import { createCache } from '../../_cache.js';
import { fetchScoreboard } from '../live/_normalize.js';
import { enrichGamesWithOdds } from '../live/_odds.js';
import { buildNbaPicksV2, NBA_DEFAULT_CONFIG } from '../../../src/features/nba/picks/v2/buildNbaPicksV2.js';
import { writePicksRun, getScorecard } from '../../_lib/picksHistory.js';
import { yesterdayET } from '../../_lib/dateWindows.js';

const cache = createCache(120_000); // 2 min

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=300');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const cacheKey = 'nba:picks:built';
  const cached = cache.get(cacheKey);
  if (cached) return res.status(200).json({ ...cached, _cached: true });

  try {
    let games = await fetchScoreboard();
    try { games = await enrichGamesWithOdds(games); }
    catch (err) { console.warn('[nba/picks/built] odds enrichment failed:', err?.message); }

    const upcoming = games.filter(g =>
      g.status === 'upcoming' && !g.gameState?.isLive && !g.gameState?.isFinal
    );

    // Attach yesterday's ET scorecard summary when available
    let scorecardSummary = null;
    try {
      const card = await getScorecard({ sport: 'nba', slateDate: yesterdayET() });
      if (card) {
        scorecardSummary = {
          date: card.slate_date,
          overall: card.record,
          byMarket: card.by_market,
          byTier: card.by_tier,
          topPlayResult: card.top_play_result,
          streak: card.streak,
          note: card.note,
        };
      }
    } catch { /* non-fatal */ }

    const v2 = buildNbaPicksV2({ games: upcoming, config: NBA_DEFAULT_CONFIG, scorecardSummary });

    console.log(
      `[nba/picks/built] V2 tiers: t1=${v2.tiers.tier1.length} t2=${v2.tiers.tier2.length} t3=${v2.tiers.tier3.length} ` +
      `qualified=${v2.meta.qualifiedGames} published=${v2.meta.picksPublished} coverage=${v2.meta.coverageAvailable || 0}`
    );

    const payload = {
      ...v2,
      _debug: { totalGames: games.length, upcoming: upcoming.length, engine: 'v2' },
    };

    cache.set(cacheKey, payload);

    // Best-effort DB persistence — never blocks the hot path
    Promise.resolve()
      .then(() => writePicksRun(payload))
      .then(r => {
        if (!r) return;
        if (!r.ok) {
          console.error(
            `[nba/picks/built] ⚠ persist failed reason=${r.reason} ` +
            `inserted=${r.picksInserted ?? 0}/${r.picksAttempted ?? 0} ` +
            `first="${r.failures?.[0]?.message || 'n/a'}"`
          );
        }
      })
      .catch(err => console.error(`[nba/picks/built] persist threw: ${err?.message}`));

    return res.status(200).json(payload);
  } catch (err) {
    console.error('[nba/picks/built] FATAL:', err.message);
    return res.status(200).json({
      sport: 'nba',
      tiers: { tier1: [], tier2: [], tier3: [] },
      coverage: [],
      topPick: null,
      meta: { picksPublished: 0 },
      categories: { pickEms: [], ats: [], leans: [], totals: [] },
      generatedAt: new Date().toISOString(),
      _error: err.message,
    });
  }
}
