/**
 * POST/GET /api/cron/nba/build-scorecard
 *
 * Mirrors /api/cron/mlb/build-scorecard for NBA. Reads NBA picks + pick_results
 * for the slate_date (deduped across runs), builds a scorecard row, upserts
 * into picks_daily_scorecards.
 */

import { buildScorecard } from '../../../src/features/mlb/picks/v2/scorecard.js';
import { getPicksForSlate, upsertScorecard as upsertCard } from '../../_lib/picksHistory.js';
import { getSupabaseAdmin } from '../../_lib/supabaseAdmin.js';
import { yesterdayET } from '../../_lib/dateWindows.js';

export default async function handler(req, res) {
  const slateDate = req?.query?.date || yesterdayET();

  try {
    const { picks, runIds, totalRaw, droppedDuplicates } =
      await getPicksForSlate({ sport: 'nba', slateDate });

    if (picks.length === 0) {
      console.warn(
        `[cron/nba/build-scorecard] 0 picks for ${slateDate} (totalRaw=${totalRaw} runIds=${runIds.size}) — writing empty row`
      );
      const empty = {
        sport: 'nba',
        slate_date: slateDate,
        record: { won: 0, lost: 0, push: 0, pending: 0 },
        by_market: {}, by_tier: {},
        top_play_result: null,
        streak: null,
        note: 'No picks persisted for this date',
        computed_at: new Date().toISOString(),
      };
      await upsertCard(empty);
      return res.status(200).json({ ok: true, slateDate, sport: 'nba', picks: 0, runIds: runIds.size, scorecard: empty });
    }

    // Trailing 10 scorecards for streak context
    let recent = [];
    try {
      let admin = null;
      try { admin = getSupabaseAdmin(); } catch { /* no-op */ }
      if (admin) {
        const { data } = await admin
          .from('picks_daily_scorecards')
          .select('slate_date, record')
          .eq('sport', 'nba')
          .lt('slate_date', slateDate)
          .order('slate_date', { ascending: false })
          .limit(10);
        recent = data || [];
      }
    } catch { /* fine */ }

    const row = buildScorecard({ sport: 'nba', slateDate, picks, recentRecords: recent });

    // Divergence guard: if the aggregate has graded counts but every pick
    // we just read has a missing/pending pick_results, the row would land
    // as "graded_aggregate_only" in the UI — operator-visible breakage.
    const aggGraded = (row.record?.won || 0) + (row.record?.lost || 0) + (row.record?.push || 0);
    let rowGraded = 0;
    let missingResults = 0;
    for (const p of picks) {
      const r = Array.isArray(p.pick_results) ? p.pick_results[0] : p.pick_results;
      if (!r) missingResults += 1;
      else if (r.status === 'won' || r.status === 'lost' || r.status === 'push') rowGraded += 1;
    }
    if (aggGraded > 0 && rowGraded === 0) {
      console.warn(
        `[cron/nba/build-scorecard] divergence: aggregate graded=${aggGraded} but row-level graded=0 ` +
        `for slate=${slateDate} (picks=${picks.length}, missingResults=${missingResults}). ` +
        `Run /api/admin/picks/heal-aggregate-only?sport=nba&apply=1 to repair.`
      );
    }

    const saved = await upsertCard(row);
    if (!saved) {
      console.error(
        `[cron/nba/build-scorecard] ⚠ scorecard upsert returned null for ${slateDate}`
      );
    }

    console.log(
      `[cron/nba/build-scorecard] slate=${slateDate} picks=${picks.length} ` +
      `runIds=${runIds.size} droppedDup=${droppedDuplicates} record=${JSON.stringify(row.record)}`
    );

    return res.status(200).json({
      ok: !!saved,
      slateDate, sport: 'nba',
      picks: picks.length, runIds: runIds.size, totalRaw, droppedDuplicates,
      scorecard: saved || row,
    });
  } catch (e) {
    console.error('[cron/nba/build-scorecard] fatal:', e);
    return res.status(200).json({ ok: false, error: e?.message, slateDate });
  }
}
