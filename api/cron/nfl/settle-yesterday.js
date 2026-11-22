/**
 * POST/GET /api/cron/nfl/settle-yesterday
 *
 * Mirrors the MLB and NBA settlement crons. Grades every NFL pick whose
 * slate date is yesterday (ET) against that day's finals and writes
 * pick_results. Runs daily; on days with no NFL games it exits cleanly.
 *
 * NFL picks are persisted under their kickoff date, so a Sunday slate is
 * graded Monday morning and Monday Night Football on Tuesday morning. The
 * post-game review cron (review-games.js) grades the same picks sooner,
 * as each game ends; this run is the backstop.
 *
 *   ?date=YYYY-MM-DD  manual backfill for one slate
 *   ?force=1          re-grade picks that already have a result
 */

import { settleNflSlate } from '../../_lib/nflSettle.js';
import { yesterdayET } from '../../_lib/dateWindows.js';
import { requireAdminOrCron } from '../../_lib/requireAuth.js';

export default async function handler(req, res) {
  if (!(await requireAdminOrCron(req, res))) return;

  const slateDate = req?.query?.date || yesterdayET();
  const force = req?.query?.force === '1';

  try {
    return res.status(200).json(await settleNflSlate({ slateDate, force, tag: 'cron/nfl/settle-yesterday' }));
  } catch (e) {
    console.error('[cron/nfl/settle-yesterday] fatal:', e);
    return res.status(200).json({ ok: false, error: e?.message || 'unknown', slateDate });
  }
}
