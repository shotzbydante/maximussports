/**
 * Tests for persistenceHealth — the pure logic behind
 * /api/health/picks-persistence.
 *
 * Every test pins one failure mode so regressions in the old
 * "error-code-inference" anti-pattern can't sneak back in.
 */

import { describe, it, expect } from 'vitest';
import {
  REQUIRED_TABLES,
  classifyRpcError,
  classifyProbeError,
  buildHealthReport,
} from './persistenceHealth.js';

const OK_ENV = { hasUrl: true, hasServiceRoleKey: true, urlHost: 'x.supabase.co' };

function allPresentProbes(overrides = {}) {
  const p = {};
  for (const t of REQUIRED_TABLES) p[t] = { state: 'present', rows: 0 };
  return { ...p, ...overrides };
}

function fullInventory(overrides = {}) {
  return {
    schema_version: 'v2.0.0',
    tables_in_public: REQUIRED_TABLES.slice(),
    active_config: { version: 'mlb-picks-tuning-2026-04-17a', sport: 'mlb' },
    rows: Object.fromEntries(REQUIRED_TABLES.map(t => [t, 0])),
    ...overrides,
  };
}

describe('classifyRpcError', () => {
  it('maps undefined_function code to migration_not_run', () => {
    expect(classifyRpcError({ code: '42883', message: 'function does not exist' }).kind).toBe('migration_not_run');
  });
  it('maps PGRST202 to migration_not_run', () => {
    expect(classifyRpcError({ code: 'PGRST202', message: "Could not find the function" }).kind).toBe('migration_not_run');
  });
  it('maps JWT message to auth_error', () => {
    expect(classifyRpcError({ code: '', message: 'JWT expired' }).kind).toBe('auth_error');
  });
  it('maps other errors to rpc_error', () => {
    expect(classifyRpcError({ code: '42P01', message: 'relation does not exist' }).kind).toBe('rpc_error');
  });
  it('null → ok', () => {
    expect(classifyRpcError(null).kind).toBe('ok');
  });
});

describe('classifyProbeError', () => {
  it('42P01 → missing_table', () => {
    expect(classifyProbeError({ code: '42P01', message: 'relation does not exist' }).kind).toBe('missing_table');
  });
  it('PGRST205 → missing_table', () => {
    expect(classifyProbeError({ code: 'PGRST205', message: 'Could not find the table' }).kind).toBe('missing_table');
  });
  it('other → probe_error', () => {
    expect(classifyProbeError({ code: '23505', message: 'unique violation' }).kind).toBe('probe_error');
  });
});

describe('buildHealthReport', () => {
  it('env_missing dominates every other signal', () => {
    const r = buildHealthReport({
      rpcResult: { ok: true, data: fullInventory() },
      probeResults: allPresentProbes(),
      env: { hasUrl: false, hasServiceRoleKey: false },
      sport: 'mlb',
    });
    expect(r.ok).toBe(false);
    expect(r.rootCause).toBe('env_missing');
    expect(r.source).toBe('none');
  });

  it('auth_error dominates table presence', () => {
    const r = buildHealthReport({
      rpcResult: { ok: false, kind: 'auth_error', error: { message: 'Invalid API key' } },
      probeResults: allPresentProbes(),
      env: OK_ENV,
      sport: 'mlb',
    });
    expect(r.ok).toBe(false);
    expect(r.rootCause).toBe('auth_error');
  });

  it('RPC-missing → rootCause migration_not_run, source=probe, ok=false', () => {
    const r = buildHealthReport({
      rpcResult: { ok: false, kind: 'migration_not_run' },
      probeResults: {},
      env: OK_ENV,
      sport: 'mlb',
    });
    expect(r.ok).toBe(false);
    expect(r.rootCause).toBe('migration_not_run');
    expect(r.source).toBe('probe');
    expect(r.missing.sort()).toEqual([...REQUIRED_TABLES].sort());
  });

  it('RPC-present, all tables + config present → ok=true, source=rpc', () => {
    const r = buildHealthReport({
      rpcResult: { ok: true, data: fullInventory() },
      probeResults: allPresentProbes(),
      env: OK_ENV,
      sport: 'mlb',
    });
    expect(r.ok).toBe(true);
    expect(r.source).toBe('rpc');
    expect(r.rootCause).toBe('none');
    expect(r.missing).toEqual([]);
    expect(r.activeConfig?.version).toBe('mlb-picks-tuning-2026-04-17a');
  });

  it('RPC says all present, probe says picks_runs missing → cache_desync', () => {
    const r = buildHealthReport({
      rpcResult: { ok: true, data: fullInventory() },
      probeResults: allPresentProbes({ picks_runs: { state: 'missing', rows: null } }),
      env: OK_ENV,
      sport: 'mlb',
    });
    expect(r.ok).toBe(false);
    expect(r.rootCause).toBe('cache_desync');
    expect(r.probeCrosscheck.disagreements).toHaveLength(1);
    expect(r.probeCrosscheck.disagreements[0].table).toBe('picks_runs');
  });

  it('RPC missing a table → tables_missing overrides ok', () => {
    const inv = fullInventory({
      tables_in_public: REQUIRED_TABLES.filter(t => t !== 'picks_daily_scorecards'),
    });
    const r = buildHealthReport({
      rpcResult: { ok: true, data: inv },
      probeResults: allPresentProbes({ picks_daily_scorecards: { state: 'missing', rows: null } }),
      env: OK_ENV,
      sport: 'mlb',
    });
    expect(r.ok).toBe(false);
    expect(r.rootCause).toBe('tables_missing');
    expect(r.missing).toEqual(['picks_daily_scorecards']);
  });

  it('RPC present, no active_config → no_active_config', () => {
    const inv = fullInventory({ active_config: null });
    const r = buildHealthReport({
      rpcResult: { ok: true, data: inv },
      probeResults: allPresentProbes(),
      env: OK_ENV,
      sport: 'mlb',
    });
    expect(r.ok).toBe(false);
    expect(r.rootCause).toBe('no_active_config');
  });

  it('never reports ok=true with source=probe', () => {
    // Even if probes happen to all say present, if the RPC is missing the
    // answer is advisory and top-level ok must be false.
    const r = buildHealthReport({
      rpcResult: { ok: false, kind: 'migration_not_run' },
      probeResults: allPresentProbes(),
      env: OK_ENV,
      sport: 'mlb',
    });
    expect(r.ok).toBe(false);
    expect(r.source).toBe('probe');
  });

  it('top-level missing list cannot disagree with per-table state (rpc path)', () => {
    const inv = fullInventory({ tables_in_public: ['picks_runs', 'picks'] });
    const r = buildHealthReport({
      rpcResult: { ok: true, data: inv },
      probeResults: allPresentProbes(),
      env: OK_ENV,
      sport: 'mlb',
    });
    // missing must equal the set of tables whose schema[t].state !== 'present'
    const missingFromSchema = Object.entries(r.schema)
      .filter(([, v]) => v.state !== 'present')
      .map(([k]) => k)
      .sort();
    expect(r.missing.slice().sort()).toEqual(missingFromSchema);
  });
});
