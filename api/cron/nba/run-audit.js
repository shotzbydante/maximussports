/**
 * POST/GET /api/cron/nba/run-audit
 *
 * Mirrors /api/cron/mlb/run-audit for NBA. Analyzes NBA picks + results for
 * the slate, writes an audit artifact, and proposes bounded shadow tuning
 * deltas (never auto-applies).
 */

import { getPicksForSlate, writeAuditArtifact, getActiveConfig, logTuning } from '../../_lib/picksHistory.js';
import { analyzePicks } from '../../../src/features/mlb/picks/v2/audit.js';
import { validateTuningDelta, diffConfig } from '../../../src/features/picks/tuning/validator.js';
import { NBA_DEFAULT_CONFIG } from '../../../src/features/nba/picks/v2/buildNbaPicksV2.js';
import { getSupabaseAdmin } from '../../_lib/supabaseAdmin.js';
import { yesterdayET } from '../../_lib/dateWindows.js';

function applyDeltasToConfig(current, deltas) {
  const next = JSON.parse(JSON.stringify(current));
  if (deltas.weights) {
    for (const k of Object.keys(deltas.weights)) {
      const d = deltas.weights[k]?.delta ?? 0;
      next.weights[k] = (next.weights[k] ?? 0) + d;
    }
  }
  if (deltas.tierCutoffs) {
    for (const t of Object.keys(deltas.tierCutoffs)) {
      const d = deltas.tierCutoffs[t]?.floor?.delta ?? 0;
      next.tierCutoffs[t] = next.tierCutoffs[t] || {};
      next.tierCutoffs[t].floor = (next.tierCutoffs[t].floor ?? 0) + d;
    }
  }
  if (deltas.marketGates) {
    for (const mkt of Object.keys(deltas.marketGates)) {
      next.marketGates[mkt] = next.marketGates[mkt] || {};
      for (const k of Object.keys(deltas.marketGates[mkt])) {
        const d = deltas.marketGates[mkt][k]?.delta ?? 0;
        next.marketGates[mkt][k] = (next.marketGates[mkt][k] ?? 0) + d;
      }
    }
  }
  return next;
}

function nextVersion(_prev, slateDate) {
  const suffix = String.fromCharCode(97 + Math.floor(Math.random() * 5));
  return `nba-picks-tuning-${slateDate}${suffix}`;
}

export default async function handler(req, res) {
  const slateDate = req?.query?.date || yesterdayET();

  try {
    const { picks, runIds } = await getPicksForSlate({ sport: 'nba', slateDate });
    if (picks.length === 0) {
      console.warn(`[cron/nba/run-audit] no persisted picks for ${slateDate} (runIds=${runIds.size}) — zero-sample artifact`);
    }

    const { summary, signalAttribution, recommendedDeltas } =
      analyzePicks({ sport: 'nba', slateDate, picks });

    const artifact = await writeAuditArtifact({
      sport: 'nba',
      slate_date: slateDate,
      summary,
      signal_attribution: signalAttribution,
      recommended_deltas: recommendedDeltas,
    });

    // Only propose shadow configs with sufficient sample
    let shadowVersion = null;
    let tuningLogId = null;
    const hasDelta = recommendedDeltas?.weights || recommendedDeltas?.tierCutoffs || recommendedDeltas?.marketGates;
    if (hasDelta && summary.sampleSize >= 15) {
      const current = (await getActiveConfig({ sport: 'nba' })) || NBA_DEFAULT_CONFIG;
      const proposed = applyDeltasToConfig(current, recommendedDeltas);
      const validation = validateTuningDelta(current, proposed, {
        sampleSize: summary.sampleSize,
        shadowDays: 0,
        mode: 'propose',
      });
      if (validation.ok) {
        const version = nextVersion(current.version, slateDate);
        const delta = diffConfig(current, validation.bounded);

        let admin = null;
        try { admin = getSupabaseAdmin(); } catch { /* no-op */ }
        if (admin) {
          await admin.from('picks_config').insert({
            version, sport: 'nba', is_active: false, is_shadow: true,
            config: { ...validation.bounded, version },
          });
          const tl = await logTuning({
            sport: 'nba', slate_date: slateDate,
            from_config_version: current.version, to_config_version: version,
            delta, rationale: { warnings: validation.warnings, proposer: recommendedDeltas.rationale || [] },
            sample_size: summary.sampleSize, status: 'shadow',
          });
          tuningLogId = tl?.id || null;
          shadowVersion = version;
        }
      }
    }

    return res.status(200).json({
      ok: true, sport: 'nba', slateDate,
      sampleSize: summary.sampleSize,
      proposed: !!hasDelta, shadowVersion, tuningLogId,
      artifact: artifact ? { id: artifact.id } : null,
    });
  } catch (e) {
    console.error('[cron/nba/run-audit] fatal:', e);
    return res.status(200).json({ ok: false, error: e?.message, slateDate });
  }
}
