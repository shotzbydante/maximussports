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
 * Persist a published picks run (picks_runs) and its child picks (picks).
 * Best-effort: returns a structured result. Never throws.
 *
 * @param {object} payload — canonical v2 payload from buildMlbPicksV2
 * @returns {Promise<{ ok:boolean, runId?:string, picksWritten?:number, reason?:string, detail?:object }>}
 */
export async function writePicksRun(payload) {
  const sb = safeAdmin();
  if (!sb) return { ok: false, reason: 'no_supabase' };
  if (!payload?.tiers) return { ok: false, reason: 'no_tiers_in_payload' };

  const sport = payload.sport || 'mlb';
  const slateDate = slateDateFromPayload(payload);

  try {
    const { data: run, error: runErr } = await sb
      .from('picks_runs')
      .insert({
        sport,
        slate_date: slateDate,
        generated_at: payload.generatedAt || new Date().toISOString(),
        model_version: payload.modelVersion,
        config_version: payload.configVersion,
        meta: payload.meta || {},
        payload,
      })
      .select('id')
      .single();

    if (runErr) {
      const cls = classifyError(runErr);
      if (cls.kind === 'missing_table') warnMissingOnce('picks_runs', runErr);
      else console.warn('[picksHistory] picks_runs insert error:', runErr.message);
      return { ok: false, reason: cls.kind, detail: cls };
    }

    const runId = run.id;

    const published = [
      ...(payload.tiers?.tier1 || []),
      ...(payload.tiers?.tier2 || []),
      ...(payload.tiers?.tier3 || []),
    ];

    let picksWritten = 0;
    if (published.length > 0) {
      const rows = published.map(p => ({
        run_id: runId,
        sport,
        slate_date: slateDate,
        game_id: p.gameId,
        pick_key: p.id,
        tier: p.tier,
        market_type: p.market?.type,
        selection_side: p.selection?.side,
        line_value: p.market?.line ?? null,
        price_american: p.market?.priceAmerican ?? null,
        away_team_slug: p.matchup?.awayTeam?.slug,
        home_team_slug: p.matchup?.homeTeam?.slug,
        start_time: p.matchup?.startTime,
        bet_score: p.betScore?.total ?? 0,
        bet_score_components: p.betScore?.components ?? {},
        model_prob: p.modelProb ?? null,
        implied_prob: p.impliedProb ?? null,
        raw_edge: p.rawEdge ?? null,
        data_quality: p.model?.dataQuality ?? null,
        signal_agreement: p.model?.signalAgreement ?? null,
        rationale: p.rationale ?? {},
        top_signals: p.pick?.topSignals ?? [],
        model_version: payload.modelVersion,
        config_version: payload.configVersion,
      }));

      const { error: picksErr, count } = await sb
        .from('picks')
        .upsert(rows, { onConflict: 'run_id,pick_key', ignoreDuplicates: true, count: 'exact' });

      if (picksErr) {
        const cls = classifyError(picksErr);
        if (cls.kind === 'missing_table') warnMissingOnce('picks', picksErr);
        else console.warn('[picksHistory] picks upsert error:', picksErr.message);
        // runs row DID land — return partial-success so operators see it.
        return { ok: false, reason: cls.kind, runId, picksWritten: 0, detail: cls };
      }
      picksWritten = typeof count === 'number' ? count : rows.length;
    }

    const msg = `[picksHistory] persisted run=${runId} picks=${picksWritten}`;
    if (picksWritten === 0 && published.length > 0) {
      console.warn(`${msg} ⚠ all picks were duplicates or ignored (upsert count=0)`);
    } else {
      console.log(msg);
    }
    return { ok: true, runId, picksWritten };
  } catch (e) {
    console.warn('[picksHistory] writePicksRun failed:', e?.message);
    return { ok: false, reason: 'exception', detail: { message: e?.message } };
  }
}

/**
 * Fetch the most recent picks_run for a sport+date, with all child picks.
 * Used by settlement and scorecard builders.
 */
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
