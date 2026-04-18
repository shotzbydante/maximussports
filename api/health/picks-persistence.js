/**
 * GET /api/health/picks-persistence
 *
 * Probes every v2 persistence table. Returns:
 *   {
 *     ok:           boolean,            // false if any required table is missing
 *     sport:        'mlb',
 *     tables:       { <name>: { ok, count, error? }, ... },
 *     missing:      [ <table-names-the-runtime-couldnt-read> ],
 *     warnings:     [ ... ],
 *     activeConfig: { version, sport } | null,
 *     env:          { hasUrl, hasServiceKey },
 *     durationMs:   number,
 *     generatedAt:  ISO,
 *   }
 *
 * Cacheable for 30s (s-maxage=30). Useful as an uptime probe and as the
 * reverse side of the deploy runbook: operators hit this and see green.
 */

import { getSupabaseAdmin, getEnvStatus } from '../_lib/supabaseAdmin.js';

const REQUIRED_TABLES = [
  'picks_runs',
  'picks',
  'pick_results',
  'picks_daily_scorecards',
  'picks_config',
  'picks_tuning_log',
  'picks_audit_artifacts',
];

export default async function handler(req, res) {
  const t0 = Date.now();
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');

  const env = getEnvStatus();
  const sport = (req?.query?.sport || 'mlb').toString();

  let admin;
  try { admin = getSupabaseAdmin(); }
  catch (e) {
    return res.status(200).json({
      ok: false,
      sport,
      tables: {},
      missing: REQUIRED_TABLES,
      warnings: ['service-role client unavailable'],
      activeConfig: null,
      env,
      durationMs: Date.now() - t0,
      generatedAt: new Date().toISOString(),
      error: e?.message,
    });
  }

  const results = {};
  const missing = [];
  const warnings = [];

  await Promise.all(REQUIRED_TABLES.map(async (table) => {
    try {
      // HEAD request with exact count. If the table doesn't exist, PostgREST
      // returns PGRST205 / 42P01 and we treat it as missing.
      const { count, error } = await admin
        .from(table)
        .select('*', { count: 'exact', head: true });
      if (error) {
        const isMissing =
          error.code === '42P01' ||            // undefined_table
          error.code === 'PGRST205' ||         // schema cache miss
          /relation .* does not exist/i.test(error.message || '') ||
          /Could not find the table/i.test(error.message || '');
        results[table] = { ok: false, count: null, error: error.message, code: error.code };
        if (isMissing) missing.push(table);
        else warnings.push(`${table}: ${error.message}`);
      } else {
        results[table] = { ok: true, count: count ?? 0 };
      }
    } catch (e) {
      results[table] = { ok: false, count: null, error: e?.message || 'unknown' };
      missing.push(table);
    }
  }));

  // Active config probe (only if picks_config exists)
  let activeConfig = null;
  if (results.picks_config?.ok) {
    try {
      const { data, error } = await admin
        .from('picks_config')
        .select('version, sport, is_active')
        .eq('sport', sport)
        .eq('is_active', true)
        .maybeSingle();
      if (error) warnings.push(`picks_config query: ${error.message}`);
      else if (!data) warnings.push(`no active picks_config for sport=${sport}`);
      else activeConfig = data;
    } catch (e) {
      warnings.push(`picks_config query failed: ${e?.message}`);
    }
  }

  const ok = missing.length === 0 && !!activeConfig;

  // Loud log on failure so operators notice in Vercel logs
  if (!ok) {
    console.error('[health/picks-persistence] FAIL', { missing, warnings, env, sport });
  } else {
    console.log(`[health/picks-persistence] OK sport=${sport} tables=${REQUIRED_TABLES.length} config=${activeConfig?.version}`);
  }

  return res.status(200).json({
    ok,
    sport,
    tables: results,
    missing,
    warnings,
    activeConfig,
    env,
    durationMs: Date.now() - t0,
    generatedAt: new Date().toISOString(),
  });
}

export { REQUIRED_TABLES };
