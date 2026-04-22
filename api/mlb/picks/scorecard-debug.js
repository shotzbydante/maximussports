/**
 * GET /api/mlb/picks/scorecard-debug
 *
 * Fast operator-only snapshot of the current state of the MLB scorecard +
 * performance pipeline. Designed so one GET answers "why is this empty?"
 * without opening Supabase.
 *
 * Returns:
 *   {
 *     now: { utcIso, etDate, etYesterday },
 *     runs: { latestSlateDate, countLast7d, byDate: { "YYYY-MM-DD": count } },
 *     picks: {
 *       countForLatestSlate,
 *       countForYesterday,
 *       runsWithPicksForYesterday: number,       // distinct run_ids
 *       runsWithoutPicksForYesterday: number,   // race detection
 *     },
 *     results: {
 *       gradedLast7d, pendingLast7d,
 *       latestGradedSlateDate, latestResultWrittenAt,
 *     },
 *     scorecards: { latestSlateDate, rows: [...] },
 *     audit: { latestSlateDate },
 *     finalsForYesterday: { fetched, count, sampleGameIds } | null,
 *     match: {
 *       uniquePickKeys, uniqueGameIds, matchedToFinals, unmatched,
 *       sampleUnmatchedGameIds,
 *     } | null,
 *     consistency: {
 *       yesterdayScorecardPresent, gradedCount, pendingCount, reasonIfEmpty,
 *       multiRunRaceDetected,
 *     }
 *   }
 */

