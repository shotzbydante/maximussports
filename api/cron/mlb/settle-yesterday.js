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

function yesterdayET() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  try {
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
    return fmt.format(d);
  } catch { return d.toISOString().slice(0, 10); }
}

export default async function handler(req, res) {
  const t0 = Date.now();
  const slateDate = req?.query?.date || yesterdayET();

  try {
    const run = await getLatestRunForDate({ sport: 'mlb', slateDate });
    if (!run || !run.picks?.length) {
      return res.status(200).json({ ok: true, slateDate, graded: 0, note: 'no picks run for date' });
    }

    const finals = await fetchYesterdayFinals();
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
    const { count, error } = await upsertPickResults(writeable);

    return res.status(200).json({
      ok: !error,
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
