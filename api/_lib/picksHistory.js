/**
 * picksHistory — persistence helpers for MLB (and future NBA) picks.
 *
 * All writes go through the service-role Supabase client.
 * All reads default to the same (public tables are read-open under RLS; using
 * the admin client avoids anon-key-required envs for server routines).
 *
 * These helpers are defensive: if Supabase isn't configured, they log and
 * return a structured `{ ok:false, reason }` (or null) rather than throw —
 * the /api/mlb/picks/built hot path must keep serving under any failure mode.
 *
 * NEW in this revision (hardened runtime):
 *   - Structured error codes so callers (and the health endpoint) can tell
 *     "missing tables" from "other failures" from "no supabase configured".
 *   - One-time loud error log on missing tables (every subsequent skip is quiet).
 *   - Zero-row write detection in writePicksRun.
 *   - Exposed classifyError() + MISSING_TABLE codes for tests.
 */

import { getSupabaseAdmin } from './supabaseAdmin.js';

// ── One-time missing-table warning guard ─────────────────────────────────────
// Tracks tables we've already warned about in this process so Vercel logs don't
// spam the same message every second.
const _warnedMissing = new Set();

function warnMissingOnce(table, err) {
  if (_warnedMissing.has(table)) return;
  _warnedMissing.add(table);
  console.error(
    `[picksHistory] ❌ persistence table "${table}" does NOT exist in Supabase — ` +
    `writes for this table will be dropped. Run docs/mlb-picks-persistence-deploy.sql. ` +
    `(error code=${err?.code || 'unknown'}, msg=${err?.message || 'unknown'})`
  );
}

function isMissingTableError(err) {
  if (!err) return false;
  return (
    err.code === '42P01' ||                         // undefined_table
    err.code === 'PGRST205' ||                      // schema cache
    /relation .* does not exist/i.test(err.message || '') ||
    /Could not find the table/i.test(err.message || '')
  );
}

export function classifyError(err) {
  if (!err) return { kind: 'ok' };
  if (isMissingTableError(err)) return { kind: 'missing_table', code: err.code, message: err.message };
  return { kind: 'db_error', code: err.code, message: err.message };
}

function safeAdmin() {
  try { return getSupabaseAdmin(); }
  catch (e) {
    // One loud log per process, not per call
    if (!_warnedMissing.has('__supabase__')) {
      _warnedMissing.add('__supabase__');
      console.warn('[picksHistory] Supabase admin unavailable — persistence disabled:', e?.message);
    }
    return null;
  }
}

function slateDateFromPayload(payload) {
  return payload?.date || new Date().toISOString().slice(0, 10);
}

/**
 * Required NOT-NULL / CHECK-constrained fields on public.picks.
 * If any is missing on a row, that row is preemptively rejected with a clear
 * reason instead of being sent to Postgres for a cryptic error.
 */
const REQUIRED_PICK_FIELDS = Object.freeze([
  'run_id', 'sport', 'slate_date', 'game_id', 'pick_key', 'tier',
  'market_type', 'selection_side', 'away_team_slug', 'home_team_slug',
  'bet_score', 'model_version', 'config_version',
]);

const VALID_TIER = new Set(['tier1', 'tier2', 'tier3']);
const VALID_MARKET = new Set(['moneyline', 'runline', 'total']);

/**
 * Map a single canonical v2 pick to a picks-table row and record any
 * validation problems. Returns { row, issues }.
 */
