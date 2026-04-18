/**
 * GET /api/mlb/picks/scorecard?date=YYYY-MM-DD
 *
 * Returns the scorecard for the requested slate (defaults to yesterday ET).
 * Reads from picks_daily_scorecards; returns `{ scorecard: null, picks: [] }`
 * if no row exists yet.
 */

import { getScorecard, getLatestRunForDate } from '../../_lib/picksHistory.js';

function yesterdayET() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  try {
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
    return fmt.format(d);
  } catch { return d.toISOString().slice(0, 10); }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=900');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const slateDate = (req.query?.date && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date))
    ? req.query.date
    : yesterdayET();

  try {
    const card = await getScorecard({ sport: 'mlb', slateDate });
    let picks = [];
    if (req.query?.includePicks === '1') {
      const run = await getLatestRunForDate({ sport: 'mlb', slateDate });
      picks = run?.picks || [];
    }
    return res.status(200).json({
      slateDate,
      scorecard: card ? {
        date: card.slate_date,
        overall: card.record,
        byMarket: card.by_market,
        byTier: card.by_tier,
        topPlayResult: card.top_play_result,
        streak: card.streak,
        note: card.note,
        computedAt: card.computed_at,
      } : null,
      picks,
    });
  } catch (e) {
    return res.status(200).json({ slateDate, scorecard: null, picks: [], error: e?.message });
  }
}
