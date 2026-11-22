/**
 * POST/GET /api/cron/nfl/settle-yesterday
 *
 * Mirrors the MLB and NBA settlement crons. Grades every NFL pick whose
 * slate date is yesterday (ET) against that day's finals and writes
 * pick_results. Runs daily; on days with no NFL games it exits cleanly.
 *
 * NFL picks are persisted under their kickoff date, so a Sunday slate is
 * graded Monday morning and Monday Night Football on Tuesday morning.
 *
 *   ?date=YYYY-MM-DD  manual backfill for one slate
 *   ?force=1          re-grade picks that already have a result
 */

import { fetchYesterdayFinals } from '../../nfl/live/_normalize.js';
import { upsertPickResults } from '../../_lib/picksHistory.js';
import { getNflPicks, getLineSnapshots, saveClosingValues } from '../../_lib/nflPicksStore.js';
import { unitsFor } from '../../../src/features/nfl/picks/v2/distribution.js';
import { closingLineValue } from '../../../src/features/nfl/picks/v2/locks.js';
import { gradePicks } from '../../../src/features/mlb/picks/v2/settle.js';
import { yesterdayET } from '../../_lib/dateWindows.js';
import { buildFinalsIndex, resolveFinalForPick } from '../../_lib/finalsIndex.js';
import { requireAdminOrCron } from '../../_lib/requireAuth.js';

export default async function handler(req, res) {
  if (!(await requireAdminOrCron(req, res))) return;

  const t0 = Date.now();
  const slateDate = req?.query?.date || yesterdayET();
  const force = req?.query?.force === '1';

  try {
    const { picks, totalRaw, droppedDuplicates, ok, error: readError } = await getNflPicks({ from: slateDate });
    if (!ok) {
      return res.status(200).json({ ok: false, slateDate, sport: 'nfl', graded: 0, error: readError });
    }
    if (picks.length === 0) {
      return res.status(200).json({
        ok: true, slateDate, sport: 'nfl', graded: 0, totalRaw,
        note: 'no picks persisted for slate_date',
      });
    }

    const finals = await fetchYesterdayFinals({ slateDate });
    const index = buildFinalsIndex(finals);

    const alreadyGraded = new Set();
    if (!force) {
      for (const p of picks) {
        const r = Array.isArray(p.pick_results) ? p.pick_results[0] : p.pick_results;
        if (r && r.status !== 'pending') alreadyGraded.add(p.id);
      }
    }

    // game_id first; team-pair fallback only when the final is on this slate.
    const finalsByGameId = new Map(index.map);
    for (const p of picks) {
      if (alreadyGraded.has(p.id)) continue;
      if (p.game_id && finalsByGameId.has(String(p.game_id))) continue;
      const r = resolveFinalForPick(p, index, { slateDate });
      if (r.final) finalsByGameId.set(String(p.game_id || p.id), r.final);
    }

    const graded = gradePicks(picks, finalsByGameId, alreadyGraded);
    const byId = new Map(picks.map((p) => [p.id, p]));
    // One unit staked per pick at the stored price; -110 for rows written
    // before prices were stored.
    const rows = graded.map((r) => {
      const p = byId.get(r.pick_id);
      const price = p?.price_american == null ? null : Number(p.price_american);
      return { ...r, units: unitsFor(r.status, price) };
    });
    const matched = rows.filter((r) => r.status !== 'pending').length;
    const unmatched = rows.length - matched;

    let { count, ok: writeOk, error } = await upsertPickResults(rows);
    if (writeOk === false && /units/i.test(error?.message || '')) {
      // docs/nfl-picks-v2-migration.sql has not been run: grade without units.
      ({ count, ok: writeOk, error } = await upsertPickResults(rows.map(({ units, ...rest }) => rest))); // eslint-disable-line no-unused-vars
    }
    if (writeOk === false) {
      console.error(`[cron/nfl/settle-yesterday] write failed: ${error?.kind} ${error?.message || ''}`);
    }

    // Closing-line value: the stored ticket against the last consensus
    // snapshot before kickoff. Only locked picks have a real ticket.
    let clvSaved = 0;
    try {
      const locked = picks.filter((p) => p.locked_at && p.clv_ev == null);
      const snaps = await getLineSnapshots(locked.map((p) => p.game_id));
      const updates = [];
      for (const p of locked) {
        const close = snaps.get(String(p.game_id));
        if (!close) continue;
        const v = closingLineValue(p, close);
        if (v.clvEv != null || v.clvPoints != null) updates.push({ id: p.id, ...v });
      }
      clvSaved = (await saveClosingValues(updates)).saved;
    } catch (e) {
      console.warn(`[cron/nfl/settle-yesterday] closing-line value skipped: ${e?.message}`);
    }

    console.log(
      `[cron/nfl/settle-yesterday] slate=${slateDate} picks=${picks.length} alreadyGraded=${alreadyGraded.size} ` +
      `finalsSeen=${index.map.size} matched=${matched} unmatched=${unmatched} written=${count}`
    );

    return res.status(200).json({
      ok: writeOk !== false,
      slateDate, sport: 'nfl',
      totalPicks: picks.length, totalRaw, droppedDuplicates,
      alreadyGraded: alreadyGraded.size,
      finalsSeen: index.map.size,
      matched, unmatched, graded: count, clvSaved,
      durationMs: Date.now() - t0,
      error: error || null,
    });
  } catch (e) {
    console.error('[cron/nfl/settle-yesterday] fatal:', e);
    return res.status(200).json({ ok: false, error: e?.message || 'unknown', slateDate });
  }
}