export function buildPickRow({ pick, runId, sport, slateDate, modelVersion, configVersion }) {
  const row = {
    run_id: runId,
    sport,
    slate_date: slateDate,
    game_id: pick?.gameId ?? null,
    pick_key: pick?.id ?? null,
    tier: pick?.tier ?? null,
    market_type: pick?.market?.type ?? null,
    selection_side: pick?.selection?.side ?? null,
    line_value: pick?.market?.line ?? null,
    price_american: pick?.market?.priceAmerican ?? null,
    away_team_slug: pick?.matchup?.awayTeam?.slug ?? null,
    home_team_slug: pick?.matchup?.homeTeam?.slug ?? null,
    start_time: pick?.matchup?.startTime ?? null,
    bet_score: pick?.betScore?.total ?? 0,
    bet_score_components: pick?.betScore?.components ?? {},
    model_prob: pick?.modelProb ?? null,
    implied_prob: pick?.impliedProb ?? null,
    raw_edge: pick?.rawEdge ?? null,
    data_quality: pick?.model?.dataQuality ?? null,
    signal_agreement: pick?.model?.signalAgreement ?? null,
    rationale: pick?.rationale ?? {},
    top_signals: pick?.pick?.topSignals ?? [],
    model_version: modelVersion,
    config_version: configVersion,
  };

  const issues = [];
  for (const k of REQUIRED_PICK_FIELDS) {
    if (row[k] === null || row[k] === undefined) issues.push(`missing ${k}`);
  }
  if (row.tier && !VALID_TIER.has(row.tier)) issues.push(`invalid tier ${row.tier}`);
  if (row.market_type && !VALID_MARKET.has(row.market_type)) issues.push(`invalid market_type ${row.market_type}`);

  return { row, issues };
}

/**
 * Persist a published picks run (picks_runs) and its child picks (picks).
 *
 * Returns a detailed summary so /api/mlb/picks/built can surface it:
 *
 *   {
 *     ok,                    // true iff runInserted && picksInserted === picksAttempted
 *     runInserted,           // did the parent row land?
 *     runId,                 // UUID of the persisted run (if inserted)
 *     picksAttempted,        // total child rows we tried to write
 *     picksInserted,         // child rows actually inserted
 *     picksFailed,           // rows that errored (pre-flight or DB)
 *     picksSkipped,          // rows rejected pre-flight for missing fields
 *     failures: [            // per-row failure detail (first 20)
 *       { index, pick_key, kind, code, message }
 *     ],
 *     reason,                // short top-level reason when ok===false
 *     detail,
 *   }
 */
