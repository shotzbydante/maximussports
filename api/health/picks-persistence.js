/**
 * GET /api/health/picks-persistence
 *
 * Authoritative health probe for the MLB Picks v2 persistence layer.
 *
 * PRIMARY (authoritative): calls public.picks_persistence_inventory() via RPC,
 * which queries information_schema.tables from inside the database. This is
 * the same oracle an operator would use in the SQL editor — not inferred.
 *
 * SECONDARY (advisory): a per-table HEAD probe. Compared against the RPC to
 * detect PostgREST schema-cache desync.
 *
 * Distinguishes these states:
 *   - ok:true, source:'rpc', rootCause:'none'        → everything green
 *   - ok:false, rootCause:'env_missing'              → Vercel envs not set
 *   - ok:false, rootCause:'auth_error'               → envs set but not valid
 *   - ok:false, rootCause:'migration_not_run'        → RPC absent; schema not deployed
 *   - ok:false, rootCause:'tables_missing'           → RPC present; some tables absent
 *   - ok:false, rootCause:'no_active_config'         → tables present; seed config missing
 *   - ok:false, rootCause:'cache_desync'             → RPC says present, probe says missing (or v.v.)
 *   - ok:false, rootCause:'rpc_error'                → other RPC failure
 *
 * Not cached. Every call is a ground-truth check. Use ?sport=mlb (default).
 */

import { getSupabaseAdmin, getEnvStatus } from '../_lib/supabaseAdmin.js';
import {
  REQUIRED_TABLES,
  classifyRpcError,
  classifyProbeError,
  buildHealthReport,
} from '../../src/features/picks/health/persistenceHealth.js';

export default async function handler(req, res) {
  const t0 = Date.now();
  res.setHeader('Access-Control-Allow-Origin', '*');
  // No caching — this endpoint must reflect ground truth on every call
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  const env = getEnvStatus();
  const sport = (req?.query?.sport || 'mlb').toString();

  // ── Short-circuit if envs are missing — no DB call possible ──
  if (!env.hasUrl || !env.hasServiceRoleKey) {
    return res.status(200).json(buildHealthReport({
      rpcResult: { ok: false, kind: 'env_missing' },
      probeResults: {},
      env,
      sport,
    }));
  }

  let admin;
  try { admin = getSupabaseAdmin(); }
  catch (e) {
    return res.status(200).json(buildHealthReport({
      rpcResult: { ok: false, kind: 'auth_error', error: { message: e?.message } },
      probeResults: {},
      env,
      sport,
    }));
  }

  // ── Primary: authoritative RPC ──
  let rpcResult;
  try {
    const { data, error } = await admin.rpc('picks_persistence_inventory');
    if (error) {
      const cls = classifyRpcError(error);
      rpcResult = { ok: false, kind: cls.kind, error: { code: error.code, message: error.message } };
    } else {
      rpcResult = { ok: true, data };
    }
  } catch (e) {
    const cls = classifyRpcError(e);
    rpcResult = { ok: false, kind: cls.kind, error: { code: e?.code, message: e?.message } };
  }

  // ── Secondary: per-table advisory probe (cross-checks RPC for cache desync) ──
  const probeResults = {};
  await Promise.all(REQUIRED_TABLES.map(async (table) => {
    try {
      const { count, error } = await admin.from(table).select('*', { count: 'exact', head: true });
      if (error) {
        const cls = classifyProbeError(error);
        probeResults[table] = {
          state: cls.kind === 'missing_table' ? 'missing' : 'unknown',
          rows: null,
          error: error.message,
          code: error.code,
        };
      } else {
        probeResults[table] = { state: 'present', rows: count ?? 0 };
      }
    } catch (e) {
      probeResults[table] = { state: 'unknown', rows: null, error: e?.message };
    }
  }));

  const report = buildHealthReport({ rpcResult, probeResults, env, sport });
  report.durationMs = Date.now() - t0;

  // Structured log for operators
  if (report.ok) {
    console.log(`[health/picks-persistence] OK rootCause=${report.rootCause} source=${report.source} config=${report.activeConfig?.version}`);
  } else {
    console.error(
      `[health/picks-persistence] FAIL rootCause=${report.rootCause} reason="${report.reason}" missing=${report.missing.length}`
    );
  }

  return res.status(200).json(report);
}

export { REQUIRED_TABLES };
