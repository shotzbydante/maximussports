/**
 * Auto-heal helper used by the scorecard endpoint when the canonical
 * target prior slate (yesterdayET) has persisted picks and final games
 * but no row-level `pick_results`. Runs the same grading logic as the
 * settle-yesterday cron, inline, so the user sees a freshly-graded
 * scorecard on the next page load instead of an aggregate-only fallback.
 *
 * Sport-aware via the `fetchFinals` argument so MLB and NBA can share
 * this helper without leaking sport-specific imports up.
 *
 *   const result = await autoHealSlate({
 *     sport: 'nba',
 *     slateDate: '2026-04-30',
 *     fetchFinals: ({ slateDate }) => import('../nba/live/_normalize.js')
 *       .then(m => m.fetchYesterdayFinals({ slateDate })),
 *     timeoutMs: 4000,
 *   });
 *
 * Returns:
 *   {
 *     attempted: boolean,
 *     succeeded: boolean,
 *     gradedCount: number,
 *     finalsCount: number,
 *     pickCount: number,
 *     reason?: string,         // why we bailed
 *     error?: string,
 *   }
 */

import { getPicksForSlate, upsertPickResults, upsertScorecard } from './picksHistory.js';
import { gradePicks } from '../../src/features/mlb/picks/v2/settle.js';
import { buildScorecard } from '../../src/features/mlb/picks/v2/scorecard.js';

const DEFAULT_TIMEOUT_MS = 4500;

function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

export async function autoHealSlate({
  sport,
  slateDate,
  fetchFinals,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  rebuildScorecard = true,
}) {
  const out = {
    attempted: false,
    succeeded: false,
    gradedCount: 0,
    finalsCount: 0,
    pickCount: 0,
    scorecardRebuilt: false,
  };

  try {
    const work = (async () => {
      // 1. Pull persisted picks. If none, nothing to heal.
      const { picks } = await getPicksForSlate({ sport, slateDate });
      out.pickCount = picks.length;
      if (!picks.length) {
        out.reason = 'no_picks_persisted';
        return;
      }

      // 2. Pull finals from ESPN. If none, games aren't actually done —
      //    no point grading.
      const finals = await fetchFinals({ slateDate });
      const finalsArr = Array.isArray(finals) ? finals : [];
      out.finalsCount = finalsArr.length;
      if (!finalsArr.length) {
        out.reason = 'no_finals_available';
        return;
      }
      const finalsByGameId = new Map();
      for (const g of finalsArr) {
        if (g?.gameId) finalsByGameId.set(String(g.gameId), g);
      }

      // 3. Skip picks already graded — only fix what's pending.
      const alreadyGraded = new Set();
      for (const p of picks) {
        const r = p.pick_results?.[0];
        if (r && r.status !== 'pending') alreadyGraded.add(p.id);
      }

      // 4. Grade and write.
      out.attempted = true;
      const rows = gradePicks(picks, finalsByGameId, alreadyGraded);
      const newlyGraded = rows.filter(r => r.status !== 'pending').length;
      const { ok } = await upsertPickResults(rows);
      out.succeeded = ok !== false && newlyGraded > 0;
      out.gradedCount = newlyGraded;

      if (!out.succeeded) {
        out.reason = newlyGraded === 0 ? 'no_finals_matched_picks' : 'upsert_failed';
        return;
      }

      // 5. Rebuild the aggregate scorecard row so /built and any aggregate
      //    fallback path stays in sync with the freshly-written rows.
      if (rebuildScorecard) {
        try {
          // Re-fetch picks now that pick_results are written so the
          // aggregate counts are correct.
          const { picks: regraded } = await getPicksForSlate({ sport, slateDate });
          const row = buildScorecard({ sport, slateDate, picks: regraded });
          const result = await upsertScorecard(row);
          out.scorecardRebuilt = !!result;
        } catch (e) {
          out._scorecardError = e?.message;
        }
      }
    })();

    await withTimeout(work, timeoutMs, 'autoHealSlate');
  } catch (e) {
    out.error = e?.message || 'unknown';
  }

  return out;
}