export async function writePicksRun(payload) {
  const sb = safeAdmin();
  if (!sb) return {
    ok: false, runInserted: false, picksAttempted: 0, picksInserted: 0,
    picksFailed: 0, picksSkipped: 0, failures: [], reason: 'no_supabase',
  };
  if (!payload?.tiers) return {
    ok: false, runInserted: false, picksAttempted: 0, picksInserted: 0,
    picksFailed: 0, picksSkipped: 0, failures: [], reason: 'no_tiers_in_payload',
  };

  const sport = payload.sport || 'mlb';
  const slateDate = slateDateFromPayload(payload);
  const modelVersion = payload.modelVersion;
  const configVersion = payload.configVersion;
  const debug = !!payload?._persistDebug || process.env.PICKS_PERSIST_DEBUG === '1';

  // ── 1. Parent row ──────────────────────────────────────────────────────────
  let runId = null;
  try {
    const { data: run, error: runErr } = await sb
      .from('picks_runs')
      .insert({
        sport,
        slate_date: slateDate,
        generated_at: payload.generatedAt || new Date().toISOString(),
        model_version: modelVersion,
        config_version: configVersion,
        meta: payload.meta || {},
        payload,
      })
      .select('id')
      .single();

    if (runErr) {
      const cls = classifyError(runErr);
      if (cls.kind === 'missing_table') warnMissingOnce('picks_runs', runErr);
      else console.error('[picksHistory] picks_runs insert error:', runErr.code, runErr.message);
      return {
        ok: false, runInserted: false, picksAttempted: 0, picksInserted: 0,
        picksFailed: 0, picksSkipped: 0, failures: [],
        reason: cls.kind, detail: cls,
      };
    }
    runId = run.id;
  } catch (e) {
    console.error('[picksHistory] picks_runs insert threw:', e?.message);
    return {
      ok: false, runInserted: false, picksAttempted: 0, picksInserted: 0,
      picksFailed: 0, picksSkipped: 0, failures: [],
      reason: 'exception', detail: { message: e?.message },
    };
  }

  // ── 2. Collect published picks from every tier ─────────────────────────────
  const published = [
    ...(payload.tiers?.tier1 || []),
    ...(payload.tiers?.tier2 || []),
    ...(payload.tiers?.tier3 || []),
  ];

  if (published.length === 0) {
    console.log(`[picksHistory] persisted run=${runId} picks=0 (empty tiers)`);
    return {
      ok: true, runInserted: true, runId,
      picksAttempted: 0, picksInserted: 0, picksFailed: 0, picksSkipped: 0,
      failures: [],
    };
  }

  // ── 3. Pre-flight: map each pick to a row, collect validation issues ──────
  const rows = [];
  const skippedFailures = [];
  published.forEach((pick, idx) => {
    const { row, issues } = buildPickRow({
      pick, runId, sport, slateDate, modelVersion, configVersion,
    });
    if (issues.length > 0) {
      skippedFailures.push({
        index: idx,
        pick_key: row.pick_key || pick?.id || `idx:${idx}`,
        kind: 'preflight_invalid',
        message: issues.join('; '),
      });
    } else {
      rows.push(row);
    }
  });

  if (skippedFailures.length > 0) {
    console.error(
      `[picksHistory] ⚠ ${skippedFailures.length}/${published.length} picks rejected pre-flight; ` +
      `first issue: ${skippedFailures[0].message} (${skippedFailures[0].pick_key})`
    );
  }

  // Log the first row shape so production operators can see exactly what we send
  if (debug && rows.length > 0) {
    try {
      const preview = JSON.stringify(rows[0]).slice(0, 500);
      console.log(`[picksHistory] first-row preview run=${runId}: ${preview}`);
    } catch { /* ignore */ }
  }

  // ── 4. Primary path: batch INSERT with .select() to force response body ──
  //     We use INSERT (not UPSERT) because run_id is freshly generated above,
  //     so there cannot be a (run_id, pick_key) collision within a single call.
  //     Forcing .select('id') makes the count authoritative.
  let picksInserted = 0;
  const dbFailures = [];
  if (rows.length > 0) {
    try {
      const { data, error } = await sb
        .from('picks')
        .insert(rows)
        .select('id, pick_key');
      if (error) {
        const cls = classifyError(error);
        console.error(
          `[picksHistory] picks batch insert failed run=${runId} ` +
          `code=${error.code} message="${error.message}" — falling back to per-row insert`
        );
        if (cls.kind === 'missing_table') warnMissingOnce('picks', error);
        // Fall through to per-row fallback
        picksInserted = await perRowInsert(sb, rows, runId, dbFailures);
      } else {
        picksInserted = Array.isArray(data) ? data.length : 0;
        if (picksInserted !== rows.length) {
          console.error(
            `[picksHistory] ⚠ batch returned ${picksInserted}/${rows.length} rows — ` +
            `investigating with per-row fallback`
          );
          picksInserted = await perRowInsert(sb, rows, runId, dbFailures);
        }
      }
    } catch (e) {
      console.error('[picksHistory] picks insert threw:', e?.message);
      picksInserted = await perRowInsert(sb, rows, runId, dbFailures);
    }
  }

  const allFailures = [...skippedFailures, ...dbFailures];
  const picksFailed = allFailures.length;
  const picksAttempted = published.length;
  const ok = picksInserted === picksAttempted;

  const summary = {
    ok,
    runInserted: true,
    runId,
    picksAttempted,
    picksInserted,
    picksFailed,
    picksSkipped: skippedFailures.length,
    failures: allFailures.slice(0, 20),
    reason: ok ? undefined
      : picksInserted === 0 ? 'all_picks_failed'
      : 'partial_failure',
  };

  if (ok) {
    console.log(`[picksHistory] ✅ persisted run=${runId} picks=${picksInserted}/${picksAttempted}`);
  } else {
    console.error(
      `[picksHistory] ❌ fan-out failed run=${runId} ` +
      `inserted=${picksInserted}/${picksAttempted} failed=${picksFailed} ` +
      `first=${allFailures[0]?.message || 'unknown'}`
    );
  }

  return summary;
}

/**
 * Fallback when the batch insert fails or reports a row-count mismatch.
 * Inserts each row individually, recording per-row failures with full detail.
 * Returns the count of successfully inserted rows.
 */
