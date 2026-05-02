/**
 * GET /api/nba/picks/scorecard?date=YYYY-MM-DD&includePicks=1
 *
 * Returns the scorecard for the requested NBA slate.
 *
 * Behavior:
 *   - With ?date=YYYY-MM-DD: returns that exact slate (or null if missing).
 *   - Without ?date: returns the most recent graded NBA slate (preferring
 *     yesterday ET when graded; falling back through the last 14 days when
 *     yesterday has no graded results).
 *   - With ?includePicks=1: returns every published pick for that slate
 *     joined with grading + final scores so the UI can render a full
 *     per-pick report. Also returns `totals` (overall + per-market record).
 */

import {
  getScorecard,
  getLatestGradedScorecard,
  getPicksForSlate,
  findLatestGradedSlate,
} from '../../_lib/picksHistory.js';
import { yesterdayET } from '../../_lib/dateWindows.js';
import { fetchYesterdayFinals } from '../live/_normalize.js';
import { autoHealSlate } from '../../_lib/autoHealSlate.js';

/** Inclusive day delta between two YYYY-MM-DD strings (a - b in days). */
function daysBetween(a, b) {
  if (!a || !b) return Infinity;
  const da = Date.parse(`${a}T00:00:00Z`);
  const db = Date.parse(`${b}T00:00:00Z`);
  if (!isFinite(da) || !isFinite(db)) return Infinity;
  return Math.round((da - db) / 86400000);
}

