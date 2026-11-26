/**
 * /api/ask/chat — the Ask Maximus conversation, web channel.
 *
 *   GET    ?since=<id>   the thread (or only messages after `since`), plus usage
 *   POST   { text, context?, history? }   send a message; the answer streams back
 *   DELETE               clear the conversation
 *
 * Three kinds of visitor, decided here and nowhere else:
 *   - an account (Authorization: Bearer <Supabase session token>), free or
 *     Pro: one saved thread, counted in the database
 *   - a guest (no token): nothing saved, the page holds the conversation
 *     and sends the last few messages back as `history`; counted in KV by
 *     device (X-Ask-Device) and network address
 *
 * Who chat exists for at all is ASK_ROLLOUT (off, admin, all).
 *
 * POST streams one JSON object per line:
 *   { type: 'status', label }        what Maximus is doing while a tool runs
 *   { type: 'text', delta }          answer text as it is written
 *   { type: 'reset' }                discard the text so far; it was not the answer
 *   { type: 'done', message, usage } the answer with its cards
 *   { type: 'error', code, message } not_configured | busy | timeout | failed
 *
 * This file is the web channel only: it works out who is asking, applies
 * policy, and lays the answer out for the page. The agent itself is
 * reply() in api/_lib/ask/agent.js, which any other channel calls the same
 * way.
 *
 * Env: ANTHROPIC_API_KEY (required), ASK_ROLLOUT, ASK_MODEL, ASK_EFFORT and
 * the limits listed in api/_lib/ask/policy.js.
 */

import { verifyUserToken, getSupabaseAdmin } from '../_lib/supabaseAdmin.js';
import { getUserEntitlements } from '../_lib/subscription.js';
import { isAdminEmail } from '../_lib/admin.js';
import { isClaudeConfigured } from '../_lib/claude.js';
import { captureEvent } from '../_lib/posthogServer.js';
import { NFL_SLUGS } from '../../src/sports/nfl/teams.js';
import { canAsk, canUse, limitsFor, guestCeilings, rolloutMode, TIERS, MAX_MESSAGE_CHARS } from '../_lib/ask/policy.js';
import { beginTurn, saveReply, undoTurn, listThread, usedToday, clearThread } from '../_lib/ask/thread.js';
import { takeGuestTurn, refundGuestTurn, guestUsed, cleanDeviceId, clientIp } from '../_lib/ask/guestLimit.js';
import { getConnector } from '../_lib/ask/connector.js';
import { reply, AskError } from '../_lib/ask/agent.js';

/** The whole turn must finish inside the function's maxDuration (60s in vercel.json). */
const TURN_DEADLINE_MS = 50_000;

/** How much of a guest's page-held conversation is read back in. */
const GUEST_HISTORY_MESSAGES = 6;

const MESSAGES = {
  not_available: 'Ask Maximus is not available yet.',
  not_configured: 'Ask Maximus is not switched on yet.',
  empty: 'Type a question first.',
  too_long: `That message is too long. Keep it under ${MAX_MESSAGE_CHARS} characters.`,
  capped: 'You have used today\'s questions. They reset at midnight Eastern.',
  duplicate: 'That message was already received.',
  busy: 'Maximus is busy right now. Give it a minute and send that again.',
  timeout: 'That took too long, so I stopped. Your question was not counted; send it again.',
  failed: 'Something went wrong on our side. Your question was not counted; send it again.',
};

const STATUS = { not_available: 404, not_configured: 503, empty: 400, too_long: 400, capped: 429, duplicate: 409, busy: 503 };

async function authenticate(req) {
  const header = String(req.headers?.authorization || '');
  const token = /^Bearer\s+/i.test(header) ? header.replace(/^Bearer\s+/i, '').trim() : '';
  if (!token) return null;
  return verifyUserToken(token).catch(() => null);
}

async function tierFor(user) {
  if (isAdminEmail(user.email)) return TIERS.PRO;
  try { return (await getUserEntitlements(user.id)).tier === 'pro' ? TIERS.PRO : TIERS.FREE; } catch { return TIERS.FREE; }
}