async function perRowInsert(sb, rows, runId, failures) {
  let inserted = 0;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const { error } = await sb.from('picks').insert(row);
      if (error) {
        const cls = classifyError(error);
        failures.push({
          index: i,
          pick_key: row.pick_key,
          kind: cls.kind,
          code: error.code || null,
          message: error.message || 'unknown',
        });
        // Only log the first 3 per-row errors to avoid log spam
        if (failures.length <= 3) {
          console.error(
            `[picksHistory] per-row fail run=${runId} i=${i} pick=${row.pick_key} ` +
            `code=${error.code} msg="${error.message}"`
          );
        }
      } else {
        inserted += 1;
      }
    } catch (e) {
      failures.push({
        index: i,
        pick_key: row.pick_key,
        kind: 'exception',
        code: null,
        message: e?.message || 'unknown',
      });
    }
  }
  return inserted;
}

/**
 * Fetch the most recent picks_run for a sport+date, with all child picks.
 * Used by settlement and scorecard builders.
 */
/**
 * Fetch every persisted pick for a slate_date, regardless of run_id.
 *
 * Why this exists (production bug, 2026-04-22):
 *   Concurrent calls to /api/mlb/picks/built can create multiple picks_runs
 *   rows for the same slate. The child `picks` batch attaches to ONE run_id;
 *   the others end up with zero child rows. `getLatestRunForDate` picked the
 *   newest run by generated_at, which may have been the empty one — causing
 *   settle + build-scorecard to silently exit with 0 picks while 16 picks
 *   actually lived in the table.
 *
 * This helper bypasses runs entirely. It:
 *   1. Selects all picks with (sport, slate_date) match.
 *   2. Joins pick_results.
 *   3. Dedupes by pick_key, keeping the row with the highest bet_score so a
 *      re-run that produced an updated score wins.
 *
 * Returns: { picks: [...deduped], runIds: Set<uuid>, totalRaw: number,
 *            droppedDuplicates: number }
 */
export async function getPicksForSlate({ sport, slateDate }) {
  const sb = safeAdmin();
  if (!sb) return { picks: [], runIds: new Set(), totalRaw: 0, droppedDuplicates: 0 };
  try {
    const { data, error } = await sb
      .from('picks')
      .select('*, pick_results(*)')
      .eq('sport', sport)
      .eq('slate_date', slateDate);
    if (error) {
      if (isMissingTableError(error)) warnMissingOnce('picks', error);
      else console.warn('[picksHistory] getPicksForSlate read error:', error.message);
      return { picks: [], runIds: new Set(), totalRaw: 0, droppedDuplicates: 0 };
    }
    const rows = data || [];

    // Dedupe by pick_key — keep the highest bet_score
    const bestByKey = new Map();
    const runIds = new Set();
    for (const p of rows) {
      if (p.run_id) runIds.add(p.run_id);
      const existing = bestByKey.get(p.pick_key);
      const score = Number(p.bet_score ?? 0);
      if (!existing || score > Number(existing.bet_score ?? 0)) {
        bestByKey.set(p.pick_key, p);
      }
    }
    const picks = Array.from(bestByKey.values());
    return {
      picks,
      runIds,
      totalRaw: rows.length,
      droppedDuplicates: rows.length - picks.length,
    };
  } catch (e) {
    console.warn('[picksHistory] getPicksForSlate failed:', e?.message);
    return { picks: [], runIds: new Set(), totalRaw: 0, droppedDuplicates: 0 };
  }
}

export async function getLatestRunForDate({ sport, slateDate }) {
  const sb = safeAdmin();
  if (!sb) return null;
  try {
    const { data: runs, error: runErr } = await sb
      .from('picks_runs')
      .select('id, sport, slate_date, generated_at, model_version, config_version, payload, meta')
      .eq('sport', sport)
      .eq('slate_date', slateDate)
      .order('generated_at', { ascending: false })
      .limit(1);
    if (runErr) {
      if (isMissingTableError(runErr)) warnMissingOnce('picks_runs', runErr);
      else console.warn('[picksHistory] picks_runs read error:', runErr.message);
      return null;
    }
    if (!runs?.length) return null;
    const run = runs[0];

    const { data: picks, error: pickErr } = await sb
      .from('picks')
      .select('*, pick_results(*)')
      .eq('run_id', run.id);
    if (pickErr) {
      if (isMissingTableError(pickErr)) warnMissingOnce('picks', pickErr);
      else console.warn('[picksHistory] picks read error:', pickErr.message);
      return { run, picks: [] };
    }
    return { run, picks: picks || [] };
  } catch (e) {
    console.warn('[picksHistory] getLatestRunForDate failed:', e?.message);
    return null;
  }
}

