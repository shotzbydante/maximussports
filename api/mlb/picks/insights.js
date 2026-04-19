/**
 * GET /api/mlb/picks/insights
 *
 * Reads the most recent `picks_audit_artifacts` rows and shapes 0–3 short,
 * evidence-backed editorial insights. Only surfaces when minimum-sample
 * guards pass — otherwise returns an empty array.
 *
 * Response:
 *   {
 *     sport: 'mlb',
 *     insights: [ { key, text, tone } ],
 *     latest: { slateDate, sampleSize, byMarket, byTier } | null,
 *     tuning: { recentApplied: number, recentShadows: number },
 *     generatedAt: ISO,
 *   }
 */

import { getSupabaseAdmin } from '../../_lib/supabaseAdmin.js';
import { summarizeAuditInsights } from '../../../src/features/mlb/picks/performanceInsights.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=1800');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const sport = (req.query?.sport || 'mlb').toString();
  const days = Math.max(7, Math.min(60, parseInt(req.query?.days, 10) || 30));

  let admin;
  try { admin = getSupabaseAdmin(); }
  catch (e) {
    return res.status(200).json({
      sport, insights: [], latest: null,
      tuning: { recentApplied: 0, recentShadows: 0 },
      generatedAt: new Date().toISOString(),
      _error: 'supabase_unavailable', _detail: e?.message,
    });
  }

  let artifacts = [];
  let tuningSummary = { recentApplied: 0, recentShadows: 0 };
  try {
    // Pull recent audit artifacts
    const { data: arts } = await admin
      .from('picks_audit_artifacts')
      .select('slate_date, summary, signal_attribution, recommended_deltas, created_at')
      .eq('sport', sport)
      .order('slate_date', { ascending: false })
      .limit(days);
    artifacts = arts || [];

    // Pull recent tuning-log entries so we can truthfully say the model is
    // evolving only when there's a corresponding applied/shadow row.
    const since = new Date();
    since.setDate(since.getDate() - 14);
    const sinceIso = since.toISOString().slice(0, 10);
    const { data: tuning } = await admin
      .from('picks_tuning_log')
      .select('status, created_at')
      .eq('sport', sport)
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .limit(50);
    tuningSummary = {
      recentApplied: (tuning || []).filter(t => t.status === 'applied').length,
      recentShadows: (tuning || []).filter(t => t.status === 'shadow').length,
    };
  } catch (e) {
    return res.status(200).json({
      sport, insights: [], latest: null,
      tuning: { recentApplied: 0, recentShadows: 0 },
      generatedAt: new Date().toISOString(),
      _error: 'query_failed', _detail: e?.message,
    });
  }

  const insights = summarizeAuditInsights(artifacts);

  // Add a cautious "learning" line ONLY when there's real tuning evidence.
  if (tuningSummary.recentApplied > 0) {
    insights.push({
      key: 'tuning_applied',
      text: `The model recalibrated ${tuningSummary.recentApplied === 1 ? 'once' : `${tuningSummary.recentApplied} times`} in the last two weeks based on graded results.`,
      tone: 'positive',
    });
  } else if (tuningSummary.recentShadows > 0 && insights.length < 3) {
    insights.push({
      key: 'tuning_shadow',
      text: `${tuningSummary.recentShadows === 1 ? 'A candidate tuning adjustment is' : `${tuningSummary.recentShadows} candidate tuning adjustments are`} running in shadow mode pending more results.`,
      tone: 'neutral',
    });
  }

  const latest = artifacts[0]
    ? {
        slateDate: artifacts[0].slate_date,
        sampleSize: artifacts[0].summary?.sampleSize ?? 0,
        byMarket: artifacts[0].summary?.byMarket || null,
        byTier: artifacts[0].summary?.byTier || null,
      }
    : null;

  return res.status(200).json({
    sport,
    insights: insights.slice(0, 3),
    latest,
    tuning: tuningSummary,
    generatedAt: new Date().toISOString(),
  });
}
