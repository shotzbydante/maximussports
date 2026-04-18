/**
 * persistenceHealth — pure logic for the picks-persistence health check.
 *
 * No Supabase imports here. Caller injects two probe functions:
 *   - rpcInventory()   → resolves the authoritative RPC answer (or throws)
 *   - tableProbe(name) → advisory per-table probe returning
 *                         { state: 'present'|'missing'|'unknown', rows, raw }
 *
 * This split keeps the truth-table pure and unit-testable.
 */

export const REQUIRED_TABLES = [
  'picks_runs',
  'picks',
  'pick_results',
  'picks_daily_scorecards',
  'picks_config',
  'picks_tuning_log',
  'picks_audit_artifacts',
];

/**
 * Classify an RPC error.
 * `undefined_function` (42883) / PGRST202 = the RPC itself doesn't exist =
 * migration has not been applied.
 */
export function classifyRpcError(err) {
  if (!err) return { kind: 'ok' };
  const msg = String(err.message || '');
  if (err.code === '42883' || err.code === 'PGRST202' ||
      /function .* does not exist/i.test(msg) ||
      /Could not find the function/i.test(msg)) {
    return { kind: 'migration_not_run', code: err.code, message: msg };
  }
  // Missing auth / URL misconfiguration
  if (/JWT/i.test(msg) || /Invalid API key/i.test(msg) || /not authorized/i.test(msg)) {
    return { kind: 'auth_error', code: err.code, message: msg };
  }
  return { kind: 'rpc_error', code: err.code, message: msg };
}

export function classifyProbeError(err) {
  if (!err) return { kind: 'ok' };
  const msg = String(err.message || '');
  if (err.code === '42P01' || err.code === 'PGRST205' ||
      /relation .* does not exist/i.test(msg) ||
      /Could not find the table/i.test(msg)) {
    return { kind: 'missing_table', code: err.code, message: msg };
  }
  return { kind: 'probe_error', code: err.code, message: msg };
}

/**
 * Build a structured health report from probe observations.
 *
 * @param {object} args
 * @param {{ok:boolean, kind?:string, data?:object, error?:object}} args.rpcResult
 *        - ok:true with data      → authoritative
 *        - ok:false, kind:'migration_not_run'|'auth_error'|'rpc_error'
 * @param {{[table:string]: {state:'present'|'missing'|'unknown', rows?:number, raw?:object}}} args.probeResults
 * @param {object} args.env          - { hasUrl, hasServiceRoleKey, urlHost }
 * @param {string} args.sport
 */
export function buildHealthReport({ rpcResult, probeResults, env, sport }) {
  const warnings = [];
  const disagreements = [];
  const now = new Date().toISOString();

  // ── Env first — if service-role key is missing, nothing works ──
  if (!env.hasUrl || !env.hasServiceRoleKey) {
    return {
      ok: false,
      rootCause: 'env_missing',
      reason: 'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set on this deployment',
      source: 'none',
      sport,
      schema: {},
      missing: REQUIRED_TABLES,
      activeConfig: null,
      warnings: ['env vars missing'],
      probeCrosscheck: { disagreements: [] },
      env,
      generatedAt: now,
    };
  }

  // ── Auth error dominates — fix envs before anything else ──
  if (rpcResult.kind === 'auth_error') {
    return {
      ok: false,
      rootCause: 'auth_error',
      reason: rpcResult.error?.message || 'Service role cannot authenticate',
      source: 'none',
      sport,
      schema: {},
      missing: REQUIRED_TABLES,
      activeConfig: null,
      warnings: [rpcResult.error?.message || 'auth error'],
      probeCrosscheck: { disagreements: [] },
      env,
      generatedAt: now,
    };
  }

  // ── RPC-present path: this is the authoritative answer ──
  if (rpcResult.ok && rpcResult.data) {
    const inventory = rpcResult.data;
    const presentList = Array.isArray(inventory.tables_in_public)
      ? inventory.tables_in_public
      : [];
    const presentSet = new Set(presentList);
    const rows = inventory.rows || {};
    const active = inventory.active_config || null;

    const schema = {};
    const missing = [];
    for (const t of REQUIRED_TABLES) {
      const present = presentSet.has(t);
      if (!present) missing.push(t);
      schema[t] = {
        state: present ? 'present' : 'missing',
        rows: typeof rows[t] === 'number' ? rows[t]
             : rows[t] != null ? Number(rows[t])
             : null,
      };
      // Cross-check against advisory probe
      const probe = probeResults?.[t];
      if (probe) {
        const probeSaysPresent = probe.state === 'present';
        if (probeSaysPresent !== present) {
          disagreements.push({
            table: t,
            rpcSays: present ? 'present' : 'missing',
            probeSays: probe.state,
          });
        }
      }
    }

    let rootCause = 'none';
    let ok = true;
    if (missing.length > 0) { rootCause = 'tables_missing'; ok = false; }
    else if (!active)       { rootCause = 'no_active_config'; ok = false; warnings.push(`no active picks_config for sport=${sport}`); }
    if (disagreements.length > 0) {
      warnings.push(`RPC/probe disagreement on ${disagreements.length} table(s) — likely schema-cache desync`);
      if (ok) { rootCause = 'cache_desync'; ok = false; }
    }

    return {
      ok,
      rootCause,
      reason: ok ? 'all checks green' : describeRootCause(rootCause, missing, disagreements),
      source: 'rpc',
      sport,
      schema,
      missing,
      activeConfig: active,
      warnings,
      probeCrosscheck: { disagreements },
      inventory,
      env,
      generatedAt: now,
    };
  }

  // ── RPC absent: migration hasn't run. Probes become advisory. ──
  if (rpcResult.kind === 'migration_not_run') {
    const schema = {};
    const missing = [];
    for (const t of REQUIRED_TABLES) {
      const probe = probeResults?.[t];
      const state = probe?.state || 'unknown';
      if (state !== 'present') missing.push(t);
      schema[t] = { state, rows: probe?.rows ?? null };
    }
    return {
      ok: false,
      rootCause: 'migration_not_run',
      reason: 'public.picks_persistence_inventory() does not exist — the migration has not been applied to this database',
      source: 'probe',
      sport,
      schema,
      missing,
      activeConfig: null,
      warnings: ['authoritative RPC missing; probe answers are advisory only'],
      probeCrosscheck: { disagreements: [] },
      env,
      generatedAt: now,
    };
  }

  // ── Everything else: unknown RPC error + probes as advisory ──
  const schema = {};
  const missing = [];
  for (const t of REQUIRED_TABLES) {
    const probe = probeResults?.[t];
    const state = probe?.state || 'unknown';
    if (state !== 'present') missing.push(t);
    schema[t] = { state, rows: probe?.rows ?? null };
  }
  return {
    ok: false,
    rootCause: 'rpc_error',
    reason: rpcResult.error?.message || 'RPC probe failed',
    source: 'probe',
    sport,
    schema,
    missing,
    activeConfig: null,
    warnings: [rpcResult.error?.message || 'rpc error'],
    probeCrosscheck: { disagreements: [] },
    env,
    generatedAt: now,
  };
}

function describeRootCause(cause, missing, disagreements) {
  switch (cause) {
    case 'tables_missing':
      return `${missing.length} table(s) absent in public: ${missing.join(', ')}`;
    case 'no_active_config':
      return 'no row in picks_config where is_active=true';
    case 'cache_desync':
      return `PostgREST schema cache disagrees with information_schema on: ${disagreements.map(d => d.table).join(', ')}`;
    default:
      return cause;
  }
}
