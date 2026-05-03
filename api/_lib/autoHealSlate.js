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
  /**
   * When true, ignore the existing pick_results.status and re-grade every
   * pick. Used by the operator escape hatch after a grading-math fix
   * lands — the existing rows have stale (wrong) statuses and the normal
   * "skip already-graded" path leaves them broken. Default false; only the
   * scorecard endpoint with ?regrade=1 sets this to true.
   */
  forceRegrade = false,
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
      // Build a primary index by ESPN game_id and a secondary index by
      // unordered team-slug pair on the slate. The secondary index repairs
      // legacy picks whose persisted game_id is an Odds-API id (or any non-
      // ESPN id) so we don't lose graded data over an id format mismatch.
      const finalsByGameId = new Map();
      const finalsBySlugPair = new Map();
      const slugPairKey = (a, b) => {
        const ax = String(a || '').toLowerCase();
        const bx = String(b || '').toLowerCase();
        return ax < bx ? `${ax}|${bx}` : `${bx}|${ax}`;
      };
      for (const g of finalsArr) {
        if (g?.gameId) finalsByGameId.set(String(g.gameId), g);
        const aSlug = g?.teams?.away?.slug;
        const hSlug = g?.teams?.home?.slug;
        if (aSlug && hSlug) finalsBySlugPair.set(slugPairKey(aSlug, hSlug), g);
      }

      // 3. Skip picks already graded — only fix what's pending.
      // pick_results joins via primary key — PostgREST may return object OR array.
      // forceRegrade=true: ignore existing status, re-grade everything.
      const alreadyGraded = new Set();
      if (!forceRegrade) {
        for (const p of picks) {
          const raw = p.pick_results;
          const r = Array.isArray(raw) ? raw[0] : raw;
          if (r && r.status !== 'pending') alreadyGraded.add(p.id);
        }
      }
      out.forceRegrade = !!forceRegrade;

      // Build an augmented map keyed by each pick's persisted game_id so
      // gradePicks() resolves through fallbacks transparently. For each
      // unmatched pick, try the slug-pair index; if found, alias the
      // pick.game_id → final in the map gradePicks consults. Track
      // diagnostics for any pick we can't match by either path.
      const augmented = new Map(finalsByGameId);
      const matchAttempts = [];
      const unmatchedPicks = [];
      for (const p of picks) {
        if (alreadyGraded.has(p.id)) continue;
        if (p.game_id && augmented.has(String(p.game_id))) {
          matchAttempts.push({ pickId: p.id, via: 'game_id', gameId: p.game_id });
          continue;
        }
        const pairKey = slugPairKey(p.away_team_slug, p.home_team_slug);
        const aliasFinal = finalsBySlugPair.get(pairKey);
        if (aliasFinal) {
          augmented.set(String(p.game_id || p.id), aliasFinal);
          matchAttempts.push({
            pickId: p.id, via: 'slug_pair',
            pickGameId: p.game_id, espnGameId: aliasFinal.gameId,
            pair: pairKey,
          });
        } else {
          unmatchedPicks.push({
            pickId: p.id,
            pickGameId: p.game_id,
            matchup: `${p.away_team_slug || '?'}@${p.home_team_slug || '?'}`,
            pair: pairKey,
            reason: !p.away_team_slug || !p.home_team_slug
              ? 'pick missing away/home slug'
              : 'no final with same team pair',
          });
        }
      }
      out.matchAttempts = matchAttempts;
      out.unmatchedPickSummaries = unmatchedPicks;
      out.unmatchedPickIds = unmatchedPicks.map(u => u.pickId);
      out.finalGameKeys = finalsArr.map(g => ({
        gameId: g.gameId,
        pair: slugPairKey(g.teams?.away?.slug, g.teams?.home?.slug),
        away: g.teams?.away?.slug, home: g.teams?.home?.slug,
        isFinal: !!(g.gameState?.isFinal || g.status === 'final'),
      }));
      out.pickGameKeys = picks.map(p => ({
        pickId: p.id, gameId: p.game_id,
        pair: slugPairKey(p.away_team_slug, p.home_team_slug),
      }));

      // 4. Grade and write using the augmented index.
      out.attempted = true;
      const rows = gradePicks(picks, augmented, alreadyGraded);
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
