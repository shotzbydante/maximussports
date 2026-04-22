/**
 * POST/GET /api/cron/mlb/settle-yesterday
 *
 * Scheduled via vercel.json to run ~3:30 AM ET daily.
 * Pulls yesterday's ESPN finals, grades each unsettled pick, writes pick_results.
 *
 * Accepts ?date=YYYY-MM-DD (ET slate date) for manual reruns / backfills.
 *
 * Idempotent:
 *   - picks deduped by pick_key (handles multi-run race where several
 *     picks_runs exist for the same slate_date)
 *   - already-graded picks skipped
 *   - pick_results upsert by pick_id
 *
 * Response includes matchedToFinals + unmatched counts so the operator can
 * tell at a glance whether game_id mismatches are the failure mode.
 */

import { fetchYesterdayFinals } from '../../mlb/live/_normalize.js';
import { getPicksForSlate, upsertPickResults } from '../../_lib/picksHistory.js';
import { gradePicks } from '../../../src/features/mlb/picks/v2/settle.js';
import { yesterdayET } from '../../_lib/dateWindows.js';

export default async function handler(req, res) {
  const t0 = Date.now();
  const slateDate = req?.query?.date || yesterdayET();

  try {
    const { picks, runIds, totalRaw, droppedDuplicates } =
      await getPicksForSlate({ sport: 'mlb', slateDate });

    if (picks.length === 0) {
      console.warn(
        `[cron/mlb/settle-yesterday] 0 picks for ${slateDate} ` +
        `(totalRaw=${totalRaw} runIds=${runIds.size})`
      );
      return res.status(200).json({
        ok: false, slateDate, graded: 0,
        note: 'no picks persisted for slate_date',
        totalRaw, runIds: runIds.size,
      });
    }

    const finals = await fetchYesterdayFinals({ slateDate });
    const finalsByGameId = new Map();
    for (const g of (finals || [])) {
      if (g.gameId) finalsByGameId.set(String(g.gameId), g);
    }

    // Skip already-graded picks so re-runs are safe
    const alreadyGraded = new Set();
    for (const p of picks) {
      const r = p.pick_results?.[0];
      if (r && r.status !== 'pending') alreadyGraded.add(p.id);
    }

    const rows = gradePicks(picks, finalsByGameId, alreadyGraded);

    // Operator telemetry: how many picks matched vs unmatched?
    const matched = rows.filter(r => r.status !== 'pending').length;
    const unmatched = rows.filter(r => r.status === 'pending').length;

    // Only write rows where status has changed or the pick is new.
    // `gradePicks` already skips alreadyGraded, so any "pending" it yields is
    // a pick that didn't match a final — safe to persist so the UI can show
    // it as pending rather than leaving it out entirely.
    const writeable = rows;
    const { count, ok: writeOk, error } = await upsertPickResults(writeable);

    if (!writeOk) {
      console.error(`[cron/mlb/settle-yesterday] ⚠ write failed: ${error?.kind} ${error?.message || ''}`);
    }
    if (writeOk && count === 0 && writeable.length > 0) {
      console.warn(`[cron/mlb/settle-yesterday] ⚠ attempted ${writeable.length} writes but 0 rows persisted`);
    }

    console.log(
      `[cron/mlb/settle-yesterday] slate=${slateDate} ` +
      `totalPicks=${picks.length} alreadyGraded=${alreadyGraded.size} ` +
      `finalsSeen=${finalsByGameId.size} matched=${matched} unmatched=${unmatched} ` +
      `written=${count}`
    );

    return res.status(200).json({
      ok: writeOk !== false,
      slateDate,
      totalPicks: picks.length,
      totalRaw,
      runIds: runIds.size,
      droppedDuplicates,
      alreadyGraded: alreadyGraded.size,
      finalsSeen: finalsByGameId.size,
      matched,
      unmatched,
      graded: count,
      durationMs: Date.now() - t0,
      error: error || null,
    });
  } catch (e) {
    console.error('[cron/mlb/settle-yesterday] fatal:', e);
    return res.status(200).json({ ok: false, error: e?.message || 'unknown', slateDate });
  }
}
