/**
 * nbaPicksBuilder — direct in-process NBA picks board builder.
 *
 * Mirrors `api/_lib/mlbPicksBuilder.js` exactly. Replaces HTTP self-fetches
 * which are unreliable on Vercel serverless (cold starts, timeouts,
 * circular invocations). Both the HTTP handler and any autopost/email
 * pipeline should call this function — single source of truth.
 *
 * Fallback precedence:
 *   1. Fresh build from ESPN scoreboard + NBA odds enrichment
 *   2. KV latest snapshot (nba:picks:built:latest, 15min TTL)
 *   3. KV last-known-good snapshot (nba:picks:built:lastknown, 48hr TTL)
 *      — written whenever a fresh build yields ≥1 pick
 *   4. Empty board (true last resort)
 *
 * NBA-specific notes:
 *   - Uses the V2 engine (buildNbaPicksV2) which returns both `categories`
 *     (legacy pickEms/ats/leans/totals shape the caption builder consumes)
 *     AND `tiers` (V2 output). Downstream caption/normalize code reads
 *     `categories` — identical contract to MLB.
 *   - NBA scoreboard endpoint has no `includeYesterday` flag, so we fetch
 *     today + tomorrow directly (same window MLB uses).
 */

import { normalizeEvent, ESPN_SCOREBOARD, FETCH_TIMEOUT_MS } from '../nba/live/_normalize.js';
import { enrichGamesWithOdds } from '../nba/live/_odds.js';
import { buildNbaPicksV2, NBA_DEFAULT_CONFIG } from '../../src/features/nba/picks/v2/buildNbaPicksV2.js';
import { buildNbaPlayoffContext, findSeriesForGame } from '../../src/data/nba/playoffContext.js';
import { getJson, setJson } from '../_globalCache.js';
import { writePicksRun, getActiveConfig, getScorecard, getLatestGradedScorecard } from './picksHistory.js';
import { yesterdayET } from './dateWindows.js';
import { resolveFairTotalForGame } from './seriesPaceFairTotal.js';
import { adjustFairTotal } from './nbaTotalsHistory.js';

const KV_LATEST = 'nba:picks:built:latest';
const KV_LASTKNOWN = 'nba:picks:built:lastknown';
const LATEST_TTL_SEC = 15 * 60;
const LASTKNOWN_TTL_SEC = 48 * 60 * 60;

function getDateStrings(days = 2) {
  const dates = [];
  for (let i = 0; i <= days; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    dates.push(d.toISOString().slice(0, 10).replace(/-/g, ''));
  }
  return dates;
}

/**
 * Past-window date strings (YYYYMMDD) for the last N days. Used to load
 * recent finals so playoff context (series scores, elimination labels)
 * can be derived for the picks engine.
 */
function getPastDateStrings(days = 7) {
  const dates = [];
  for (let i = 1; i <= days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().slice(0, 10).replace(/-/g, ''));
  }
  return dates;
}

/**
 * Build per-game playoff context (`{[gameId]: { isElimination, isGameSeven, eliminationFor }}`)
 * from a multi-day scoreboard window. Drives the discipline rules for elim
 * + Game 7 spots in buildNbaPicksV2.
 */
function buildPicksGameContext(upcomingGames, windowGames) {
  const ctx = {};
  if (!Array.isArray(upcomingGames) || upcomingGames.length === 0) return ctx;
  let pc;
  try {
    pc = buildNbaPlayoffContext({ liveGames: upcomingGames, windowGames });
  } catch (err) {
    console.warn(`[nbaPicksBuilder] playoff context derive failed: ${err.message}`);
    return ctx;
  }
  if (!pc) return ctx;
  for (const g of upcomingGames) {
    const found = findSeriesForGame(g, pc);
    if (!found?.series) continue;
    const s = found.series;
    if (s.isElimination || s.isGameSeven) {
      ctx[g.gameId] = {
        isElimination: !!s.isElimination,
        isGameSeven:   !!s.isGameSeven,
        eliminationFor: s.eliminationFor || null,
        eliminationLabel: s.eliminationLabel || null,
      };
    }
  }
  return ctx;
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
  } catch (err) {
    console.warn(`[nbaPicksBuilder] scoreboard fetch failed for ${dateStr}: ${err.message}`);
    return [];
  } finally {
    clearTimeout(timer);
  }
}

function countPicks(board) {
  const c = board?.categories || {};
  return (c.pickEms?.length || 0) + (c.ats?.length || 0)
       + (c.leans?.length || 0) + (c.totals?.length || 0);
}

function getCounts(board) {
  const c = board?.categories || {};
  return {
    pickEms: c.pickEms?.length || 0,
    ats: c.ats?.length || 0,
    leans: c.leans?.length || 0,
    totals: c.totals?.length || 0,
    total: countPicks(board),
  };
}

/**
 * Build NBA picks board directly (no HTTP self-fetch).
 *
 * @param {object} [opts]
 * @param {boolean} [opts.preferFresh=false] — force fresh rebuild, ignore KV latest
 * @returns {Promise<{ board, source, counts }>}
 */