/** Upsert settlement results. */
export async function upsertPickResults(results) {
  const sb = safeAdmin();
  if (!sb || !results?.length) return { count: 0, ok: !!sb };
  try {
    const { error, count } = await sb
      .from('pick_results')
      .upsert(results, { onConflict: 'pick_id', count: 'exact' });
    if (error) {
      const cls = classifyError(error);
      if (cls.kind === 'missing_table') warnMissingOnce('pick_results', error);
      else console.warn('[picksHistory] upsert pick_results error:', error.message);
      return { count: 0, ok: false, error: cls };
    }
    return { count: typeof count === 'number' ? count : results.length, ok: true };
  } catch (e) {
    console.warn('[picksHistory] upsertPickResults failed:', e?.message);
    return { count: 0, ok: false, error: { kind: 'exception', message: e?.message } };
  }
}

/** Upsert a scorecard row. */
export async function upsertScorecard(row) {
  const sb = safeAdmin();
  if (!sb) return null;
  try {
    const { data, error } = await sb
      .from('picks_daily_scorecards')
      .upsert(row, { onConflict: 'sport,slate_date' })
      .select()
      .single();
    if (error) {
      if (isMissingTableError(error)) warnMissingOnce('picks_daily_scorecards', error);
      else console.warn('[picksHistory] upsertScorecard error:', error.message);
      return null;
    }
    return data;
  } catch (e) {
    console.warn('[picksHistory] upsertScorecard failed:', e?.message);
    return null;
  }
}

/** Fetch scorecard for a slate (service role). Returns null if missing. */
export async function getScorecard({ sport, slateDate }) {
  const sb = safeAdmin();
  if (!sb) return null;
  try {
    const { data, error } = await sb
      .from('picks_daily_scorecards')
      .select('*')
      .eq('sport', sport)
      .eq('slate_date', slateDate)
      .maybeSingle();
    if (error) {
      if (isMissingTableError(error)) warnMissingOnce('picks_daily_scorecards', error);
      return null;
    }
    return data || null;
  } catch { return null; }
}

/**
 * Fetch the most recent scorecard row that has actual graded data.
 * "Graded" means at least one pick resolved as won, lost, or push for that
 * slate — empty placeholder rows ("No picks persisted for this date") are
 * skipped so the UI doesn't show a dead "yesterday was blank" state when an
 * earlier slate did produce real results.
 *
 * Returns the same shape as getScorecard, or null when no graded slate exists
 * within the lookback window.
 */
export async function getLatestGradedScorecard({ sport, lookbackDays = 14 } = {}) {
  const sb = safeAdmin();
  if (!sb) return null;
  try {
    // Compute lookback cutoff (ET-naive YYYY-MM-DD; the column is a date type).
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - lookbackDays);
    const cutoffYmd = cutoff.toISOString().slice(0, 10);

    const { data, error } = await sb
      .from('picks_daily_scorecards')
      .select('*')
      .eq('sport', sport)
      .gte('slate_date', cutoffYmd)
      .order('slate_date', { ascending: false })
      .limit(lookbackDays);
    if (error) {
      if (isMissingTableError(error)) warnMissingOnce('picks_daily_scorecards', error);
      return null;
    }
    if (!Array.isArray(data) || data.length === 0) return null;

    // Walk most-recent first; pick the first row with real graded data.
    for (const row of data) {
      const r = row?.record || {};
      const graded = (r.won ?? 0) + (r.lost ?? 0) + (r.push ?? 0);
      if (graded > 0) return row;
    }
    return null;
  } catch { return null; }
}

/**
 * Find the most recent slate that has actually graded picks (at least one
 * pick_results row with status in 'won'|'lost'|'push'). This is stronger
 * than reading picks_daily_scorecards because it doesn't depend on the
 * scorecard cron having run — it inspects the source of truth.
 *
 * Returns:
 *   {
 *     latestGradedSlate: 'YYYY-MM-DD' | null,
 *     skippedPendingOnlySlates: string[],   // slate_dates with picks but 0 graded
 *     scannedSlates: string[],              // ordered most-recent first
 *   }
 */