async function followedNflTeams(userId) {
  try {
    const { data } = await getSupabaseAdmin()
      .from('user_teams')
      .select('team_slug')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });
    return (data || []).map((r) => r.team_slug).filter((s) => NFL_SLUGS.has(s)).slice(0, 6);
  } catch { return []; }
}

const usage = (used, limits) => ({
  tier: limits.tier,
  used,
  cap: limits.dailyMessages,
  left: used == null ? null : Math.max(0, limits.dailyMessages - used),
  shopPrices: limits.shopPrices,
});

function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body || '{}'); } catch { return {}; }
}

/** The page the visitor opened chat from. Only known kinds and real team slugs get through. */
export function cleanPage(raw) {
  const kind = ['game', 'team', 'picks', 'home'].includes(raw?.kind) ? raw.kind : null;
  if (!kind) return null;
  const teams = (Array.isArray(raw.teams) ? raw.teams : []).map((s) => String(s).toLowerCase()).filter((s) => NFL_SLUGS.has(s)).slice(0, 2);
  return { kind, teams };
}

/** The browser's analytics id, if it sent a plausible one. Used only to file events under the right visitor. */
export function cleanVisitorId(raw) {
  return typeof raw === 'string' && /^[A-Za-z0-9_.:-]{8,100}$/.test(raw) ? raw : null;
}

