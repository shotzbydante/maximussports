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

function yesterdayET() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  try {
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
    return fmt.format(d);
  } catch { return d.toISOString().slice(0, 10); }
}

export default async function handler(req, res) {
  const slateDate = req?.query?.date || yesterdayET();

  try {
    const run = await getRun({ sport: 'mlb', slateDate });
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

    return res.status(200).json({ ok: true, slateDate, picks: run.picks.length, scorecard: saved || row });
  } catch (e) {
    console.error('[cron/mlb/build-scorecard] fatal:', e);
    return res.status(200).json({ ok: false, error: e?.message, slateDate });
  }
}
