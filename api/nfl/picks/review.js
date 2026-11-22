/**
 * GET /api/nfl/picks/review
 *
 * The post-game review ledger for the season: every engine input and every
 * kind of pick with its record, closing-line value and where it stands
 * against the rules for acting on a trend. Admin or cron only: it is the
 * engine's working notebook, not a public page. Review notes on individual
 * picks are public through /api/nfl/picks/scorecard.
 *
 *   ?to=YYYY-MM-DD   ledger as of that date (default today, Eastern)
 *   ?reviews=1       include every stored pick review
 */

import { getReviewLedger } from '../../_lib/nflReview.js';
import { todayET } from '../../_lib/dateWindows.js';
import { requireAdminOrCron } from '../../_lib/requireAuth.js';

export default async function handler(req, res) {
  if (!(await requireAdminOrCron(req, res))) return;
  try {
    const to = req?.query?.to || todayET();
    const { from, slates, ledger, reviews } = await getReviewLedger({ to });
    return res.status(200).json({
      ok: true, sport: 'nfl', from, to, slates, ...ledger,
      reviews: req?.query?.reviews === '1' ? reviews : undefined,
      generatedAt: new Date().toISOString(),
    });
  } catch (e) {
    return res.status(200).json({ ok: false, error: e?.message || 'unknown' });
  }
}
