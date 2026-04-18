/**
 * Admin endpoint for picks tuning.
 *
 *   GET  /api/admin/picks/tuning?sport=mlb
 *     → { active, shadows[], proposals[] }
 *
 *   POST /api/admin/picks/tuning?sport=mlb&action=apply&version=<v>
 *     → promote a shadow config to active (requires ADMIN_API_KEY header match)
 *
 *   POST /api/admin/picks/tuning?sport=mlb&action=rollback
 *     → revert to the most recent previously-active config
 *
 * All mutations require header `x-admin-key: ${process.env.ADMIN_API_KEY}`.
 */

import { getSupabaseAdmin } from '../../_lib/supabaseAdmin.js';
import { validateTuningDelta } from '../../../src/features/picks/tuning/validator.js';
import { MLB_DEFAULT_CONFIG } from '../../../src/features/picks/tuning/defaultConfig.js';

function requireAdminKey(req) {
  const provided = req.headers?.['x-admin-key'] || req.headers?.['X-Admin-Key'];
  const expected = process.env.ADMIN_API_KEY;
  if (!expected) return 'server missing ADMIN_API_KEY';
  if (!provided || provided !== expected) return 'invalid admin key';
  return null;
}

export default async function handler(req, res) {
  const sport = (req.query?.sport || 'mlb').toString();
  let admin;
  try { admin = getSupabaseAdmin(); }
  catch (e) { return res.status(503).json({ error: 'supabase unavailable', message: e?.message }); }

  if (req.method === 'GET') {
    try {
      const { data: active } = await admin
        .from('picks_config')
        .select('*')
        .eq('sport', sport)
        .eq('is_active', true)
        .maybeSingle();
      const { data: shadows } = await admin
        .from('picks_config')
        .select('*')
        .eq('sport', sport)
        .eq('is_shadow', true)
        .order('created_at', { ascending: false })
        .limit(10);
      const { data: proposals } = await admin
        .from('picks_tuning_log')
        .select('*')
        .eq('sport', sport)
        .in('status', ['proposed', 'shadow'])
        .order('created_at', { ascending: false })
        .limit(20);
      return res.status(200).json({ sport, active: active || null, shadows: shadows || [], proposals: proposals || [] });
    } catch (e) {
      return res.status(500).json({ error: e?.message });
    }
  }

  if (req.method === 'POST') {
    const authErr = requireAdminKey(req);
    if (authErr) return res.status(401).json({ error: authErr });

    const action = (req.query?.action || '').toString();
    if (action === 'apply') {
      const version = (req.query?.version || '').toString();
      if (!version) return res.status(400).json({ error: 'version required' });

      try {
        const { data: target } = await admin
          .from('picks_config')
          .select('*').eq('sport', sport).eq('version', version).maybeSingle();
        if (!target) return res.status(404).json({ error: 'version not found' });

        const { data: active } = await admin
          .from('picks_config')
          .select('*').eq('sport', sport).eq('is_active', true).maybeSingle();
        const current = active ? { version: active.version, ...active.config } : MLB_DEFAULT_CONFIG;

        // Count sample size from last 14 days of picks
        const since = new Date(); since.setDate(since.getDate() - 14);
        const sinceIso = since.toISOString().slice(0, 10);
        const { count } = await admin
          .from('picks')
          .select('*', { count: 'exact', head: true })
          .eq('sport', sport)
          .gte('slate_date', sinceIso);

        // Shadow days estimate from target.created_at
        const createdAt = new Date(target.created_at || Date.now());
        const shadowDays = Math.max(0, Math.floor((Date.now() - createdAt.getTime()) / 86400000));

        const validation = validateTuningDelta(current, target.config, {
          sampleSize: count || 0,
          shadowDays,
          mode: 'apply',
        });
        if (!validation.ok) {
          return res.status(400).json({ error: 'apply rejected', details: validation.errors, warnings: validation.warnings });
        }

        // Deactivate current, activate target
        if (active?.version) {
          await admin.from('picks_config')
            .update({ is_active: false, deactivated_at: new Date().toISOString() })
            .eq('version', active.version);
        }
        await admin.from('picks_config')
          .update({ is_active: true, is_shadow: false, activated_at: new Date().toISOString() })
          .eq('version', version);
        await admin.from('picks_tuning_log').insert({
          sport,
          slate_date: new Date().toISOString().slice(0, 10),
          from_config_version: active?.version || 'default',
          to_config_version: version,
          delta: {},
          rationale: { manualApply: true, sampleSize: count, shadowDays },
          sample_size: count || 0,
          status: 'applied',
          applied_at: new Date().toISOString(),
        });

        return res.status(200).json({ ok: true, applied: version, previous: active?.version || null });
      } catch (e) {
        return res.status(500).json({ error: e?.message });
      }
    }

    if (action === 'rollback') {
      try {
        const { data: active } = await admin
          .from('picks_config').select('*').eq('sport', sport).eq('is_active', true).maybeSingle();
        const { data: prior } = await admin
          .from('picks_config').select('*').eq('sport', sport).eq('is_active', false).not('activated_at', 'is', null)
          .order('deactivated_at', { ascending: false }).limit(1);
        const target = prior?.[0];
        if (!target) return res.status(404).json({ error: 'no prior config to roll back to' });

        if (active?.version) {
          await admin.from('picks_config')
            .update({ is_active: false, deactivated_at: new Date().toISOString() })
            .eq('version', active.version);
        }
        await admin.from('picks_config')
          .update({ is_active: true, activated_at: new Date().toISOString() })
          .eq('version', target.version);
        await admin.from('picks_tuning_log').insert({
          sport,
          slate_date: new Date().toISOString().slice(0, 10),
          from_config_version: active?.version || 'unknown',
          to_config_version: target.version,
          delta: {},
          rationale: { rollback: true },
          sample_size: 0,
          status: 'rolled_back',
          reverted_at: new Date().toISOString(),
        });
        return res.status(200).json({ ok: true, restored: target.version, from: active?.version || null });
      } catch (e) {
        return res.status(500).json({ error: e?.message });
      }
    }

    return res.status(400).json({ error: `unknown action ${action}` });
  }

  return res.status(405).json({ error: 'method not allowed' });
}