/** A question or answer as it is recorded for analytics: one line, bounded. */
export function forAnalytics(text, max = 600) {
  return String(text || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** A guest's conversation as the page sent it: bounded, text only, roles checked. */
export function cleanGuestHistory(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(-GUEST_HISTORY_MESSAGES)
    .filter((m) => (m?.role === 'user' || m?.role === 'assistant') && typeof m.text === 'string')
    .map((m) => ({ role: m.role, text: m.text.replace(/\s+/g, ' ').trim().slice(0, 1200), cards: [] }))
    .filter((m) => m.text);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'POST', 'DELETE'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });

  const user = await authenticate(req);
  const hasToken = /^Bearer\s+\S/i.test(String(req.headers?.authorization || ''));
  // A token that does not verify is a signed-in page with a stale session, not a guest.
  if (hasToken && !user) return res.status(401).json({ error: 'Unauthorized' });

  const allowed = canUse({ isAdmin: !!user && isAdminEmail(user.email) });
  const guest = !user;
  const ip = clientIp(req);
  const device = guest ? cleanDeviceId(req.headers?.['x-ask-device']) : null;
  const limits = limitsFor(guest ? TIERS.GUEST : await tierFor(user), { guestPass: guest && req.headers?.['x-ask-pass'] === '1' });

  if (req.method === 'GET') {
    if (!allowed) return res.status(200).json({ ok: true, enabled: false, ready: false, reason: 'not_available', messages: [], usage: null });
    const [thread, used] = guest
      ? [{ ok: true, messages: [] }, await guestUsed({ ip, device })]
      : await Promise.all([listThread({ userId: user.id, since: req.query?.since }), usedToday(user.id)]);
    const ready = isClaudeConfigured() && thread.ok && (!guest || used != null);
    return res.status(200).json({
      ok: thread.ok,
      enabled: true,
      ready,
      reason: ready ? null : 'not_configured',
      messages: thread.ok ? thread.messages : [],
      usage: usage(used, limits),
    });
  }

  if (req.method === 'DELETE') {
    if (guest) return res.status(200).json({ ok: true });
    const out = await clearThread(user.id);
    return res.status(out.ok ? 200 : 503).json({ ok: out.ok });
  }

  // ── POST: one turn ────────────────────────────────────────────────────────
  const refuse = (code, extra = {}) => res.status(STATUS[code] || 500).json({ error: code, message: MESSAGES[code], ...extra });

  if (!allowed) return refuse('not_available');
  if (!isClaudeConfigured()) return refuse('not_configured');
  const body = parseBody(req);
  const asked = canAsk(body.text);
  if (!asked.ok) return refuse(asked.code);

  const started = Date.now();
  const page = cleanPage(body.context?.page);
  // File the server's events under the same visitor as the browser's: the account id, or the browser's analytics id.
  const who = guest ? (cleanVisitorId(body.visitor) || device || 'guest') : user.id;
  const base = {
    sport: 'nfl', channel: 'web', plan: limits.tier, signed_in: !guest, page: page?.kind || null,
    page_teams: page?.teams || [], rollout: rolloutMode(), question: forAnalytics(asked.text),
  };

  // Count the question, or stop here.
  let turn;
  if (guest) {
    const taken = await takeGuestTurn({ ip, device, cap: limits.dailyMessages, ...guestCeilings() });
    if (!taken.ok) {
      if (taken.code === 'capped') {
        captureEvent({ distinctId: who, event: 'ask_cap_hit', properties: { ...base, cap: limits.dailyMessages } });
        return refuse('capped', { usage: usage(taken.used, limits) });
      }
      return refuse(taken.code === 'busy' ? 'busy' : 'not_configured');
    }
    turn = { id: null, used: taken.used, history: cleanGuestHistory(body.history) };
  } else {
    const begun = await beginTurn({ userId: user.id, channel: 'web', text: asked.text, dailyCap: limits.dailyMessages });
    if (!begun.ok) {
      if (begun.code === 'capped') {
        captureEvent({ distinctId: who, event: 'ask_cap_hit', properties: { ...base, cap: limits.dailyMessages } });
        return refuse('capped', { usage: usage(begun.used, limits) });
      }
      return refuse(begun.code === 'failed' ? 'failed' : begun.code);
    }
    turn = begun;
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('X-Accel-Buffering', 'no');
  const send = (event) => { try { res.write(`${JSON.stringify(event)}\n`); } catch { /* client went away */ } };

  // One deadline for the turn, shared by every Claude call. A reader who
  // leaves does not stop it: an account's answer is still stored for when
  // they return.
  const signal = AbortSignal.timeout(TURN_DEADLINE_MS);

  try {
    const teams = guest ? [] : await followedNflTeams(user.id);
    const out = await reply({
      history: turn.history,
      text: asked.text,
      channel: 'web',
      limits,
      context: { teams, page },
      connector: getConnector('nfl'),
      onText: (delta) => send({ type: 'text', delta }),
      onReset: () => send({ type: 'reset' }),
      onStatus: (label) => send({ type: 'status', label }),
      signal,
    });

    let message;
    if (guest) {
      message = { id: `g${Date.now()}`, role: 'assistant', channel: 'web', text: out.text, cards: out.cards, createdAt: new Date().toISOString() };
    } else {
      const saved = await saveReply({ userId: user.id, channel: 'web', text: out.text, cards: out.cards });
      if (!saved.ok) throw new AskError('failed', `saveReply: ${saved.detail || saved.code}`);
      message = saved.message;
    }

    send({ type: 'done', userMessageId: turn.id, message, usage: usage(turn.used, limits) });
    await captureEvent({
      distinctId: who,
      event: 'ask_answered',
      properties: {
        ...base, answer: forAnalytics(out.text, 800), turn: turn.used,
        rounds: out.meta.rounds, tools: out.meta.tools, cards: out.cards.length,
        card_types: [...new Set(out.cards.map((c) => c.type))],
        corrections: out.meta.corrections, fell_back: !!out.meta.fellBack, pro_only: out.meta.proOnly || null,
        model: out.meta.model, duration_ms: Date.now() - started,
        input_tokens: out.meta.usage.input, output_tokens: out.meta.usage.output,
        cache_read_tokens: out.meta.usage.cacheRead,
      },
    });
  } catch (err) {
    const code = err instanceof AskError ? err.code : 'failed';
    console.error(`[ask/chat] turn failed (${code}): ${err?.message}`);
    // The question goes back to the user and does not count against the cap.
    if (guest) await refundGuestTurn({ ip, device });
    else await undoTurn({ userId: user.id, messageId: turn.id });
    send({ type: 'error', code, message: MESSAGES[code] || MESSAGES.failed, usage: usage(Math.max(0, turn.used - 1), limits) });
    await captureEvent({ distinctId: who, event: 'ask_failed', properties: { ...base, code, duration_ms: Date.now() - started } });
  }
  res.end();
}
