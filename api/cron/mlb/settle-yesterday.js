/**
 * POST/GET /api/cron/mlb/settle-yesterday
 *
 * Scheduled via vercel.json to run ~3:30 AM ET daily.
 * Pulls yesterday's ESPN finals, grades each unsettled pick, writes pick_results.
 *
 * Idempotent: already-graded picks are skipped.
 */

import { fetchYesterdayFinals } from '../../mlb/live/_normalize.js';
import { getLatestRunForDate, upsertPickResults } from '../../_lib/picksHistory.js';
import { gradePicks } from '../../../src/features/mlb/picks/v2/settle.js';

import { yesterdayET } from '../../_lib/dateWindows.js';

export default async function handler(req, res) {
  const t0 = Date.now();
  const slateDate = req?.query?.date || yesterdayET();

  try {
    const run = await getLatestRunForDate({ sport: 'mlb', slateDate });
    if (!run) {
      console.warn(`[cron/mlb/settle-yesterday] no picks_run found for ${slateDate} — persistence may be disabled`);
      return res.status(200).json({ ok: false, slateDate, graded: 0, note: 'no picks_run for date (persistence may be disabled)' });
    }
    if (!run.picks?.length) {
      console.log(`[cron/mlb/settle-yesterday] 0 picks to settle for ${slateDate}`);
      return res.status(200).json({ ok: true, slateDate, graded: 0, note: 'no picks recorded' });
    }

    const finals = await fetchYesterdayFinals({ slateDate });
    const finalsByGameId = new Map();
    for (const g of (finals || [])) {
      if (g.gameId) finalsByGameId.set(String(g.gameId), g);
    }

    const alreadyGraded = new Set();
    for (const p of run.picks) {
      if (p.pick_results && p.pick_results.length > 0 && p.pick_results[0].status !== 'pending') {
        alreadyGraded.add(p.id);
      }
    }

    const rows = gradePicks(run.picks, finalsByGameId, alreadyGraded);
    const writeable = rows.filter(r => r.status !== 'pending' || !alreadyGraded.has(r.pick_id));
    const { count, ok: writeOk, error } = await upsertPickResults(writeable);

    if (!writeOk) {
      console.error(`[cron/mlb/settle-yesterday] ⚠ write failed: ${error?.kind} ${error?.message || ''}`);
    }
    if (writeOk && count === 0 && writeable.length > 0) {
      console.warn(`[cron/mlb/settle-yesterday] ⚠ attempted ${writeable.length} writes but 0 rows persisted`);
    }

    return res.status(200).json({
      ok: writeOk !== false,
      slateDate,
      totalPicks: run.picks.length,
      alreadyGraded: alreadyGraded.size,
      graded: count,
      finalsSeen: finalsByGameId.size,
      durationMs: Date.now() - t0,
      error: error || null,
    });
  } catch (e) {
    console.error('[cron/mlb/settle-yesterday] fatal:', e);
    return res.status(200).json({ ok: false, error: e?.message || 'unknown', slateDate });
  }
}
