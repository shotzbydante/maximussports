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
    const finalsByGameId = new Map();
    const finalsBySlugPair = new Map();
    const slugPairKey = (a, b) => {
      const ax = String(a || '').toLowerCase();
      const bx = String(b || '').toLowerCase();
      return ax < bx ? `${ax}|${bx}` : `${bx}|${ax}`;
    };
    for (const g of (finals || [])) {
      if (g.gameId) finalsByGameId.set(String(g.gameId), g);
      const aSlug = g?.teams?.away?.slug;
      const hSlug = g?.teams?.home?.slug;
      if (aSlug && hSlug) finalsBySlugPair.set(slugPairKey(aSlug, hSlug), g);
    }

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

    // Augment the index: for any pick whose persisted game_id doesn't
    // resolve to an ESPN final, fall back to matching by unordered team-
    // slug pair on the slate. Repairs picks persisted with non-ESPN ids.
    const augmented = new Map(finalsByGameId);
    for (const p of picks) {
      if (alreadyGraded.has(p.id)) continue;
      if (p.game_id && augmented.has(String(p.game_id))) continue;
      const pairKey = slugPairKey(p.away_team_slug, p.home_team_slug);
      const aliasFinal = finalsBySlugPair.get(pairKey);
      if (aliasFinal) augmented.set(String(p.game_id || p.id), aliasFinal);
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
      `finalsSeen=${finalsByGameId.size} matched=${matched} unmatched=${unmatched} ` +
      `written=${count}`
    );

    return res.status(200).json({
      ok: writeOk !== false,
      slateDate, sport: 'nba',
      totalPicks: picks.length, totalRaw, runIds: runIds.size, droppedDuplicates,
      alreadyGraded: alreadyGraded.size,
      finalsSeen: finalsByGameId.size,
      matched, unmatched, graded: count,
      durationMs: Date.now() - t0,
      error: error || null,
    });
  } catch (e) {
    console.error('[cron/nba/settle-yesterday] fatal:', e);
    return res.status(200).json({ ok: false, error: e?.message || 'unknown', slateDate });
  }
}
