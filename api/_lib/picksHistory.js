/**
 * picksHistory — persistence helpers for MLB (and future NBA) picks.
 *
 * All writes go through the service-role Supabase client.
 * All reads default to anon client (public tables under RLS).
 *
 * These functions are defensive: if Supabase isn't configured, they log and
 * return null/false rather than throw — the picks hot path must keep working.
 */

import { getSupabaseAdmin } from './supabaseAdmin.js';

function safeAdmin() {
  try { return getSupabaseAdmin(); } catch (e) {
    console.warn('[picksHistory] Supabase admin unavailable:', e?.message);
    return null;
  }
}

function slateDateFromPayload(payload) {
  return payload?.date || new Date().toISOString().slice(0, 10);
}

/**
 * Persist a published picks run (picks_runs) and its child picks (picks).
 * Best-effort: returns { runId } on success or null on failure.
 *
 * @param {object} payload — canonical v2 payload from buildMlbPicksV2
 * @returns {Promise<{runId: string}|null>}
 */
export async function writePicksRun(payload) {
  const sb = safeAdmin();
  if (!sb) return null;
  if (!payload?.tiers) return null;
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
      console.warn('[picksHistory] picks_runs insert error:', runErr.message);
      return null;
    }
    const runId = run.id;

    const published = [
      ...(payload.tiers?.tier1 || []),
      ...(payload.tiers?.tier2 || []),
      ...(payload.tiers?.tier3 || []),
    ];

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

      const { error: picksErr } = await sb
        .from('picks')
        .upsert(rows, { onConflict: 'run_id,pick_key', ignoreDuplicates: true });
      if (picksErr) console.warn('[picksHistory] picks insert error:', picksErr.message);
    }

    return { runId };
  } catch (e) {
    console.warn('[picksHistory] writePicksRun failed:', e?.message);
    return null;
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
    if (runErr || !runs?.length) return null;
    const run = runs[0];

    const { data: picks, error: pickErr } = await sb
      .from('picks')
      .select('*, pick_results(*)')
      .eq('run_id', run.id);
    if (pickErr) return { run, picks: [] };
    return { run, picks: picks || [] };
  } catch (e) {
    console.warn('[picksHistory] getLatestRunForDate failed:', e?.message);
    return null;
  }
}

/** Upsert settlement results. */
export async function upsertPickResults(results) {
  const sb = safeAdmin();
  if (!sb || !results?.length) return { count: 0 };
  try {
    const { error } = await sb.from('pick_results').upsert(results, { onConflict: 'pick_id' });
    if (error) {
      console.warn('[picksHistory] upsert pick_results error:', error.message);
      return { count: 0, error: error.message };
    }
    return { count: results.length };
  } catch (e) {
    console.warn('[picksHistory] upsertPickResults failed:', e?.message);
    return { count: 0, error: e?.message };
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
    if (error) { console.warn('[picksHistory] upsertScorecard error:', error.message); return null; }
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
    if (error) return null;
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
    if (error || !data) return null;
    return { version: data.version, ...data.config };
  } catch { return null; }
}

/** Insert a tuning-log record. */
export async function logTuning(row) {
  const sb = safeAdmin();
  if (!sb) return null;
  try {
    const { data, error } = await sb.from('picks_tuning_log').insert(row).select().single();
    if (error) { console.warn('[picksHistory] logTuning error:', error.message); return null; }
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
    if (error) { console.warn('[picksHistory] writeAuditArtifact error:', error.message); return null; }
    return data;
  } catch { return null; }
}
