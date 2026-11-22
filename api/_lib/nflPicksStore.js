/**
 * NFL picks read path.
 *
 * The board rebuilds many times before kickoff, and each rebuild inside
 * the persist window writes a fresh row. Lines move and, occasionally, the
 * model changes sides. The record should reflect ONE pick per game per
 * market: the last one written before kickoff, at the number closest to
 * the close.
 *
 * The shared getPicksForSlate() keeps the highest bet-score per pick key,
 * which treats "home -3" and "away +3" on the same game as two separate
 * picks and would grade both. NFL reads go through this module instead so
 * the settlement cron, the scorecard cron and the scorecard endpoint all
 * agree on which row counts.
 */

import { getSupabaseAdmin } from './supabaseAdmin.js';

/** Keep the most recent row per (slate_date, game_id, market_type). */
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
    const { data, error } = await sb
      .from('picks')
      .select('*, pick_results(*)')
      .eq('sport', 'nfl')
      .gte('slate_date', from)
      .lte('slate_date', to);
    if (error) return { picks: [], totalRaw: 0, droppedDuplicates: 0, ok: false, error: error.message };
    const rows = data || [];
    const picks = dedupeLatestPerMarket(rows);
    return { picks, totalRaw: rows.length, droppedDuplicates: rows.length - picks.length, ok: true };
  } catch (e) {
    return { picks: [], totalRaw: 0, droppedDuplicates: 0, ok: false, error: e?.message || 'exception' };
  }
}
