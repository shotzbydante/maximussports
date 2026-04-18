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
import { setJson } from '../../_globalCache.js';
import { normalizeEvent, ESPN_SCOREBOARD, FETCH_TIMEOUT_MS } from '../live/_normalize.js';
import { enrichGamesWithOdds } from '../live/_odds.js';
import { buildMlbPicks } from '../../../src/features/mlb/picks/buildMlbPicks.js';
import { buildMlbPicksV2 } from '../../../src/features/mlb/picks/v2/buildMlbPicksV2.js';
import { MLB_DEFAULT_CONFIG } from '../../../src/features/picks/tuning/defaultConfig.js';
import { writePicksRun, getActiveConfig, getScorecard } from '../../_lib/picksHistory.js';

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

    // Resolve active tuning config (DB > default) — fail safe to default
    let activeConfig = MLB_DEFAULT_CONFIG;
    try {
      const dbCfg = await getActiveConfig({ sport: 'mlb' });
      if (dbCfg) activeConfig = dbCfg;
    } catch (e) { console.warn('[mlb/picks/built] getActiveConfig failed:', e?.message); }

    // ── V2 canonical build (default when PICKS_V2 != '0') ──
    const useV2 = process.env.PICKS_V2 !== '0';
    let payload;
    if (useV2) {
      // Attach yesterday's scorecard summary if available
      let scorecardSummary = null;
      try {
        const y = new Date(); y.setDate(y.getDate() - 1);
        const ymd = y.toISOString().slice(0, 10);
        const card = await getScorecard({ sport: 'mlb', slateDate: ymd });
        if (card) {
          scorecardSummary = {
            date: ymd,
            overall: card.record,
            byMarket: card.by_market,
            byTier: card.by_tier,
            topPlayResult: card.top_play_result,
            streak: card.streak,
            note: card.note,
          };
        }
      } catch (e) { /* non-fatal */ }

      const v2 = buildMlbPicksV2({
        games: enriched,
        config: activeConfig,
        scorecardSummary,
      });
      console.log(
        `[mlb/picks/built] V2 tiers: t1=${v2.tiers.tier1.length} t2=${v2.tiers.tier2.length} t3=${v2.tiers.tier3.length} ` +
        `qualified=${v2.meta.qualifiedGames} published=${v2.meta.picksPublished}`
      );
      payload = { ...v2, _debug: { totalGames: allGames.length, upcoming: upcoming.length, enriched: enriched.length, engine: 'v2' } };

      // Persistence — we SYNCHRONOUSLY await it when ?debug=persistence is set
      // so the operator can inspect per-row success in the HTTP response. In
      // normal mode we still fire-and-forget to keep the hot path fast.
      const wantPersistDebug = req?.query?.debug === 'persistence';
      if (wantPersistDebug) {
        // Mark the payload so writePicksRun emits a first-row preview log
        const persistResult = await writePicksRun({ ...payload, _persistDebug: true });
        payload._persistence = persistResult;
        if (!persistResult?.ok) {
          console.error(
            `[mlb/picks/built] ❌ debug persist failed reason=${persistResult?.reason} ` +
            `inserted=${persistResult?.picksInserted}/${persistResult?.picksAttempted} ` +
            `first=${persistResult?.failures?.[0]?.message || 'n/a'}`
          );
        }
      } else {
        // Best-effort, non-blocking
        Promise.resolve()
          .then(() => writePicksRun(payload))
          .then(r => {
            if (!r) return;
            if (!r.ok) {
              console.error(
                `[mlb/picks/built] ⚠ persist failed reason=${r.reason} ` +
                `inserted=${r.picksInserted ?? 0}/${r.picksAttempted ?? 0} ` +
                `firstFailure="${r.failures?.[0]?.message || 'n/a'}"`
              );
            }
          })
          .catch(err => console.error('[mlb/picks/built] persist threw:', err?.message));
      }
    } else {
      const result = buildMlbPicks({ games: enriched });
      const c = result.categories;
      console.log(`[mlb/picks/built] V1 Picks: pickEms=${c.pickEms.length} ats=${c.ats.length} leans=${c.leans.length} totals=${c.totals.length} qualified=${result.meta.qualifiedGames}`);
      payload = { ...result, generatedAt: new Date().toISOString(), _debug: { totalGames: allGames.length, upcoming: upcoming.length, enriched: enriched.length, engine: 'v1' } };
    }

    cache.set(cacheKey, payload);
    // Persist to KV so email pipeline can read directly (avoid self-fetch)
    setJson('mlb:picks:built:latest', payload, { exSeconds: 900 }).catch(() => {});
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