export async function findLatestGradedSlate({ sport, lookbackDays = 21 } = {}) {
  const sb = safeAdmin();
  if (!sb) return { latestGradedSlate: null, skippedPendingOnlySlates: [], scannedSlates: [] };
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - lookbackDays);
    const cutoffYmd = cutoff.toISOString().slice(0, 10);

    // Pull all picks within window with pick_results joined.
    const { data, error } = await sb
      .from('picks')
      .select('slate_date, pick_results(status)')
      .eq('sport', sport)
      .gte('slate_date', cutoffYmd)
      .order('slate_date', { ascending: false });
    if (error) {
      if (isMissingTableError(error)) warnMissingOnce('picks', error);
      return { latestGradedSlate: null, skippedPendingOnlySlates: [], scannedSlates: [] };
    }
    const rows = data || [];

    // Bucket by slate_date — tally graded vs total.
    const buckets = new Map(); // slate -> { graded, total }
    for (const row of rows) {
      const slate = row.slate_date;
      if (!slate) continue;
      const b = buckets.get(slate) || { graded: 0, total: 0 };
      b.total += 1;
      // pick_results joins via primary key, so PostgREST may return it as
      // either an object or an array. Handle both shapes.
      const rawResult = row.pick_results;
      const resultRow = Array.isArray(rawResult) ? rawResult[0] : rawResult;
      const status = resultRow?.status;
      if (status === 'won' || status === 'lost' || status === 'push') b.graded += 1;
      buckets.set(slate, b);
    }

    // Walk most-recent → oldest, return first with graded > 0.
    const slatesDesc = [...buckets.keys()].sort((a, b) => (a < b ? 1 : -1));
    const skipped = [];
    let latest = null;
    for (const slate of slatesDesc) {
      const { graded } = buckets.get(slate);
      if (graded > 0) { latest = slate; break; }
      skipped.push(slate);
    }
    return {
      latestGradedSlate: latest,
      skippedPendingOnlySlates: skipped,
      scannedSlates: slatesDesc,
    };
  } catch (e) {
    return { latestGradedSlate: null, skippedPendingOnlySlates: [], scannedSlates: [] };
  }
}

/** Fetch the active tuning config for a sport. Falls back to default on error. */
export async function getActiveConfig({ sport }) {
  const sb = safeAdmin();
  if (!sb) return null;
  try {
    const { data, error } = await sb
      .from('picks_config')
      .select('version, sport, is_active, is_shadow, config')
      .eq('sport', sport)
      .eq('is_active', true)
      .maybeSingle();
    if (error) {
      if (isMissingTableError(error)) warnMissingOnce('picks_config', error);
      return null;
    }
    if (!data) {
      if (!_warnedMissing.has('__no_active_config__')) {
        _warnedMissing.add('__no_active_config__');
        console.warn(`[picksHistory] ⚠ no active picks_config row for sport=${sport} — using default config`);
      }
      return null;
    }
    return { version: data.version, ...data.config };
  } catch { return null; }
}

/** Insert a tuning-log record. */
export async function logTuning(row) {
  const sb = safeAdmin();
  if (!sb) return null;
  try {
    const { data, error } = await sb.from('picks_tuning_log').insert(row).select().single();
    if (error) {
      if (isMissingTableError(error)) warnMissingOnce('picks_tuning_log', error);
      else console.warn('[picksHistory] logTuning error:', error.message);
      return null;
    }
    return data;
  } catch { return null; }
}

/** Insert an audit artifact. */
export async function writeAuditArtifact(row) {
  const sb = safeAdmin();
  if (!sb) return null;
  try {
    const { data, error } = await sb
      .from('picks_audit_artifacts')
      .upsert(row, { onConflict: 'sport,slate_date' })
      .select()
      .single();
    if (error) {
      if (isMissingTableError(error)) warnMissingOnce('picks_audit_artifacts', error);
      else console.warn('[picksHistory] writeAuditArtifact error:', error.message);
      return null;
    }
    return data;
  } catch { return null; }
}

// Internal: allow tests to reset the warn-once cache between cases
export function __resetWarningsForTests() {
  _warnedMissing.clear();
}
