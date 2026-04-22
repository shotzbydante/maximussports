/**
 * GET /api/mlb/picks/scorecard-debug
 *
 * Fast operator-only snapshot of the current state of the MLB scorecard +
 * performance pipeline. Use this to diagnose "why is MLB Home showing
 * Building?" without opening the Supabase dashboard.
 *
 * Returns:
 *   {
 *     now:         { utcIso, etDate, etYesterday },
 *     runs:        { latestSlateDate, countLast7d },
 *     picks:       { countForLatestSlate },
 *     results:     { gradedLast7d, pendingLast7d },
 *     scorecards:  { latestSlateDate, rows: [{ slate_date, record, note }] (last 7) },
 *     audit:       { latestSlateDate },
 *     consistency: { yesterdayScorecardPresent, gradedCount, pendingCount, reasonIfEmpty },
 *   }
 *
 * No auth — read-only; no secrets exposed; rows are already public under RLS.
 */

import { getSupabaseAdmin } from '../../_lib/supabaseAdmin.js';
import { yesterdayET, daysAgoFromYesterdayET, todayET } from '../../_lib/dateWindows.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  const now = new Date();
  const etDate = todayET(now);
  const etYesterday = yesterdayET(now);
  const from7 = daysAgoFromYesterdayET(7, now);

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
    consistency: null,
  };

  try {
    // Latest runs + count in last 7 days
    const { data: runsAll } = await admin
      .from('picks_runs')
      .select('slate_date, generated_at')
      .eq('sport', 'mlb')
      .gte('slate_date', from7)
      .order('slate_date', { ascending: false });
    result.runs = {
      latestSlateDate: runsAll?.[0]?.slate_date || null,
      countLast7d: runsAll?.length || 0,
    };

    const latestSlate = runsAll?.[0]?.slate_date;
    if (latestSlate) {
      const { count: picksCount } = await admin
        .from('picks')
        .select('*', { count: 'exact', head: true })
        .eq('sport', 'mlb')
        .eq('slate_date', latestSlate);
      result.picks = { countForLatestSlate: picksCount ?? 0 };
    } else {
      result.picks = { countForLatestSlate: 0 };
    }

    // Results in last 7 days (by status)
    const { data: resultsRows } = await admin
      .from('pick_results')
      .select('status, pick_id, picks!inner(sport, slate_date)')
      .eq('picks.sport', 'mlb')
      .gte('picks.slate_date', from7);
    let graded = 0, pending = 0;
    for (const r of (resultsRows || [])) {
      if (r.status === 'won' || r.status === 'lost' || r.status === 'push') graded++;
      else if (r.status === 'pending') pending++;
    }
    result.results = { gradedLast7d: graded, pendingLast7d: pending };

    // Scorecard rows (last 7)
    const { data: cardRows } = await admin
      .from('picks_daily_scorecards')
      .select('slate_date, record, top_play_result, note, computed_at')
      .eq('sport', 'mlb')
      .gte('slate_date', from7)
      .order('slate_date', { ascending: false });
    result.scorecards = {
      latestSlateDate: cardRows?.[0]?.slate_date || null,
      rows: (cardRows || []).slice(0, 7).map(r => ({
        slate_date: r.slate_date,
        record: r.record,
        top_play_result: r.top_play_result,
        note: r.note,
        computed_at: r.computed_at,
      })),
    };

    // Latest audit
    const { data: auditRows } = await admin
      .from('picks_audit_artifacts')
      .select('slate_date')
      .eq('sport', 'mlb')
      .order('slate_date', { ascending: false })
      .limit(1);
    result.audit = { latestSlateDate: auditRows?.[0]?.slate_date || null };

    // Consistency checks for yesterday ET specifically
    const yScard = cardRows?.find(r => r.slate_date === etYesterday);
    if (!yScard) {
      result.consistency = {
        yesterdayScorecardPresent: false,
        reasonIfEmpty: 'no scorecard row written for yesterday — build-scorecard cron may not have run, or it ran for a different ET date',
      };
    } else {
      const rec = yScard.record || {};
      const gradedCount = (rec.won ?? 0) + (rec.lost ?? 0);
      const pendingCount = rec.pending ?? 0;
      result.consistency = {
        yesterdayScorecardPresent: true,
        gradedCount,
        pendingCount,
        reasonIfEmpty: gradedCount === 0
          ? (pendingCount > 0
              ? 'row exists but every pick is still pending — settle-yesterday cron did not grade them (ESPN gameId mismatch, or game not yet final)'
              : 'row exists with zero picks — picks_run had 0 entries for the slate')
          : null,
      };
    }
  } catch (e) {
    result.error = 'query_failed';
    result.detail = e?.message;
  }

  return res.status(200).json(result);
}
