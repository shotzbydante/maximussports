/**
 * GET /api/nba/picks/scorecard-debug?date=YYYY-MM-DD
 *
 * Operator diagnostic for NBA scorecard pipeline. Surfaces every input
 * that affects whether Yesterday's Scorecard renders content:
 *   - targetDate (resolved slate)
 *   - persistedPicksCount (rows in `picks` for this sport+slate)
 *   - completedGamesCount (NBA finals from ESPN for this slate)
 *   - gradedPicksCount (rows in pick_results with status != 'pending')
 *   - ungradedPicksCount (pending picks)
 *   - missingGameIds (picks whose game_id has no matching final)
 *   - reasonIfEmpty (one-line explanation if scorecard is empty)
 */

import { getSupabaseAdmin } from '../../_lib/supabaseAdmin.js';
import { getPicksForSlate, getScorecard, getLatestGradedScorecard } from '../../_lib/picksHistory.js';
import { fetchYesterdayFinals } from '../../nba/live/_normalize.js';
import { yesterdayET } from '../../_lib/dateWindows.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const targetDate = (req.query?.date && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date))
    ? req.query.date
    : yesterdayET();

  const out = {
    sport: 'nba',
    targetDate,
    persistedPicksCount: 0,
    completedGamesCount: 0,
    gradedPicksCount: 0,
    ungradedPicksCount: 0,
    missingGameIds: [],
    runIds: [],
    droppedDuplicates: 0,
    scorecardRow: null,
    latestGradedSlate: null,
    reasonIfEmpty: null,
  };

  // 1) Persisted picks for the slate
  try {
    const { picks, runIds, totalRaw, droppedDuplicates } =
      await getPicksForSlate({ sport: 'nba', slateDate: targetDate });
    out.persistedPicksCount = picks.length;
    out.runIds = Array.from(runIds || []);
    out.droppedDuplicates = droppedDuplicates || 0;
    out._totalRaw = totalRaw || 0;

    // 2) Completed games from ESPN
    let finals = [];
    try {
      finals = await fetchYesterdayFinals({ slateDate: targetDate });
    } catch (e) {
      out._finalsError = e?.message;
    }
    out.completedGamesCount = finals.length;
    const finalsByGameId = new Set(finals.map(g => String(g.gameId || '')));

    // 3) Grading state
    let graded = 0, ungraded = 0;
    const missing = [];
    for (const p of picks) {
      const r = p.pick_results?.[0];
      if (r && r.status !== 'pending') {
        graded += 1;
      } else {
        ungraded += 1;
        if (p.game_id && !finalsByGameId.has(String(p.game_id))) {
          missing.push(p.game_id);
        }
      }
    }
    out.gradedPicksCount = graded;
    out.ungradedPicksCount = ungraded;
    out.missingGameIds = Array.from(new Set(missing));
  } catch (e) {
    out._picksError = e?.message;
  }

  // 4) Scorecard row
  try {
    out.scorecardRow = await getScorecard({ sport: 'nba', slateDate: targetDate });
  } catch (e) {
    out._scorecardError = e?.message;
  }

  // 5) Latest graded slate (lookback fallback target)
  try {
    const fallback = await getLatestGradedScorecard({ sport: 'nba', lookbackDays: 14 });
    if (fallback) {
      out.latestGradedSlate = {
        slate_date: fallback.slate_date,
        record: fallback.record,
        note: fallback.note,
      };
    }
  } catch (e) {
    out._fallbackError = e?.message;
  }

  // 6) Reason — one-line diagnosis
  if (out.persistedPicksCount === 0) {
    out.reasonIfEmpty = `No picks persisted for ${targetDate}. Verify /api/nba/picks/built ran during the slate window and writePicksRun succeeded.`;
  } else if (out.completedGamesCount === 0) {
    out.reasonIfEmpty = `${out.persistedPicksCount} picks persisted but ESPN returned no completed games for ${targetDate}. Settle cron will retry tomorrow.`;
  } else if (out.gradedPicksCount === 0 && out.ungradedPicksCount > 0) {
    out.reasonIfEmpty = `Picks persisted and ${out.completedGamesCount} games final, but 0 grading rows written. Check settle-yesterday cron logs and game_id matching.`;
  } else if (out.missingGameIds.length > 0) {
    out.reasonIfEmpty = `${out.missingGameIds.length} picks have game_ids with no matching ESPN final. Likely picks built for an upcoming slate, not the target.`;
  } else if (!out.scorecardRow) {
    out.reasonIfEmpty = `Picks graded but no scorecard row exists. Check build-scorecard cron logs.`;
  }

  return res.status(200).json(out);
}