export async function buildNbaPicksBoard(opts = {}) {
  const { preferFresh = false } = opts;

  let freshBoard = null;
  let freshError = null;
  try {
    const dateStrings = getDateStrings(2);
    const allGamesArrays = await Promise.all(dateStrings.map(fetchScoreboardForDate));
    let allGames = allGamesArrays.flat();

    // Dedupe
    const seen = new Set();
    allGames = allGames.filter(g => {
      if (seen.has(g.gameId)) return false;
      seen.add(g.gameId);
      return true;
    });

    // Past-week finals — needed only for playoff context derivation
    // (series scores, elimination labels). Best-effort; non-fatal on failure.
    let pastGames = [];
    try {
      const pastArrays = await Promise.all(getPastDateStrings(7).map(fetchScoreboardForDate));
      pastGames = pastArrays.flat().filter(g => {
        if (!g?.gameId) return false;
        if (seen.has(g.gameId)) return false;
        seen.add(g.gameId);
        return true;
      });
    } catch (err) {
      console.warn(`[nbaPicksBuilder] past-window fetch failed: ${err.message}`);
    }
    const windowGames = [...allGames, ...pastGames];

    const upcoming = allGames.filter(g =>
      g.status === 'upcoming' && !g.gameState?.isLive && !g.gameState?.isFinal
    );

    let enriched = upcoming;
    try {
      enriched = await enrichGamesWithOdds(upcoming);
    } catch (err) {
      console.warn(`[nbaPicksBuilder] odds enrichment failed: ${err.message}`);
    }

    // ── Fair-total signal (v7 chain) ──
    // The odds enricher leaves `model.fairTotal === null`. Run the fall-
    // back chain so EVERY game has a fair total (even if low-signal):
    //   1. seriesPaceFairTotal (≥ 2 same-pair priors)
    //   2. teamRecentTotalAverage (each team's last finals)
    //   3. slatePaceBaseline (last-resort directional prior)
    // The resolver tags `source` + `confidence` + `lowSignal`. Builder +
    // discipline use those to label conviction honestly. v6 mirrored
    // market_total when no signal — that's gone; we always show a real
    // signal with honest data quality.
    const totalsSourceCounts = { series_pace_v1: 0, team_recent_v1: 0, slate_baseline_v1: 0, none: 0 };
    let totalsTrendAdjusted = 0;
    enriched = enriched.map(g => {
      const a = g?.teams?.away?.slug;
      const h = g?.teams?.home?.slug;
      const sig = resolveFairTotalForGame({ awaySlug: a, homeSlug: h, windowGames });
      const key = sig.source || 'none';
      totalsSourceCounts[key] = (totalsSourceCounts[key] || 0) + 1;
      if (sig.fairTotal == null) return g;

      // v9: layer historical totals trend on top of the baseline. The
      // closingHistory channel is empty in-process today (no Odds API
      // historical store wired up), so this collapses to a recent-
      // scoring-trend adjustment. Effect is capped to ±3.0 points.
      const trend = adjustFairTotal({
        baseFairTotal: sig.fairTotal,
        baseSource: sig.source,
        baseConfidence: sig.confidence,
        awaySlug: a,
        homeSlug: h,
        windowGames,
        closingHistory: [],
      });
      if (trend.adjustment && Math.abs(trend.adjustment) >= 0.1) totalsTrendAdjusted += 1;

      return {
        ...g,
        model: {
          ...g.model,
          fairTotal: trend.fairTotal ?? sig.fairTotal,
          fairTotalSample: sig.sample,
          fairTotalConfidence: trend.confidence ?? sig.confidence,
          fairTotalSource: trend.source ?? sig.source,
          fairTotalLowSignal: sig.lowSignal,
          fairTotalAdjustment: trend.adjustment ?? 0,
          fairTotalTrendComponents: trend.components ?? null,
        },
      };
    });
    console.log(
      `[nbaPicksBuilder] fair-total chain: series=${totalsSourceCounts.series_pace_v1}, team-recent=${totalsSourceCounts.team_recent_v1}, slate-baseline=${totalsSourceCounts.slate_baseline_v1}, none=${totalsSourceCounts.none}, trend-adjusted=${totalsTrendAdjusted}`
    );

    // Resolve active NBA tuning config (DB > default)
    let activeConfig = NBA_DEFAULT_CONFIG;
    try {
      const dbCfg = await getActiveConfig({ sport: 'nba' });
      if (dbCfg) activeConfig = dbCfg;
    } catch (e) { console.warn(`[nbaPicksBuilder] getActiveConfig failed: ${e?.message}`); }

    // Attach the most recent graded NBA scorecard. We prefer "yesterday" when
    // it actually has results, but fall back to the most recent slate that
    // produced real graded data so the UI never shows a dead blank state when
    // an earlier slate did finish (e.g. yesterday was an off-day).
    let scorecardSummary = null;
    try {
      const ymd = yesterdayET();
      let card = await getScorecard({ sport: 'nba', slateDate: ymd });
      const graded = card?.record
        ? ((card.record.won ?? 0) + (card.record.lost ?? 0) + (card.record.push ?? 0))
        : 0;
      if (!card || graded === 0) {
        const fallback = await getLatestGradedScorecard({ sport: 'nba', lookbackDays: 14 });
        if (fallback) card = fallback;
      }
      if (card) {
        scorecardSummary = {
          date: card.slate_date,
          overall: card.record,
          byMarket: card.by_market,
          byTier: card.by_tier,
          topPlayResult: card.top_play_result,
          streak: card.streak,
          note: card.note,
          // Flag whether this is yesterday or an older fallback slate
          isFallback: card.slate_date !== ymd,
        };
      }
    } catch { /* non-fatal */ }

    // Per-game playoff context (Game 7 / elimination flags) — only attached
    // for games that match a tracked playoff series. The discipline layer
    // uses these to suppress / cap chalk picks in volatile spots.
    const gameContext = buildPicksGameContext(enriched, windowGames);
    if (Object.keys(gameContext).length > 0) {
      console.log(`[nbaPicksBuilder] playoff context attached to ${Object.keys(gameContext).length} game(s)`);
    }

    const result = buildNbaPicksV2({
      games: enriched,
      config: activeConfig,
      scorecardSummary,
      gameContext,
      // No injury feed yet — engine assumes worst-case and refuses Top Play
      // for favorites. Flip this to `true` once an injury source is wired.
      injuryDataAvailable: false,
    });
    freshBoard = {
      ...result,
      _debug: { totalGames: allGames.length, upcoming: upcoming.length, enriched: enriched.length, engine: 'v2' },
    };

    const freshCount = countPicks(freshBoard);
    console.log(
      `[nbaPicksBuilder] fresh V2 build: total=${freshCount} ` +
      `t1=${freshBoard.tiers?.tier1?.length || 0} ` +
      `t2=${freshBoard.tiers?.tier2?.length || 0} ` +
      `t3=${freshBoard.tiers?.tier3?.length || 0} ` +
      `coverage=${freshBoard.coverage?.length || 0} ` +
      `upcoming=${upcoming.length} enriched=${enriched.length}`
    );

    if (freshCount > 0) {
      setJson(KV_LATEST, freshBoard, { exSeconds: LATEST_TTL_SEC }).catch(() => {});
      setJson(KV_LASTKNOWN, freshBoard, { exSeconds: LASTKNOWN_TTL_SEC }).catch(() => {});

      // Best-effort DB persistence — non-blocking. Any failure just logs.
      Promise.resolve()
        .then(() => writePicksRun(freshBoard))
        .then(r => {
          if (!r) return;
          if (!r.ok) {
            console.error(
              `[nbaPicksBuilder] ⚠ persist failed reason=${r.reason} ` +
              `inserted=${r.picksInserted ?? 0}/${r.picksAttempted ?? 0} ` +
              `first="${r.failures?.[0]?.message || 'n/a'}"`
            );
          }
        })
        .catch(err => console.error(`[nbaPicksBuilder] persist threw: ${err?.message}`));

      return { board: freshBoard, source: 'fresh', counts: getCounts(freshBoard) };
    }
  } catch (err) {
    freshError = err.message;
    console.warn(`[nbaPicksBuilder] fresh build failed: ${err.message}`);
  }

  if (!preferFresh) {
    try {
      const latest = await getJson(KV_LATEST);
      const latestCount = countPicks(latest);
      if (latestCount > 0) {
        console.log(`[nbaPicksBuilder] using KV latest snapshot: total=${latestCount}`);
        return { board: latest, source: 'kv_latest', counts: getCounts(latest) };
      }
    } catch (err) {
      console.warn(`[nbaPicksBuilder] KV latest read failed: ${err.message}`);
    }
  }

  try {
    const lastknown = await getJson(KV_LASTKNOWN);
    const lastknownCount = countPicks(lastknown);
    if (lastknownCount > 0) {
      console.log(`[nbaPicksBuilder] using KV last-known-good: total=${lastknownCount}`);
      return { board: lastknown, source: 'kv_lastknown', counts: getCounts(lastknown) };
    }
  } catch (err) {
    console.warn(`[nbaPicksBuilder] KV lastknown read failed: ${err.message}`);
  }

  const emptyBoard = freshBoard || {
    categories: { pickEms: [], ats: [], leans: [], totals: [] },
    meta: { totalCandidates: 0, qualifiedGames: 0, skippedGames: 0 },
    generatedAt: new Date().toISOString(),
    _error: freshError || 'no data available',
  };
  console.warn(`[nbaPicksBuilder] all sources empty — returning empty board (last resort)`);
  return { board: emptyBoard, source: 'empty', counts: getCounts(emptyBoard) };
}
