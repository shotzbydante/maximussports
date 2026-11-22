/**
 * GET /api/cron/nfl/review-games
 *
 * The post-game review. Runs every half hour and does nothing most of the
 * time. When a game with stored picks has had time to finish it:
 *
 *   1. grades the slate (the same grading the overnight cron does), so a
 *      result is on the record soon after the final whistle
 *   2. reviews every newly graded pick: how it finished, whether the
 *      number was good at the close, what the box score says, and what
 *      changed after the pick was locked
 *   3. grades each engine input against the closing line and rebuilds the
 *      season ledger
 *
 * A review never changes the engine. The ledger only raises a line for a
 * decision after 60 results over four weeks (TREND_RULES), and the step
 * after that is a backtest or a shadow run.
 *
 *   ?date=YYYY-MM-DD  one slate (backfill)
 *   ?force=1          re-review picks that already have a review
 */

import { getNflPicks } from '../../_lib/nflPicksStore.js';
import { settleNflSlate } from '../../_lib/nflSettle.js';
import { reviewNflSlate, getReviewArtifacts } from '../../_lib/nflReview.js';
import { todayET, yesterdayET } from '../../_lib/dateWindows.js';
import { requireAdminOrCron } from '../../_lib/requireAuth.js';

/** A game is given this long after kickoff before its final is looked for. */
const GAME_MINUTES = 170;
const resultOf = (p) => (Array.isArray(p?.pick_results) ? p.pick_results[0] : p?.pick_results);
const isGraded = (p) => ['won', 'lost', 'push'].includes(resultOf(p)?.status);

/** What one slate needs. Exported for tests. */
export function slateWork({ picks = [], reviewedIds = new Set(), now = Date.now() }) {
  const due = picks.filter((p) => !isGraded(p) && resultOf(p)?.status !== 'void'
    && Date.parse(p.start_time || '') + GAME_MINUTES * 60_000 <= now);
  const unreviewed = picks.filter((p) => isGraded(p) && !reviewedIds.has(p.id));
  return { settle: due.length > 0, review: due.length > 0 || unreviewed.length > 0, due: due.length, unreviewed: unreviewed.length };
}

export default async function handler(req, res) {
  if (!(await requireAdminOrCron(req, res))) return;
  const t0 = Date.now();
  const force = req?.query?.force === '1';
  const dates = req?.query?.date ? [String(req.query.date)] : [...new Set([todayET(), yesterdayET()])];
  const out = [];
  try {
    for (const slateDate of dates) {
      const stored = await getNflPicks({ from: slateDate });
      if (!stored.ok) { out.push({ slateDate, ok: false, error: stored.error }); continue; }
      if (stored.picks.length === 0) { out.push({ slateDate, ok: true, skipped: 'no_picks' }); continue; }
      const artifact = (await getReviewArtifacts({ from: slateDate, to: slateDate }))[0] || null;
      const reviewedIds = new Set((artifact?.summary?.reviews || []).map((r) => r.pickId));
      const work = force ? { settle: true, review: true } : slateWork({ picks: stored.picks, reviewedIds });
      if (!work.review) { out.push({ slateDate, ok: true, skipped: 'nothing_due' }); continue; }
      const settled = work.settle ? await settleNflSlate({ slateDate, tag: 'cron/nfl/review-games' }) : null;
      const reviewed = await reviewNflSlate({ slateDate, force });
      out.push({
        slateDate, ok: reviewed.ok !== false,
        graded: settled?.graded ?? 0, clvSaved: settled?.clvSaved ?? 0,
        reviewed: reviewed.reviewed ?? 0, total: reviewed.total ?? null,
        boxScores: reviewed.boxScores ?? null, partialContext: reviewed.partialContext ?? null,
        counts: reviewed.counts || null, findings: reviewed.findings || null, note: reviewed.note || null,
        error: reviewed.error || settled?.error || null,
      });
    }
    const did = out.reduce((s, r) => s + (r.reviewed || 0), 0);
    if (did > 0) console.log(`[cron/nfl/review-games] reviewed=${did} ${JSON.stringify(out.map((r) => ({ d: r.slateDate, g: r.graded, r: r.reviewed })))}`);
    return res.status(200).json({ ok: out.every((r) => r.ok !== false), slates: out, durationMs: Date.now() - t0 });
  } catch (e) {
    console.error('[cron/nfl/review-games] fatal:', e);
    return res.status(200).json({ ok: false, error: e?.message || 'unknown', slates: out });
  }
}
