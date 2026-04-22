/**
 * POST/GET /api/cron/mlb/run-audit
 *
 * Scheduled ~4:00 AM ET. Analyzes yesterday's graded picks, writes an audit
 * artifact, and — if the proposer found deltas — creates a shadow config
 * (never auto-applies; needs sample + shadow-period + admin promote).
 */

import { getLatestRunForDate, writeAuditArtifact, getActiveConfig, logTuning } from '../../_lib/picksHistory.js';
import { analyzePicks } from '../../../src/features/mlb/picks/v2/audit.js';
import { validateTuningDelta, diffConfig } from '../../../src/features/picks/tuning/validator.js';
import { MLB_DEFAULT_CONFIG } from '../../../src/features/picks/tuning/defaultConfig.js';
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

function nextVersion(prev, slateDate) {
  // e.g. mlb-picks-tuning-2026-04-17a → mlb-picks-tuning-2026-04-18a
  const suffix = String.fromCharCode(97 + Math.floor(Math.random() * 5)); // a..e
  return `mlb-picks-tuning-${slateDate}${suffix}`;
}

export default async function handler(req, res) {
  const slateDate = req?.query?.date || yesterdayET();

  try {
    const run = await getLatestRunForDate({ sport: 'mlb', slateDate });
    const picks = run?.picks || [];
    if (!run) {
      console.warn(`[cron/mlb/run-audit] no picks_run for ${slateDate} — audit will produce a zero-sample artifact`);
    }

    const { summary, signalAttribution, recommendedDeltas } = analyzePicks({ sport: 'mlb', slateDate, picks });

    // Persist the audit artifact
    const artifact = await writeAuditArtifact({
      sport: 'mlb',
      slate_date: slateDate,
      summary,
      signal_attribution: signalAttribution,
      recommended_deltas: recommendedDeltas,
    });
    if (!artifact) {
      console.error(`[cron/mlb/run-audit] ⚠ audit artifact write returned null — check picks_audit_artifacts existence`);
    }

    // If deltas exist, validate + propose a shadow config row.
    let shadowVersion = null;
    let tuningLogId = null;

    const hasDelta =
      recommendedDeltas?.weights || recommendedDeltas?.tierCutoffs || recommendedDeltas?.marketGates;

    if (hasDelta) {
      const current = (await getActiveConfig({ sport: 'mlb' })) || MLB_DEFAULT_CONFIG;
      const proposed = applyDeltasToConfig(current, recommendedDeltas);
      const validation = validateTuningDelta(current, proposed, {
        sampleSize: summary.sampleSize,
        shadowDays: 0,
        mode: 'propose',
      });

      if (validation.ok) {
        const version = nextVersion(current.version, slateDate);
        const delta = diffConfig(current, validation.bounded);

        // Insert shadow config (default: shadow only; auto-apply is off)
        let admin = null;
        try { admin = getSupabaseAdmin(); } catch { /* no-op */ }
        if (admin) {
          await admin.from('picks_config').insert({
            version,
            sport: 'mlb',
            is_active: false,
            is_shadow: true,
            config: { ...validation.bounded, version },
          });
          const tl = await logTuning({
            sport: 'mlb',
            slate_date: slateDate,
            from_config_version: current.version,
            to_config_version: version,
            delta,
            rationale: { warnings: validation.warnings, proposer: recommendedDeltas.rationale || [] },
            sample_size: summary.sampleSize,
            status: 'shadow',
          });
          tuningLogId = tl?.id || null;
          shadowVersion = version;
        }
      }
    }

    return res.status(200).json({
      ok: true,
      slateDate,
      sampleSize: summary.sampleSize,
      proposed: !!hasDelta,
      shadowVersion,
      tuningLogId,
      artifact: artifact ? { id: artifact.id } : null,
    });
  } catch (e) {
    console.error('[cron/mlb/run-audit] fatal:', e);
    return res.status(200).json({ ok: false, error: e?.message, slateDate });
  }
}