/** Compute Won/Lost/Push/Pending + plain-English reason for one pick. */
function annotatePick(pick) {
  // pick_results joins via primary key (pick_id is PK referencing picks.id),
  // so PostgREST returns it as either an object (1-to-1) or array depending
  // on relationship inference. Handle both shapes — same convention used
  // throughout this file (lines 206, 264, 368) and the MLB scorecard.
  const rawResult = pick?.pick_results;
  const result = Array.isArray(rawResult) ? rawResult[0] : rawResult || null;
  const status = result?.status || 'pending';
  const awayScore = result?.final_away_score;
  const homeScore = result?.final_home_score;
  const hasFinal = awayScore != null && homeScore != null;

  const market = pick.market_type;       // 'moneyline' | 'runline' | 'total'
  const side = pick.selection_side;      // 'home'|'away'|'over'|'under'
  const line = pick.line_value;          // numeric, may be null
  const price = pick.price_american;     // moneyline price

  // Build human-readable pick label
  let pickLabel = '';
  if (market === 'moneyline') {
    const team = side === 'home' ? pick.home_team_slug : pick.away_team_slug;
    pickLabel = `${(team || '').toUpperCase()} ML${price != null ? ` ${price > 0 ? '+' : ''}${price}` : ''}`;
  } else if (market === 'runline' || market === 'spread') {
    const team = side === 'home' ? pick.home_team_slug : pick.away_team_slug;
    const teamLine = side === 'home' ? line : (line != null ? -line : null);
    const lineStr = teamLine != null ? `${teamLine > 0 ? '+' : ''}${teamLine}` : '';
    pickLabel = `${(team || '').toUpperCase()} ${lineStr}`.trim();
  } else if (market === 'total') {
    const ouLabel = side === 'over' ? 'OVER' : 'UNDER';
    pickLabel = `${ouLabel} ${line != null ? line : ''}`.trim();
  }

  // Final score display + result reason text
  let finalScore = null;
  let resultReason = null;
  if (hasFinal) {
    finalScore = `${(pick.away_team_slug || '').toUpperCase()} ${awayScore} – ${(pick.home_team_slug || '').toUpperCase()} ${homeScore}`;

    if (market === 'moneyline') {
      const winner = awayScore > homeScore ? 'away' : awayScore < homeScore ? 'home' : 'tie';
      const winnerName = winner === 'away' ? pick.away_team_slug
                       : winner === 'home' ? pick.home_team_slug : null;
      if (status === 'won') resultReason = `${(winnerName || '').toUpperCase()} won outright.`;
      else if (status === 'lost') resultReason = `${(winnerName || '').toUpperCase()} won the game.`;
      else if (status === 'push') resultReason = `Game ended tied.`;
    } else if (market === 'runline' || market === 'spread') {
      const margin = (side === 'home' ? homeScore - awayScore : awayScore - homeScore);
      const lineForSide = side === 'home' ? line : (line != null ? -line : null);
      if (lineForSide != null) {
        const cover = margin + lineForSide;
        if (status === 'won') resultReason = `Covered by ${Math.abs(cover).toFixed(1)} points.`;
        else if (status === 'lost') resultReason = `Lost cover by ${Math.abs(cover).toFixed(1)} points.`;
        else if (status === 'push') resultReason = `Margin landed exactly on the spread.`;
      }
    } else if (market === 'total') {
      const totalScore = awayScore + homeScore;
      if (line != null) {
        const diff = totalScore - line;
        if (status === 'won') resultReason = side === 'over'
          ? `Total finished ${totalScore} — over by ${diff.toFixed(1)}.`
          : `Total finished ${totalScore} — under by ${Math.abs(diff).toFixed(1)}.`;
        else if (status === 'lost') resultReason = side === 'over'
          ? `Total finished ${totalScore} — came up ${Math.abs(diff).toFixed(1)} short.`
          : `Total finished ${totalScore} — went ${diff.toFixed(1)} over.`;
        else if (status === 'push') resultReason = `Total landed exactly on the line.`;
      }
    }
  }

  return {
    id: pick.id,
    pickKey: pick.pick_key,
    gameId: pick.game_id,
    awayTeam: pick.away_team_slug,
    homeTeam: pick.home_team_slug,
    matchup: `${(pick.away_team_slug || '').toUpperCase()} @ ${(pick.home_team_slug || '').toUpperCase()}`,
    marketType: market,
    selectionSide: side,
    lineValue: line,
    priceAmerican: price,
    pickLabel,
    convictionTier: pick.tier,
    betScore: pick.bet_score,
    rawEdge: pick.raw_edge,
    modelProb: pick.model_prob,
    impliedProb: pick.implied_prob,
    topSignals: pick.top_signals,
    rationale: pick.rationale,
    startTime: pick.start_time,
    status,
    finalAwayScore: awayScore,
    finalHomeScore: homeScore,
    finalScore,
    resultReason,
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  // Edge caching is intentionally minimal here. The scorecard transitions
  // from "pending" → "graded" mid-day as games go final, and a stale 5-min
  // edge cache was confirmed to serve a "Most Recent Graded Slate" headline
  // backed by all-pending picks. Short TTL with revalidation keeps the
  // surface honest without fully disabling the cache.
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=30, must-revalidate');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const explicitDate = req.query?.date && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)
    ? req.query.date : null;
  const includePicks = req.query?.includePicks === '1';
  const requestedSlate = explicitDate || yesterdayET();

  try {
    // ── Slate selection ────────────────────────────────────────────────
    // Priority for Model Performance:
    //   1. Explicit ?date=  → use as-is.
    //   2. yesterdayET()     → only if it actually has graded picks.
    //   3. Walk back through the picks table (source of truth) to find
    //      the most recent slate where at least one pick is graded.
    //   4. Fall back to picks_daily_scorecards row if present (covers
    //      the case where settle wrote results but no picks rows exist
    //      in window — extremely rare).
    //   5. Else: surface no graded slate (UI handles the empty state).
    let card = null;
    let selectedSlate = null;
    let selectedReason = null;
    let usedFallback = false;
    let diagnostics = {
      requestedDate: requestedSlate,
      explicit: !!explicitDate,
      skippedPendingOnlySlates: [],
      latestGradedSlate: null,
      scannedSlates: [],
      todayPendingSlate: null,
      todayPendingCount: 0,
    };

    if (explicitDate) {
      card = await getScorecard({ sport: 'nba', slateDate: explicitDate });
      selectedSlate = explicitDate;
      selectedReason = 'explicit_date';
    } else {
      // ── Target prior slate inspection ────────────────────────────────
      // The canonical "Model Performance" slate is yesterdayET() — the
      // last completed sports slate. Check what state it's in BEFORE
      // walking back through history, so we can:
      //   • Prefer it when it's already row-graded.
      //   • Show "Apr 30 awaiting settlement" when it has picks + finals
      //     but no pick_results yet (settle cron hasn't run / failed).
      //   • Show today's pending picks live (separate from performance).
      const targetPrior = requestedSlate; // yesterdayET()
      const heal = {
        settleUrl: `/api/cron/nba/settle-yesterday?date=${targetPrior}&force=1`,
        scorecardUrl: `/api/cron/nba/build-scorecard?date=${targetPrior}`,
        debugUrl: `/api/nba/picks/scorecard-debug?date=${targetPrior}`,
      };
      let targetPriorSummary = {
        date: targetPrior,
        picksCount: 0,
        rowGradedCount: 0,
        picksWithoutResults: 0,
        finalsCount: null,
        awaitingSettlement: false,
        awaitingFinals: false,
        readyToShow: false,
        healUrls: heal,
      };
      try {
        const { picks: priorPicks } = await getPicksForSlate({
          sport: 'nba', slateDate: targetPrior,
        });
        targetPriorSummary.picksCount = priorPicks.length;
        let priorGraded = 0;
        let priorMissing = 0;
        for (const p of priorPicks) {
          const r = Array.isArray(p.pick_results) ? p.pick_results[0] : p.pick_results;
          if (!r) priorMissing += 1;
          else if (r.status === 'won' || r.status === 'lost' || r.status === 'push') priorGraded += 1;
        }
        targetPriorSummary.rowGradedCount = priorGraded;
        targetPriorSummary.picksWithoutResults = priorMissing;

        if (priorPicks.length > 0 && priorGraded === 0) {
          // Pull ESPN finals for that slate to distinguish "awaiting
          // settlement" (games are final, settle just hasn't run) from
          // "awaiting finals" (games still in progress).
          try {
            const finals = await fetchYesterdayFinals({ slateDate: targetPrior });
            targetPriorSummary.finalsCount = (finals || []).length;
            if (targetPriorSummary.finalsCount > 0) {
              targetPriorSummary.awaitingSettlement = true;
            } else {
              targetPriorSummary.awaitingFinals = true;
            }
          } catch (e) {
            targetPriorSummary._finalsError = e?.message;
          }
        } else if (priorPicks.length > 0 && priorGraded > 0) {
          targetPriorSummary.readyToShow = true;
        }
      } catch (e) {
        targetPriorSummary._priorError = e?.message;
      }
      diagnostics.targetPrior = targetPriorSummary;

      // ── Auto-heal: when the target prior slate has picks + finals but
      // 0 row-level grades, run the same grading logic the cron runs and
      // write pick_results inline. Bounded by a 4.5s timeout so the
      // request never hangs. After healing, re-run the target-prior
      // inspection so downstream selection sees the freshly-graded data.
      if (
        targetPriorSummary.awaitingSettlement &&
        !req.query?.skipHeal
      ) {
        const heal = await autoHealSlate({
          sport: 'nba',
          slateDate: targetPrior,
          fetchFinals: ({ slateDate }) => fetchYesterdayFinals({ slateDate }),
          timeoutMs: 4500,
        });
        diagnostics.autoHeal = heal;
        diagnostics.autoHealAttempted = heal.attempted;
        diagnostics.autoHealSucceeded = heal.succeeded;

        if (heal.succeeded) {
          // Re-fetch the target prior summary so the rest of the pipeline
          // treats it as ready-to-show.
          try {
            const { picks: priorPicks } = await getPicksForSlate({
              sport: 'nba', slateDate: targetPrior,
            });
            let priorGraded = 0;
            for (const p of priorPicks) {
              const r = Array.isArray(p.pick_results) ? p.pick_results[0] : p.pick_results;
              if (r && (r.status === 'won' || r.status === 'lost' || r.status === 'push')) priorGraded += 1;
            }
            targetPriorSummary.rowGradedCount = priorGraded;
            targetPriorSummary.awaitingSettlement = priorGraded === 0;
            targetPriorSummary.readyToShow = priorGraded > 0;
          } catch (e) {
            diagnostics._postHealError = e?.message;
          }
        }
      }

      // Inspect both source-of-truth surfaces in parallel:
      //   a) per-pick rows (picks ⨝ pick_results)
      //   b) aggregate scorecard rows (picks_daily_scorecards.record)
      // Pick whichever is most recent. This avoids regressing to a stale
      // row-level slate when the aggregate has more recent graded data
      // (or vice-versa).
      const [graded, aggRow] = await Promise.all([
        findLatestGradedSlate({ sport: 'nba', lookbackDays: 21 }),
        getLatestGradedScorecard({ sport: 'nba', lookbackDays: 21 }),
      ]);
      diagnostics.latestPickResultsSlate = graded.latestGradedSlate;
      diagnostics.latestScorecardSlate = aggRow?.slate_date || null;
      diagnostics.latestGradedSlate = graded.latestGradedSlate; // legacy alias
      diagnostics.skippedPendingOnlySlates = graded.skippedPendingOnlySlates;
      diagnostics.scannedSlates = graded.scannedSlates;
      diagnostics.gradedRowsFound = !!graded.latestGradedSlate;
      diagnostics.aggregateScorecardsFound = !!aggRow;
      // Track the most recent pending-only slate so the UI can show a
      // small "Today's slate is still pending" note.
      diagnostics.todayPendingSlate = graded.skippedPendingOnlySlates[0] || null;

      const yesterday = requestedSlate;
      const rowSlate = graded.latestGradedSlate;
      const aggSlate = aggRow?.slate_date || null;
      // Prefer row-level graded data (richer UI: per-pick rows with final
      // scores + reasons). Only fall back to aggregate when EITHER no
      // row-graded slate exists, OR the aggregate slate is meaningfully
      // newer (>= 2 days) — avoids picking yesterday's aggregate over a
      // recent row-graded slate just because aggregate ran later.
      const preferAgg = aggSlate && (
        !rowSlate ||
        (aggSlate > rowSlate && daysBetween(aggSlate, rowSlate) >= 2)
      );

      if (preferAgg) {
        card = aggRow;
        selectedSlate = aggSlate;
        selectedReason = (aggSlate === yesterday) ? 'yesterday_graded' : 'scorecard_table_fallback';
        usedFallback = aggSlate !== yesterday;
      } else if (rowSlate === yesterday) {
        card = await getScorecard({ sport: 'nba', slateDate: yesterday });
        selectedSlate = yesterday;
        selectedReason = 'yesterday_graded';
      } else if (rowSlate) {
        card = await getScorecard({ sport: 'nba', slateDate: rowSlate });
        selectedSlate = rowSlate;
        selectedReason = 'latest_graded_fallback';
        usedFallback = true;
      } else {
        selectedSlate = yesterday;
        selectedReason = 'no_graded_slate';
        diagnostics.reasonIfNoGradedData =
          'No graded pick_results rows and no graded picks_daily_scorecards rows in 21-day lookback.';
      }

      // If yesterday (the canonical target prior slate) had picks but is
      // not the slate we ended up selecting, surface why — so the UI can
      // show "Apr 30 awaiting settlement" instead of silently rendering
      // Apr 27 as the headline.
      if (
        diagnostics.targetPrior?.picksCount > 0 &&
        selectedSlate !== yesterday
      ) {
        if (diagnostics.targetPrior.awaitingSettlement) {
          // Picks exist + games final but no pick_results — operator action
          // needed (settle cron failed, or aggregate-only state).
          selectedReason = 'awaiting_settlement';
        } else if (diagnostics.targetPrior.awaitingFinals) {
          selectedReason = 'awaiting_finals';
        }
        // Always tag the older slate as a fallback in this case.
        usedFallback = true;
      }
    }

    let picks = [];
    let totals = null;
    if (includePicks && (card?.slate_date || selectedSlate)) {
      const slateForPicks = card?.slate_date || selectedSlate;
      const { picks: rawPicks } = await getPicksForSlate({
        sport: 'nba',
        slateDate: slateForPicks,
      });

      // Join health diagnostics — surface any picks rows that lack a
      // matching pick_results row, plus rows whose pick_results is still
      // 'pending'. Lets ops see whether aggregate-only state is caused by
      // missing rows, missed grading, or stale aggregates.
      const missingResultPickIds = [];
      const pendingResultPickIds = [];
      let resultsJoined = 0;
      for (const p of rawPicks) {
        const r = Array.isArray(p.pick_results) ? p.pick_results[0] : p.pick_results;
        if (!r) missingResultPickIds.push(p.id);
        else {
          resultsJoined += 1;
          if (r.status === 'pending') pendingResultPickIds.push(p.id);
        }
      }
      diagnostics.picksFound = rawPicks.length;
      diagnostics.resultsFound = resultsJoined;
      diagnostics.joinedRows = resultsJoined;
      diagnostics.missingResultPickIds = missingResultPickIds;
      diagnostics.pendingResultPickIds = pendingResultPickIds;
      if (rawPicks.length > 0 && resultsJoined === 0) {
        console.warn(
          '[nba/scorecard] join health: %d picks for %s have ZERO pick_results rows — settle-yesterday or backfill needed',
          rawPicks.length, slateForPicks
        );
      }

      picks = rawPicks.map(annotatePick);

      // Aggregate by category for stat chips
      const buckets = {
        overall:   { won: 0, lost: 0, push: 0, pending: 0 },
        moneyline: { won: 0, lost: 0, push: 0, pending: 0 },
        spread:    { won: 0, lost: 0, push: 0, pending: 0 },
        total:     { won: 0, lost: 0, push: 0, pending: 0 },
      };
      for (const p of picks) {
        const status = p.status || 'pending';
        if (buckets.overall[status] != null) buckets.overall[status] += 1;
        const cat = p.marketType === 'runline' ? 'spread' : p.marketType;
        if (cat && buckets[cat]?.[status] != null) buckets[cat][status] += 1;
      }
      totals = {
        published: picks.length,
        graded:    buckets.overall.won + buckets.overall.lost + buckets.overall.push,
        pending:   buckets.overall.pending,
        record:    buckets.overall,
        byMarket:  {
          moneyline: buckets.moneyline,
          spread:    buckets.spread,
          total:     buckets.total,
        },
      };
    }

    // ── dataMode resolution ────────────────────────────────────────────
    // Two source-of-truth surfaces can independently report "graded":
    //   • Per-pick rows: picks ⨝ pick_results, status in won/lost/push
    //   • Aggregate row: picks_daily_scorecards.record (won+lost+push > 0)
    //
    // Resolve into one of three explicit modes so the UI can render
    // appropriately without ever mislabeling pending data:
    //   graded_with_rows       → row-level graded data exists
    //   graded_aggregate_only  → aggregate scorecard is graded, but per-
    //                            pick rows are unavailable / all pending
    //                            (e.g. picks rows pruned, or settle wrote
    //                            results into the scorecard but pick_results
    //                            join failed)
    //   no_graded_history      → no graded data anywhere
    const aggregateGraded = card?.record
      ? ((card.record.won ?? 0) + (card.record.lost ?? 0) + (card.record.push ?? 0))
      : 0;
    const rowGraded = totals?.graded ?? 0;

    let dataMode;
    let selectedSource;

    if (rowGraded > 0) {
      dataMode = 'graded_with_rows';
      selectedSource = 'pick_results';
    } else if (aggregateGraded > 0 && card) {
      // Aggregate has graded data but per-pick rows are unavailable. Build
      // synthetic totals from the scorecard's record so the UI's chips +
      // headline still render with truthful numbers — but mark picks as
      // unavailable so the UI suppresses pick-by-pick rows.
      dataMode = 'graded_aggregate_only';
      selectedSource = 'picks_daily_scorecards';
      const m = card.by_market || {};
      // Normalize MLB-era 'runline' → 'spread' for UI consistency.
      const spread = m.spread || m.runline || { won: 0, lost: 0, push: 0, pending: 0 };
      const moneyline = m.moneyline || { won: 0, lost: 0, push: 0, pending: 0 };
      const total = m.total || { won: 0, lost: 0, push: 0, pending: 0 };
      totals = {
        published:
          (card.record?.won ?? 0) + (card.record?.lost ?? 0) +
          (card.record?.push ?? 0) + (card.record?.pending ?? 0),
        graded: aggregateGraded,
        pending: card.record?.pending ?? 0,
        record: card.record || { won: 0, lost: 0, push: 0, pending: 0 },
        byMarket: { moneyline, spread, total },
      };
      picks = []; // No row-level data — UI will show "details unavailable"
    } else {
      // Neither row-level nor aggregate graded data is available.
      dataMode = 'no_graded_history';
      selectedSource = null;
      diagnostics.invariantViolated = (selectedReason && selectedReason !== 'no_graded_slate')
        ? {
            priorReason: selectedReason,
            priorSelectedSlate: selectedSlate,
            priorPublished: totals?.published ?? 0,
            priorGraded: rowGraded,
            priorAggregateGraded: aggregateGraded,
          }
        : undefined;
      if (diagnostics.invariantViolated) {
        console.warn(
          '[nba/scorecard] invariant: %s claimed graded but neither rows nor aggregate had graded data for slate %s — demoting to no_graded_history',
          selectedReason, selectedSlate
        );
      }
      // Surface today's pending slate so UI can show "Today's slate pending".
      diagnostics.todayPendingSlate = diagnostics.todayPendingSlate || selectedSlate;
      diagnostics.todayPendingCount = diagnostics.todayPendingCount || (totals?.pending ?? picks.length);
      // Preserve awaiting_settlement / awaiting_finals so the UI can show
      // the dated banner instead of a generic "no graded" state.
      if (selectedReason !== 'awaiting_settlement' && selectedReason !== 'awaiting_finals') {
        selectedReason = 'no_graded_slate';
      }
      usedFallback = false;
      card = null;
      picks = [];
      totals = null;
    }
    diagnostics.dataMode = dataMode;
    diagnostics.selectedSource = selectedSource;
    diagnostics.aggregateGraded = aggregateGraded;
    diagnostics.rowGraded = rowGraded;

    // If we fell back, see if there's a current (today/yesterday) slate
    // with pending picks so the UI can render a small note.
    if (!explicitDate && diagnostics.todayPendingSlate && !diagnostics.todayPendingCount) {
      try {
        const { picks: pendingRows } = await getPicksForSlate({
          sport: 'nba',
          slateDate: diagnostics.todayPendingSlate,
        });
        diagnostics.todayPendingCount = pendingRows?.length || 0;
      } catch { /* non-fatal */ }
    }

    return res.status(200).json({
      slateDate: card?.slate_date || selectedSlate || requestedSlate,
      requestedSlate,
      selectedSlateDate: selectedSlate,
      selectedReason,
      dataMode: diagnostics.dataMode,
      selectedSource: diagnostics.selectedSource,
      usedFallback,
      diagnostics: {
        ...diagnostics,
        gradedCount: totals?.graded ?? 0,
        pendingCount: totals?.pending ?? 0,
        publishedCount: totals?.published ?? 0,
      },
      scorecard: card ? {
        date: card.slate_date,
        overall: card.record,
        byMarket: card.by_market,
        byTier: card.by_tier,
        topPlayResult: card.top_play_result,
        streak: card.streak,
        note: card.note,
        computedAt: card.computed_at,
        isFallback: usedFallback,
      } : null,
      picks,
      totals,
    });
  } catch (e) {
    return res.status(200).json({
      slateDate: requestedSlate,
      requestedSlate,
      usedFallback: false,
      scorecard: null,
      picks: [],
      totals: null,
      error: e?.message,
    });
  }
}
