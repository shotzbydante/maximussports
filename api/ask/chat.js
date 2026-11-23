/**
 * /api/ask/chat — the Ask Maximus conversation, web channel.
 *
 *   GET    ?since=<id>   the thread (or only messages after `since`), plus usage
 *   POST   { text }      send a message; the answer streams back
 *   DELETE               clear the conversation
 *
 * Signed-in members only (Authorization: Bearer <Supabase session token>).
 *
 * POST streams one JSON object per line:
 *   { type: 'status', label }        what Maximus is doing while a tool runs
 *   { type: 'text', delta }          answer text as it is written
 *   { type: 'reset' }                discard the text so far; it was not the answer
 *   { type: 'done', message, usage } the stored answer with its cards
 *   { type: 'error', code, message } not_configured | paused | capped | busy | timeout | failed
 *
 * This file is the web channel only: it resolves the account, applies
 * policy, and lays the answer out for the page. The agent itself is
 * reply() in api/_lib/ask/agent.js, which any other channel calls the same
 * way.
 *
 * Env: ANTHROPIC_API_KEY (required), ASK_MODEL, ASK_PAUSED, ASK_FREE_DAILY,
 * ASK_PRO_DAILY, ASK_FREE_PICKS (all optional; see api/_lib/ask/policy.js).
 */

import { verifyUserToken, getSupabaseAdmin } from '../_lib/supabaseAdmin.js';
import { getUserEntitlements } from '../_lib/subscription.js';
import { isAdminEmail } from '../_lib/admin.js';
import { isClaudeConfigured } from '../_lib/claude.js';
import { captureEvent } from '../_lib/posthogServer.js';
import { NFL_SLUGS } from '../../src/sports/nfl/teams.js';
import { canAsk, limitsFor, isPaused } from '../_lib/ask/policy.js';
import { beginTurn, saveReply, undoTurn, listThread, usedToday, clearThread } from '../_lib/ask/thread.js';
import { getConnector } from '../_lib/ask/connector.js';
import { reply, AskError } from '../_lib/ask/agent.js';

/** The whole turn must finish inside the function's maxDuration (60s in vercel.json). */
const TURN_DEADLINE_MS = 50_000;

const MESSAGES = {
  not_configured: 'Ask Maximus is not switched on yet.',
  paused: 'Ask Maximus is taking a short break. Picks are still on the NFL page.',
  empty: 'Type a question first.',
  too_long: 'That message is too long. Keep it under 600 characters.',
  capped: 'You have used today\'s questions. They reset at midnight Eastern.',
  duplicate: 'That message was already received.',
  busy: 'Maximus is busy right now. Give it a minute and send that again.',
  timeout: 'That took too long, so I stopped. Your question was not counted; send it again.',
  failed: 'Something went wrong on our side. Your question was not counted; send it again.',
};

const STATUS = { not_configured: 503, paused: 503, empty: 400, too_long: 400, capped: 429, duplicate: 409 };

async function authenticate(req) {
  const header = String(req.headers?.authorization || '');
  const token = /^Bearer\s+/i.test(header) ? header.replace(/^Bearer\s+/i, '').trim() : '';
  if (!token) return null;
  return verifyUserToken(token).catch(() => null);
}

async function tierFor(user) {
  if (isAdminEmail(user.email)) return 'pro';
  try { return (await getUserEntitlements(user.id)).tier; } catch { return 'free'; }
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
  picksPerAnswer: limits.picksPerAnswer,
});

function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body || '{}'); } catch { return {}; }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'POST', 'DELETE'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const limits = limitsFor(await tierFor(user));

  if (req.method === 'GET') {
    const [thread, used] = await Promise.all([
      listThread({ userId: user.id, since: req.query?.since }),
      usedToday(user.id),
    ]);
    const ready = isClaudeConfigured() && thread.ok && !isPaused();
    return res.status(200).json({
      ok: thread.ok,
      ready,
      reason: ready ? null : (isPaused() ? 'paused' : 'not_configured'),
      messages: thread.ok ? thread.messages : [],
      usage: usage(used, limits),
    });
  }

  if (req.method === 'DELETE') {
    const out = await clearThread(user.id);
    return res.status(out.ok ? 200 : 503).json({ ok: out.ok });
  }

  // ── POST: one turn ────────────────────────────────────────────────────────
  const refuse = (code) => res.status(STATUS[code] || 500).json({ error: code, message: MESSAGES[code] });

  if (!isClaudeConfigured()) return refuse('not_configured');
  const asked = canAsk(parseBody(req).text);
  if (!asked.ok) return refuse(asked.code);

  const started = Date.now();
  const turn = await beginTurn({ userId: user.id, channel: 'web', text: asked.text, dailyCap: limits.dailyMessages });
  if (!turn.ok) {
    if (turn.code === 'capped') {
      captureEvent({ distinctId: user.id, event: 'ask_cap_hit', properties: { sport: 'nfl', plan: limits.tier, cap: limits.dailyMessages } });
      return res.status(429).json({ error: 'capped', message: MESSAGES.capped, usage: usage(turn.used, limits) });
    }
    return refuse(turn.code === 'failed' ? 'failed' : turn.code);
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('X-Accel-Buffering', 'no');
  const send = (event) => { try { res.write(`${JSON.stringify(event)}\n`); } catch { /* client went away */ } };

  // One deadline for the turn, shared by every Claude call. A reader who
  // leaves does not stop it: the answer is still stored for when they return.
  const signal = AbortSignal.timeout(TURN_DEADLINE_MS);

  try {
    const teams = await followedNflTeams(user.id);
    const out = await reply({
      history: turn.history,
      text: asked.text,
      channel: 'web',
      limits,
      context: { teams },
      connector: getConnector('nfl'),
      onText: (delta) => send({ type: 'text', delta }),
      onReset: () => send({ type: 'reset' }),
      onStatus: (label) => send({ type: 'status', label }),
      signal,
    });

    const saved = await saveReply({ userId: user.id, channel: 'web', text: out.text, cards: out.cards });
    if (!saved.ok) throw new AskError('failed', `saveReply: ${saved.detail || saved.code}`);

    send({ type: 'done', userMessageId: turn.id, message: saved.message, usage: usage(turn.used, limits) });
    await captureEvent({
      distinctId: user.id,
      event: 'ask_answered',
      properties: {
        sport: 'nfl', channel: 'web', plan: limits.tier,
        rounds: out.meta.rounds, tools: out.meta.tools, cards: out.cards.length,
        card_types: [...new Set(out.cards.map((c) => c.type))],
        corrections: out.meta.corrections, fell_back: !!out.meta.fellBack,
        model: out.meta.model, duration_ms: Date.now() - started,
        input_tokens: out.meta.usage.input, output_tokens: out.meta.usage.output,
        cache_read_tokens: out.meta.usage.cacheRead,
      },
    });
  } catch (err) {
    const code = err instanceof AskError ? err.code : 'failed';
    console.error(`[ask/chat] turn failed (${code}): ${err?.message}`);
    // The question goes back to the user and does not count against the cap.
    await undoTurn({ userId: user.id, messageId: turn.id });
    send({ type: 'error', code, message: MESSAGES[code] || MESSAGES.failed, usage: usage(Math.max(0, turn.used - 1), limits) });
    await captureEvent({
      distinctId: user.id, event: 'ask_failed',
      properties: { sport: 'nfl', channel: 'web', plan: limits.tier, code, duration_ms: Date.now() - started },
    });
  }
  res.end();
}
