/**
 * NFL picks storage: the read path for grading and scorecards, pick
 * locking, and closing-line snapshots.
 *
 * One pick per game per market counts toward the record:
 *   1. a locked recommended pick, if there is one (the first one locked)
 *   2. otherwise the locked tracking pick (the model lean, locked a day out)
 *   3. otherwise, for rows written before locking existed, the latest row
 *
 * Locks are enforced by two partial unique indexes (see
 * docs/nfl-picks-v2-migration.sql), so two serverless instances building
 * the board at the same moment cannot both lock the same market.
 */

import { getSupabaseAdmin } from './supabaseAdmin.js';
import { buildPickRow } from './picksHistory.js';
import { etDayFromISO } from './dateWindows.js';

const UNIQUE_VIOLATION = '23505';
const isMissingColumn = (e) => e?.code === '42703' || e?.code === 'PGRST204' || /column .* does not exist|Could not find the '.*' column/i.test(e?.message || '');
const isMissingTable = (e) => e?.code === '42P01' || e?.code === 'PGRST205' || /relation .* does not exist|Could not find the table/i.test(e?.message || '');
let warnedMigration = false;
function warnMigration(what) {
  if (warnedMigration) return;
  warnedMigration = true;
  console.error(`[nflPicksStore] ${what}. Run docs/nfl-picks-v2-migration.sql in Supabase. Picks are shown but not locked until then.`);
}

/** Legacy helper: the most recent row per (slate_date, game_id, market_type). */
export function dedupeLatestPerMarket(rows = []) {
  const latest = new Map();
  for (const p of rows) {
    if (!p) continue;
    const key = `${p.slate_date}|${p.game_id}|${p.market_type}`;
    const prev = latest.get(key);
    if (!prev || String(p.created_at || '') >= String(prev.created_at || '')) latest.set(key, p);
  }
  return [...latest.values()];
}

