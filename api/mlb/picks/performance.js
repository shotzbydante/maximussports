/**
 * GET /api/mlb/picks/performance
 *
 * Aggregates `picks_daily_scorecards` over trailing windows and returns a
 * single shape the UI can render directly. Only real persisted rows — no
 * invented stats.
 *
 * Response:
 *   {
 *     sport: 'mlb',
 *     windows: {
 *       trailing7d:  { label, record, winRate, sample, days, sparse, insights[] } | null,
 *       trailing30d: { … } | null,
 *     },
 *     topPlay: { graded, won, lost, hitRate } | null,   // trailing-30 aggregate
 *     lastGradedDate: 'YYYY-MM-DD' | null,
 *     generatedAt: ISO,
 *   }
 *
 * Gracefully returns `null` subtrees when no rows exist.
 */

import { getSupabaseAdmin } from '../../_lib/supabaseAdmin.js';
import { aggregateScorecards, shapeWindow } from '../../../src/features/mlb/picks/performanceInsights.js';
import { yesterdayET, daysAgoFromYesterdayET } from '../../_lib/dateWindows.js';

const isoDaysAgoFromYesterday = daysAgoFromYesterdayET;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=900');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const sport = (req.query?.sport || 'mlb').toString();
  const yesterday = yesterdayET();
  const from30 = isoDaysAgoFromYesterday(30);

  let admin;
  try { admin = getSupabaseAdmin(); }
  catch (e) {
    return res.status(200).json({
      sport, windows: { trailing7d: null, trailing30d: null },
      topPlay: null, lastGradedDate: null, generatedAt: new Date().toISOString(),
      _error: 'supabase_unavailable', _detail: e?.message,
    });
  }

  let rows = [];
  try {
    const { data, error } = await admin
      .from('picks_daily_scorecards')
      .select('slate_date, record, by_market, by_tier, top_play_result, streak, note')
      .eq('sport', sport)
      .gte('slate_date', from30)
      .lte('slate_date', yesterday)
      .order('slate_date', { ascending: false });
    if (error) {
      return res.status(200).json({
        sport, windows: { trailing7d: null, trailing30d: null },
        topPlay: null, lastGradedDate: null, generatedAt: new Date().toISOString(),
        _error: 'query_failed', _detail: error.message,
      });
    }
    rows = data || [];
  } catch (e) {
    return res.status(200).json({
      sport, windows: { trailing7d: null, trailing30d: null },
      topPlay: null, lastGradedDate: null, generatedAt: new Date().toISOString(),
      _error: 'exception', _detail: e?.message,
    });
  }

  const lastGradedDate = rows[0]?.slate_date || null;
  const last7 = rows.filter(r => r.slate_date >= isoDaysAgoFromYesterday(7));
  const last30 = rows;

  const windows = {
    trailing7d: last7.length > 0 ? shapeWindow(last7, 'Last 7 days') : null,
    trailing30d: last30.length > 0 ? shapeWindow(last30, 'Last 30 days') : null,
  };

  const agg30 = aggregateScorecards(last30);

  return res.status(200).json({
    sport,
    windows,
    topPlay: agg30.topPlay?.graded > 0 ? agg30.topPlay : null,
    lastGradedDate,
    generatedAt: new Date().toISOString(),
  });
}
