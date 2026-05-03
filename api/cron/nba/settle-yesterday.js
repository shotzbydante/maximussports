/**
 * POST/GET /api/cron/nba/settle-yesterday
 *
 * Mirrors /api/cron/mlb/settle-yesterday for NBA. Fetches yesterday's NBA
 * finals from ESPN (ET calendar day), grades each unsettled pick, writes
 * pick_results. Accepts ?date=YYYY-MM-DD for manual backfill.
 */

import { fetchYesterdayFinals } from '../../nba/live/_normalize.js';
import { getPicksForSlate, upsertPickResults } from '../../_lib/picksHistory.js';
import { gradePicks } from '../../../src/features/mlb/picks/v2/settle.js';
import { yesterdayET } from '../../_lib/dateWindows.js';
import { buildFinalsIndex, resolveFinalForPick } from '../../_lib/finalsIndex.js';

export default async function handler(req, res) {
  const t0 = Date.now();
  const slateDate = req?.query?.date || yesterdayET();

  try {
    const { picks, runIds, totalRaw, droppedDuplicates } =
      await getPicksForSlate({ sport: 'nba', slateDate });

    if (picks.length === 0) {
      console.warn(
        `[cron/nba/settle-yesterday] 0 picks for ${slateDate} ` +
        `(totalRaw=${totalRaw} runIds=${runIds.size})`
      );
      return res.status(200).json({
        ok: false, slateDate, graded: 0,
        note: 'no picks persisted for slate_date',
        totalRaw, runIds: runIds.size,
      });
    }

    const finals = await fetchYesterdayFinals({ slateDate });
    const index = buildFinalsIndex(finals);

    // ?force=1 re-grades every pick (including ones marked won/lost/push
    // already) — used by the heal-aggregate-only admin endpoint to repair
    // slates whose pick_results rows disagree with the aggregate.
    const force = req?.query?.force === '1';
    const alreadyGraded = new Set();
    if (!force) {
      for (const p of picks) {
        const r = p.pick_results?.[0];
        if (r && r.status !== 'pending') alreadyGraded.add(p.id);
      }
    }

    // Augment the index per-pick. resolveFinalForPick enforces cross-date
    // safety: a slug-pair fallback that would resolve to a final on a
    // different ET day than the pick's slate is rejected (defense against
    // repeat playoff matchups grading against the wrong game).
    const augmented = new Map(index.map);
    const fallbackHits = [];
    const crossDateRejections = [];
    for (const p of picks) {
      if (alreadyGraded.has(p.id)) continue;
      if (p.game_id && augmented.has(String(p.game_id))) continue;
      const r = resolveFinalForPick(p, index, { slateDate });
      if (r.final) {
        augmented.set(String(p.game_id || p.id), r.final);
        if (r.via === 'slug_pair') fallbackHits.push({ pickId: p.id, espnGameId: r.final.gameId });
      } else if (r.rejectedReason === 'cross_date_slug_pair') {
        crossDateRejections.push({ pickId: p.id, ...r.detail });
        console.warn(
          `[cron/nba/settle-yesterday] cross-date fallback rejected: pick=${p.id} slate=${slateDate} finalDate=${r.detail?.finalDate} pair=${r.detail?.pair}`
        );
      }
    }
    const rows = gradePicks(picks, augmented, alreadyGraded);
    const matched = rows.filter(r => r.status !== 'pending').length;
    const unmatched = rows.filter(r => r.status === 'pending').length;

    const { count, ok: writeOk, error } = await upsertPickResults(rows);
    if (!writeOk) {
      console.error(`[cron/nba/settle-yesterday] ⚠ write failed: ${error?.kind} ${error?.message || ''}`);
    }

    console.log(
      `[cron/nba/settle-yesterday] slate=${slateDate} ` +
      `totalPicks=${picks.length} alreadyGraded=${alreadyGraded.size} ` +
      `finalsSeen=${index.map.size} matched=${matched} unmatched=${unmatched} ` +
      `written=${count}`
    );

    return res.status(200).json({
      ok: writeOk !== false,
      slateDate, sport: 'nba',
      totalPicks: picks.length, totalRaw, runIds: runIds.size, droppedDuplicates,
      alreadyGraded: alreadyGraded.size,
      finalsSeen: index.map.size,
      matched, unmatched, graded: count,
      durationMs: Date.now() - t0,
      error: error || null,
    });
  } catch (e) {
    console.error('[cron/nba/settle-yesterday] fatal:', e);
    return res.status(200).json({ ok: false, error: e?.message || 'unknown', slateDate });
  }
}