/** The one row per game and market that counts. See the rules at the top of this file. */
export function resolvePicks(rows = []) {
  const groups = new Map();
  for (const p of rows) {
    if (!p) continue;
    const key = `${p.game_id}|${p.market_type}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }
  const out = [];
  for (const list of groups.values()) {
    const heroLocks = list.filter((p) => p.locked_at && p.tier !== 'tracking')
      .sort((a, b) => String(a.locked_at).localeCompare(String(b.locked_at)));
    const trackLocks = list.filter((p) => p.locked_at && p.tier === 'tracking')
      .sort((a, b) => String(a.locked_at).localeCompare(String(b.locked_at)));
    if (heroLocks.length) out.push(heroLocks[0]);
    else if (trackLocks.length) out.push(trackLocks[0]);
    else out.push(list.reduce((best, p) => (String(p.created_at || '') >= String(best.created_at || '') ? p : best)));
  }
  return out;
}

/**
 * @param {object} args
 * @param {string} args.from — 'YYYY-MM-DD' inclusive
 * @param {string} [args.to] — 'YYYY-MM-DD' inclusive (defaults to `from`)
 * @returns {Promise<{ picks: Array, totalRaw: number, droppedDuplicates: number, ok: boolean, error?: string }>}
 */
export async function getNflPicks({ from, to = from }) {
  let sb;
  try { sb = getSupabaseAdmin(); }
  catch (e) { return { picks: [], totalRaw: 0, droppedDuplicates: 0, ok: false, error: e?.message || 'supabase_unavailable' }; }

  try {
    const rows = [];
    for (let page = 0; page < 20; page++) {
      const { data, error } = await sb
        .from('picks')
        .select('*, pick_results(*)')
        .eq('sport', 'nfl')
        .gte('slate_date', from)
        .lte('slate_date', to)
        .order('created_at', { ascending: true })
        .range(page * 1000, page * 1000 + 999);
      if (error) return { picks: [], totalRaw: 0, droppedDuplicates: 0, ok: false, error: error.message };
      rows.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    const picks = resolvePicks(rows);
    return { picks, totalRaw: rows.length, droppedDuplicates: rows.length - picks.length, ok: true };
  } catch (e) {
    return { picks: [], totalRaw: 0, droppedDuplicates: 0, ok: false, error: e?.message || 'exception' };
  }
}

/** Locked rows for a set of games. Returns [] when storage or the migration is missing. */
export async function getLockedPicks(gameIds = []) {
  const ids = [...new Set(gameIds.map(String))];
  if (ids.length === 0) return { rows: [], ok: true };
  let sb;
  try { sb = getSupabaseAdmin(); } catch { return { rows: [], ok: false, reason: 'no_supabase' }; }
  try {
    const { data, error } = await sb
      .from('picks')
      .select('id, game_id, market_type, selection_side, line_value, price_american, tier, book, locked_at, expected_value, bet_score, rationale, payload, slate_date, start_time, created_at')
      .eq('sport', 'nfl')
      .in('game_id', ids)
      .not('locked_at', 'is', null);
    if (error) {
      if (isMissingColumn(error)) { warnMigration('picks.locked_at is missing'); return { rows: [], ok: false, reason: 'migration_missing' }; }
      return { rows: [], ok: false, reason: error.message };
    }
    return { rows: data || [], ok: true };
  } catch (e) {
    return { rows: [], ok: false, reason: e?.message || 'exception' };
  }
}

/**
 * Lock picks: one insert per pick, so a pick another instance locked a
 * moment ago is skipped instead of failing the batch.
 *
 * @param {object} args
 * @param {Array}  args.picks  canonical pick objects from the board
 * @param {'hero'|'tracking'} args.role
 * @param {object} args.board  for week / versions on the run row
 * @returns {Promise<{ ok:boolean, locked:string[], skipped:number, reason?:string }>}
 */
export async function lockPicks({ picks = [], role, board, now = new Date() }) {
  if (picks.length === 0) return { ok: true, locked: [], skipped: 0 };
  let sb;
  try { sb = getSupabaseAdmin(); } catch { return { ok: false, locked: [], skipped: 0, reason: 'no_supabase' }; }

  const bySlate = new Map();
  for (const p of picks) {
    const date = etDayFromISO(p?.matchup?.startTime);
    if (!date) continue;
    if (!bySlate.has(date)) bySlate.set(date, []);
    bySlate.get(date).push(p);
  }

  const locked = [];
  let skipped = 0;
  const lockedAt = now.toISOString();
  for (const [slateDate, list] of bySlate) {
    const { data: run, error: runErr } = await sb.from('picks_runs').insert({
      sport: 'nfl',
      slate_date: slateDate,
      generated_at: board?.generatedAt || lockedAt,
      model_version: board?.modelVersion,
      config_version: board?.configVersion,
      meta: { week: board?.week ?? null, part: `locked-${role}`, picks: list.length },
      payload: { sport: 'nfl', date: slateDate, week: board?.week ?? null, part: `locked-${role}`, pickIds: list.map((p) => p.id) },
    }).select('id').single();
    if (runErr) return { ok: false, locked, skipped, reason: runErr.message };

    for (const pick of list) {
      const stored = { ...pick, tier: role === 'tracking' ? 'tracking' : pick.tier };
      const { row, issues } = buildPickRow({
        pick: stored, runId: run.id, sport: 'nfl', slateDate,
        modelVersion: board?.modelVersion, configVersion: board?.configVersion,
      });
      if (issues.length > 0) { skipped += 1; console.error(`[nflPicksStore] lock skipped ${pick.id}: ${issues.join('; ')}`); continue; }
      const { error } = await sb.from('picks').insert({
        ...row,
        book: pick.book?.title || null,
        locked_at: lockedAt,
        expected_value: pick.ev ?? null,
        payload: role === 'hero' ? stored : null,
      });
      if (!error) { locked.push(pick.id); continue; }
      if (error.code === UNIQUE_VIOLATION) { skipped += 1; continue; }
      if (isMissingColumn(error)) { warnMigration('picks lock columns are missing'); return { ok: false, locked, skipped, reason: 'migration_missing' }; }
      console.error(`[nflPicksStore] lock failed ${pick.id}: ${error.code} ${error.message}`);
      skipped += 1;
    }
  }
  return { ok: true, locked, skipped };
}

/**
 * Save the current consensus for each game that has not kicked off. The
 * last snapshot before kickoff is the closing line.
 */
export async function saveLineSnapshots(byGame = [], { now = new Date(), week = null, season = null } = {}) {
  const rows = [];
  for (const g of byGame) {
    const kick = Date.parse(g?.startTime || '');
    if (!Number.isFinite(kick) || kick <= now.getTime()) continue;
    const m = g.market || {};
    if (m.fairMargin == null && m.fairTotal == null && m.fairHomeWin == null) continue;
    rows.push({
      game_id: String(g.gameId),
      start_time: g.startTime,
      captured_at: now.toISOString(),
      week: g.week ?? week,
      season,
      spread_home: m.spreadHome ?? null,
      total: m.total ?? null,
      fair_margin: m.fairMargin ?? null,
      fair_total: m.fairTotal ?? null,
      fair_home_win: m.fairHomeWin ?? null,
      books: m.books ?? null,
    });
  }
  if (rows.length === 0) return { ok: true, saved: 0 };
  let sb;
  try { sb = getSupabaseAdmin(); } catch { return { ok: false, saved: 0, reason: 'no_supabase' }; }
  const { error } = await sb.from('nfl_line_snapshots').upsert(rows, { onConflict: 'game_id' });
  if (error) {
    if (isMissingTable(error)) { warnMigration('nfl_line_snapshots is missing'); return { ok: false, saved: 0, reason: 'migration_missing' }; }
    return { ok: false, saved: 0, reason: error.message };
  }
  return { ok: true, saved: rows.length };
}

/** Closing snapshots keyed by game id. A snapshot taken after kickoff is ignored. */
export async function getLineSnapshots(gameIds = []) {
  const ids = [...new Set(gameIds.map(String))];
  const out = new Map();
  if (ids.length === 0) return out;
  let sb;
  try { sb = getSupabaseAdmin(); } catch { return out; }
  try {
    const { data, error } = await sb.from('nfl_line_snapshots').select('*').in('game_id', ids);
    if (error) return out;
    for (const r of data || []) {
      if (r.start_time && r.captured_at && Date.parse(r.captured_at) > Date.parse(r.start_time)) continue;
      out.set(String(r.game_id), r);
    }
  } catch { /* best effort */ }
  return out;
}

/** Write closing-line value onto graded picks. Best effort. */
export async function saveClosingValues(updates = []) {
  if (updates.length === 0) return { ok: true, saved: 0 };
  let sb;
  try { sb = getSupabaseAdmin(); } catch { return { ok: false, saved: 0 }; }
  let saved = 0;
  for (const u of updates) {
    const { error } = await sb.from('picks')
      .update({ closing_line: u.closingLine, clv_points: u.clvPoints, clv_ev: u.clvEv })
      .eq('id', u.id);
    if (error) {
      if (isMissingColumn(error)) { warnMigration('picks closing-line columns are missing'); return { ok: false, saved }; }
      continue;
    }
    saved += 1;
  }
  return { ok: true, saved };
}
