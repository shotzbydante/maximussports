/**
 * GET /api/nba/picks/scorecard?date=YYYY-MM-DD
 *
 * Returns the scorecard for the requested NBA slate.
 *
 * Behavior:
 *   - With ?date=YYYY-MM-DD: returns that exact slate (or null if missing).
 *   - Without ?date: returns the most recent graded NBA slate (preferring
 *     yesterday ET when graded; falling back through the last 14 days when
 *     yesterday has no graded results). This prevents the dead "No picks
 *     persisted for this date" state when an earlier slate did finish.
 *
 * Response shape mirrors /api/mlb/picks/scorecard.
 */

import {
  getScorecard, getLatestGradedScorecard, getLatestRunForDate,
} from '../../_lib/picksHistory.js';
import { yesterdayET } from '../../_lib/dateWindows.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=900');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const explicitDate = req.query?.date && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)
    ? req.query.date
    : null;
  const requestedSlate = explicitDate || yesterdayET();

  try {
    let card = await getScorecard({ sport: 'nba', slateDate: requestedSlate });
    let usedFallback = false;

    // When the caller didn't pin a specific date, fall back to the most
    // recent graded slate if the default (yesterday) has no graded data.
    if (!explicitDate) {
      const graded = card?.record
        ? ((card.record.won ?? 0) + (card.record.lost ?? 0) + (card.record.push ?? 0))
        : 0;
      if (!card || graded === 0) {
        const fallback = await getLatestGradedScorecard({ sport: 'nba', lookbackDays: 14 });
        if (fallback) {
          card = fallback;
          usedFallback = true;
        }
      }
    }

    let picks = [];
    if (req.query?.includePicks === '1' && card?.slate_date) {
      const run = await getLatestRunForDate({ sport: 'nba', slateDate: card.slate_date });
      picks = run?.picks || [];
    }

    return res.status(200).json({
      slateDate: card?.slate_date || requestedSlate,
      requestedSlate,
      usedFallback,
      scorecard: card ? {
        date: card.slate_date,
        overall: card.record,
        byMarket: card.by_market,
        byTier: card.by_tier,
        topPlayResult: card.top_play_result,
        streak: card.streak,
        note: card.note,
        computedAt: card.computed_at,
        isFallback: usedFallback,
      } : null,
      picks,
    });
  } catch (e) {
    return res.status(200).json({
      slateDate: requestedSlate,
      requestedSlate,
      usedFallback: false,
      scorecard: null,
      picks: [],
      error: e?.message,
    });
  }
}
