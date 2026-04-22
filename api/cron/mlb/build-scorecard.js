/**
 * POST/GET /api/cron/mlb/build-scorecard
 *
 * Scheduled via vercel.json ~3:45 AM ET.
 * Reads yesterday's picks_run + pick_results, builds a scorecard row,
 * upserts into picks_daily_scorecards.
 */

import { buildScorecard } from '../../../src/features/mlb/picks/v2/scorecard.js';
import { getLatestRunForDate as getRun, upsertScorecard as upsertCard } from '../../_lib/picksHistory.js';
import { getSupabaseAdmin } from '../../_lib/supabaseAdmin.js';

import { yesterdayET } from '../../_lib/dateWindows.js';

export default async function handler(req, res) {
  const slateDate = req?.query?.date || yesterdayET();

  try {
    const run = await getRun({ sport: 'mlb', slateDate });
    if (!run) {
      console.warn(`[cron/mlb/build-scorecard] no picks_run for ${slateDate} — persistence may be disabled`);
    }
    if (!run || !run.picks) {
      // Still write a scorecard row with zero to allow UI display
      const empty = {
        sport: 'mlb',
        slate_date: slateDate,
        record: { won: 0, lost: 0, push: 0, pending: 0 },
        by_market: {},
        by_tier: {},
        top_play_result: null,
        streak: null,
        note: 'No picks for this date',
        computed_at: new Date().toISOString(),
      };
      await upsertCard(empty);
      return res.status(200).json({ ok: true, slateDate, picks: 0, scorecard: empty });
    }

    // Fetch up to 10 previous scorecards for streak context
    let recent = [];
    try {
      let admin = null;
      try { admin = getSupabaseAdmin(); } catch { /* no-op */ }
      if (admin) {
        const { data } = await admin
          .from('picks_daily_scorecards')
          .select('slate_date, record')
          .eq('sport', 'mlb')
          .lt('slate_date', slateDate)
          .order('slate_date', { ascending: false })
          .limit(10);
        recent = data || [];
      }
    } catch { /* fine */ }

    const row = buildScorecard({ sport: 'mlb', slateDate, picks: run.picks, recentRecords: recent });
    const saved = await upsertCard(row);
    if (!saved) {
      console.error(`[cron/mlb/build-scorecard] ⚠ scorecard upsert returned null for ${slateDate} — check picks_daily_scorecards existence`);
    }
    return res.status(200).json({ ok: !!saved, slateDate, picks: run.picks.length, scorecard: saved || row });
  } catch (e) {
    console.error('[cron/mlb/build-scorecard] fatal:', e);
    return res.status(200).json({ ok: false, error: e?.message, slateDate });
  }
}
