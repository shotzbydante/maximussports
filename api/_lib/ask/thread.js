/**
 * Ask Maximus thread storage.
 *
 * One thread per account in `ask_messages` (docs/ask-maximus-migration.sql).
 * Every channel writes the same rows through these functions, so a message
 * sent by text shows up on the web without any sync step.
 *
 * Only the server touches the table (service role). Functions resolve to a
 * typed result instead of throwing, so the route can say exactly what went
 * wrong: `not_configured` (no database, or the migration has not been run),
 * `capped`, `duplicate`, or `failed`.
 */

import { getSupabaseAdmin } from '../supabaseAdmin.js';

export const HISTORY_MESSAGES = 24;
const THREAD_PAGE = 200;

const isMissing = (e) =>
  e?.code === '42P01' || e?.code === '42883' || e?.code === 'PGRST202' || e?.code === 'PGRST205'
  || /does not exist|Could not find the (table|function)/i.test(e?.message || '');

function admin() {
  try { return getSupabaseAdmin(); } catch { return null; }
}

function fail(error) {
  if (isMissing(error)) return { ok: false, code: 'not_configured', detail: 'ask_messages migration has not been run' };
  return { ok: false, code: 'failed', detail: error?.message || 'unknown' };
}

/** Shape a stored row for the client and for the agent. */
export function toMessage(row) {
  return {
    id: Number(row.id),
    role: row.role,
    channel: row.channel || 'web',
    text: row.body || '',
    cards: Array.isArray(row.cards) ? row.cards : [],
    createdAt: row.created_at,
  };
}

/**
 * Store the user's message and return the recent thread, or say why not.
 * @returns {Promise<{ ok:true, id:number, used:number, history:Array } | { ok:false, code:string, used?:number, detail?:string }>}
 */
export async function beginTurn({ userId, channel = 'web', text, externalId = null, dailyCap }) {
  const sb = admin();
  if (!sb) return { ok: false, code: 'not_configured', detail: 'Supabase service role is not configured' };
  const { data, error } = await sb.rpc('ask_chat_begin', {
    p_user: userId,
    p_channel: channel,
    p_body: text,
    p_external_id: externalId,
    p_daily_cap: dailyCap,
    p_history: HISTORY_MESSAGES,
  });
  if (error) return fail(error);
  if (data?.status === 'capped') return { ok: false, code: 'capped', used: data.used };
  if (data?.status === 'duplicate') return { ok: false, code: 'duplicate' };
  if (data?.status !== 'ok') return { ok: false, code: 'failed', detail: 'unexpected response' };
  return { ok: true, id: Number(data.id), used: data.used, history: (data.history || []).map(toMessage) };
}

/** Store the assistant's answer with the cards the server built for it. */
export async function saveReply({ userId, channel = 'web', text, cards = [] }) {
  const sb = admin();
  if (!sb) return { ok: false, code: 'not_configured' };
  const { data, error } = await sb
    .from('ask_messages')
    .insert({ user_id: userId, role: 'assistant', channel, body: text, cards })
    .select('id, role, channel, body, cards, created_at')
    .single();
  if (error) return fail(error);
  return { ok: true, message: toMessage(data) };
}

/**
 * Take back a user message whose turn failed, so it neither sits in the
 * thread unanswered nor counts against the daily cap.
 */
export async function undoTurn({ userId, messageId }) {
  const sb = admin();
  if (!sb || !messageId) return { ok: false };
  const { error } = await sb
    .from('ask_messages')
    .delete()
    .eq('id', messageId)
    .eq('user_id', userId)
    .eq('role', 'user');
  return { ok: !error };
}

/**
 * The thread, oldest first. `since` returns only messages after that id, so
 * a page that polls does not re-read the whole conversation.
 */
export async function listThread({ userId, since = 0 }) {
  const sb = admin();
  if (!sb) return { ok: false, code: 'not_configured' };
  let q = sb
    .from('ask_messages')
    .select('id, role, channel, body, cards, created_at')
    .eq('user_id', userId)
    .is('cleared_at', null);
  const after = Number(since);
  if (Number.isFinite(after) && after > 0) {
    q = q.gt('id', after).order('id', { ascending: true }).limit(THREAD_PAGE);
    const { data, error } = await q;
    if (error) return fail(error);
    return { ok: true, messages: (data || []).map(toMessage) };
  }
  const { data, error } = await q.order('id', { ascending: false }).limit(THREAD_PAGE);
  if (error) return fail(error);
  return { ok: true, messages: (data || []).reverse().map(toMessage) };
}

/** Messages sent so far today. Resolves to null when it cannot be read. */
export async function usedToday(userId) {
  const sb = admin();
  if (!sb) return null;
  const { data, error } = await sb.rpc('ask_chat_used', { p_user: userId });
  return error ? null : Number(data) || 0;
}

/** Hide the thread. Rows are kept so the daily count is not reset. */
export async function clearThread(userId) {
  const sb = admin();
  if (!sb) return { ok: false, code: 'not_configured' };
  const { error } = await sb
    .from('ask_messages')
    .update({ cleared_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('cleared_at', null);
  return error ? fail(error) : { ok: true };
}