import { getSupabaseAdmin } from '../../_lib/supabaseAdmin.js';
import { yesterdayET, daysAgoFromYesterdayET, todayET } from '../../_lib/dateWindows.js';
import { fetchYesterdayFinals } from '../live/_normalize.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  const now = new Date();
  const etDate = todayET(now);
  const etYesterday = yesterdayET(now);
  const from7 = daysAgoFromYesterdayET(7, now);
  const includeFinals = req?.query?.includeFinals === '1';

  let admin;
  try { admin = getSupabaseAdmin(); }
  catch (e) {
    return res.status(200).json({
      now: { utcIso: now.toISOString(), etDate, etYesterday },
      error: 'supabase_unavailable',
      detail: e?.message,
    });
  }

  const result = {
    now: { utcIso: now.toISOString(), etDate, etYesterday },
    runs: null, picks: null, results: null, scorecards: null, audit: null,
    finalsForYesterday: null, match: null, consistency: null,
  };

  try {
    // ── Runs ────────────────────────────────────────────────────────────
    const { data: runsAll } = await admin
      .from('picks_runs')
      .select('id, slate_date, generated_at')
      .eq('sport', 'mlb')
      .gte('slate_date', from7)
      .order('slate_date', { ascending: false });

    const byDate = {};
    for (const r of (runsAll || [])) {
      byDate[r.slate_date] = (byDate[r.slate_date] || 0) + 1;
    }
    result.runs = {
      latestSlateDate: runsAll?.[0]?.slate_date || null,
      countLast7d: runsAll?.length || 0,
      byDate,
    };

    // ── Picks for latest + yesterday ─────────────────────────────────────
    const latestSlate = runsAll?.[0]?.slate_date;
    let countForLatestSlate = 0;
    if (latestSlate) {
      const { count } = await admin
        .from('picks')
        .select('*', { count: 'exact', head: true })
        .eq('sport', 'mlb')
        .eq('slate_date', latestSlate);
      countForLatestSlate = count ?? 0;
    }

    // Yesterday picks (distinct pick_keys + run_ids)
    const { data: yPicks } = await admin
      .from('picks')
      .select('id, pick_key, game_id, run_id')
      .eq('sport', 'mlb')
      .eq('slate_date', etYesterday);

    const uniquePickKeys = new Set();
    const runIdsWithPicks = new Set();
    const pickGameIds = new Set();
    for (const p of (yPicks || [])) {
      uniquePickKeys.add(p.pick_key);
      runIdsWithPicks.add(p.run_id);
      if (p.game_id) pickGameIds.add(String(p.game_id));
    }
    const runsForYesterday = (runsAll || []).filter(r => r.slate_date === etYesterday);
    const runsWithoutPicksForYesterday =
      runsForYesterday.filter(r => !runIdsWithPicks.has(r.id)).length;

    result.picks = {
      countForLatestSlate,
      countForYesterday: yPicks?.length || 0,
      uniquePickKeysForYesterday: uniquePickKeys.size,
      runsWithPicksForYesterday: runIdsWithPicks.size,
      runsWithoutPicksForYesterday,
    };

    // ── pick_results ────────────────────────────────────────────────────
    const { data: resultsRows } = await admin
      .from('pick_results')
      .select('status, settled_at, pick_id, picks!inner(sport, slate_date)')
      .eq('picks.sport', 'mlb')
      .gte('picks.slate_date', from7);
    let graded = 0, pending = 0;
    let latestSettledAt = null;
    const gradedBySlate = new Map();
    for (const r of (resultsRows || [])) {
      if (r.status === 'won' || r.status === 'lost' || r.status === 'push') {
        graded++;
        const slate = r.picks?.slate_date;
        if (slate) gradedBySlate.set(slate, (gradedBySlate.get(slate) || 0) + 1);
      } else if (r.status === 'pending') {
        pending++;
      }
      if (r.settled_at && (!latestSettledAt || r.settled_at > latestSettledAt)) {
        latestSettledAt = r.settled_at;
      }
    }
    // Find latest slate_date that has any graded result
    let latestGradedSlateDate = null;
    for (const d of [...gradedBySlate.keys()].sort().reverse()) {
      if (gradedBySlate.get(d) > 0) { latestGradedSlateDate = d; break; }
    }
    result.results = {
      gradedLast7d: graded,
      pendingLast7d: pending,
      latestGradedSlateDate,
      latestResultWrittenAt: latestSettledAt,
    };

    // ── Scorecards ──────────────────────────────────────────────────────
    const { data: cardRows } = await admin
      .from('picks_daily_scorecards')
      .select('slate_date, record, top_play_result, note, computed_at')
      .eq('sport', 'mlb')
      .gte('slate_date', from7)
      .order('slate_date', { ascending: false });
    result.scorecards = {
      latestSlateDate: cardRows?.[0]?.slate_date || null,
      latestComputedAt: cardRows?.[0]?.computed_at || null,
      rows: (cardRows || []).slice(0, 7).map(r => ({
        slate_date: r.slate_date,
        record: r.record,
        top_play_result: r.top_play_result,
        note: r.note,
        computed_at: r.computed_at,
      })),
    };

    // ── Audit ───────────────────────────────────────────────────────────
    const { data: auditRows } = await admin
      .from('picks_audit_artifacts')
      .select('slate_date, created_at')
      .eq('sport', 'mlb')
      .order('slate_date', { ascending: false })
      .limit(3);
    result.audit = {
      latestSlateDate: auditRows?.[0]?.slate_date || null,
      latestCreatedAt: auditRows?.[0]?.created_at || null,
      rows: auditRows || [],
    };

    // ── Finals + match telemetry (optional; disk-expensive) ─────────────
    if (includeFinals) {
      try {
        const finals = await fetchYesterdayFinals({ slateDate: etYesterday });
        const finalGameIds = new Set();
        for (const g of (finals || [])) if (g.gameId) finalGameIds.add(String(g.gameId));
        result.finalsForYesterday = {
          fetched: true,
          count: finals?.length || 0,
          sampleGameIds: [...finalGameIds].slice(0, 5),
        };
        // Pick-to-final match
        let matched = 0;
        const unmatched = [];
        for (const gid of pickGameIds) {
          if (finalGameIds.has(gid)) matched++;
          else unmatched.push(gid);
        }
        result.match = {
          uniquePickKeys: uniquePickKeys.size,
          uniquePickGameIds: pickGameIds.size,
          uniqueFinalGameIds: finalGameIds.size,
          matchedToFinals: matched,
          unmatched: unmatched.length,
          sampleUnmatchedGameIds: unmatched.slice(0, 5),
        };
      } catch (e) {
        result.finalsForYesterday = { fetched: false, error: e?.message };
      }
    }

    // ── Consistency summary ─────────────────────────────────────────────
    const yScard = cardRows?.find(r => r.slate_date === etYesterday);
    const multiRunRaceDetected = runsWithoutPicksForYesterday > 0 && runIdsWithPicks.size > 0;
    if (!yScard) {
      result.consistency = {
        yesterdayScorecardPresent: false,
        multiRunRaceDetected,
        reasonIfEmpty:
          'no scorecard row for yesterday (ET) — build-scorecard cron has not run yet, ran for a different ET date, or errored',
      };
    } else {
      const rec = yScard.record || {};
      const gradedCount = (rec.won ?? 0) + (rec.lost ?? 0);
      const pendingCount = rec.pending ?? 0;
      result.consistency = {
        yesterdayScorecardPresent: true,
        gradedCount,
        pendingCount,
        multiRunRaceDetected,
        reasonIfEmpty: gradedCount === 0
          ? (pendingCount > 0
              ? 'row exists but every pick is pending — settle-yesterday did not grade (ESPN gameId mismatch, or game not yet final)'
              : (multiRunRaceDetected
                  ? 'row exists with zero picks — picks were attached to a different run_id (multi-run race). Run /api/admin/picks/backfill?date=' + etYesterday
                  : 'row exists with zero picks — no picks were persisted for the slate'))
          : null,
      };
    }
  } catch (e) {
    result.error = 'query_failed';
    result.detail = e?.message;
  }

  return res.status(200).json(result);
}
