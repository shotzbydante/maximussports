/**
 * POST/GET /api/cron/nfl/build-scorecard
 *
 * Mirrors the MLB and NBA scorecard crons. Compiles yesterday's graded NFL
 * picks into one picks_daily_scorecards row. Unlike the daily sports, a day
 * with no NFL picks writes nothing: most days of an NFL week have no games,
 * and empty rows would only pad the performance windows.
 *
 *   ?date=YYYY-MM-DD  manual backfill for one slate
 */

import { buildScorecard } from '../../../src/features/mlb/picks/v2/scorecard.js';
import { upsertScorecard } from '../../_lib/picksHistory.js';
import { getNflPicks } from '../../_lib/nflPicksStore.js';
import { getSupabaseAdmin } from '../../_lib/supabaseAdmin.js';
import { yesterdayET } from '../../_lib/dateWindows.js';
import { requireAdminOrCron } from '../../_lib/requireAuth.js';
import { summarizePerformance } from '../../../src/features/nfl/picks/v2/performance.js';

export default async function handler(req, res) {
  if (!(await requireAdminOrCron(req, res))) return;

  const slateDate = req?.query?.date || yesterdayET();

  try {
    const { picks, totalRaw, droppedDuplicates, ok, error } = await getNflPicks({ from: slateDate });
    if (!ok) return res.status(200).json({ ok: false, slateDate, sport: 'nfl', error });
    if (picks.length === 0) {
      return res.status(200).json({ ok: true, slateDate, sport: 'nfl', picks: 0, note: 'no NFL picks for this date' });
    }

    let recent = [];
    try {
      const { data } = await getSupabaseAdmin()
        .from('picks_daily_scorecards')
        .select('slate_date, record')
        .eq('sport', 'nfl')
        .lt('slate_date', slateDate)
        .order('slate_date', { ascending: false })
        .limit(10);
      recent = data || [];
    } catch { /* streak context is optional */ }

    const base = buildScorecard({ sport: 'nfl', slateDate, picks, recentRecords: recent });
    // Units and closing-line value by role, so the season view can add
    // them up without re-reading every pick.
    const row = { ...base, performance: summarizePerformance(picks) };
    let saved = await upsertScorecard(row);
    if (!saved) {
      // Before docs/nfl-picks-v2-migration.sql the table has neither
      // `performance` nor `by_pick_role`; save the record alone.
      const { performance, by_pick_role, ...legacy } = row; // eslint-disable-line no-unused-vars
      saved = await upsertScorecard(legacy);
    }
    if (!saved) console.error(`[cron/nfl/build-scorecard] scorecard upsert returned null for ${slateDate}`);

    console.log(
      `[cron/nfl/build-scorecard] slate=${slateDate} picks=${picks.length} droppedDup=${droppedDuplicates} ` +
      `record=${JSON.stringify(row.record)}`
    );

    return res.status(200).json({
      ok: !!saved,
      slateDate, sport: 'nfl',
      picks: picks.length, totalRaw, droppedDuplicates,
      scorecard: saved || row,
    });
  } catch (e) {
    console.error('[cron/nfl/build-scorecard] fatal:', e);
    return res.status(200).json({ ok: false, error: e?.message, slateDate });
  }
}
