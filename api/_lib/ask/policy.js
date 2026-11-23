/**
 * Ask Maximus policy: what an account may do and see in chat.
 *
 * Deterministic and unit-tested. The model never sees this file and cannot
 * talk its way past it: a pick this file withholds is never sent to the
 * model at all, and a message over the cap never reaches it.
 *
 * Limits come from the plan (api/_lib/entitlements.js) and can be moved
 * with env vars, never from chat:
 *
 *   ASK_PAUSED=1          kill switch: chat answers "paused" for everyone
 *   ASK_FREE_DAILY=5      messages a day on the free plan
 *   ASK_PRO_DAILY=150     messages a day on Pro
 *   ASK_FREE_PICKS=3      picks a free answer may show
 */

import { getEntitlements, PLAN_TIERS } from '../entitlements.js';

/** Longest message accepted from a user, in characters. */
export const MAX_MESSAGE_CHARS = 600;

/** A price older than this on a game that has not finished is marked stale. */
export const LINE_FRESH_MS = 15 * 60 * 1000;

/** A live score older than this is not presented as live. */
export const LIVE_FRESH_MS = 2 * 60 * 1000;

function envInt(name, fallback) {
  const n = parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function isPaused() {
  return process.env.ASK_PAUSED === '1' || process.env.ASK_PAUSED === 'true';
}

/**
 * @param {'free'|'pro'} tier
 * @returns {{ tier: 'free'|'pro', dailyMessages: number, picksPerAnswer: number }}
 */
export function limitsFor(tier) {
  const pro = tier === PLAN_TIERS.PRO;
  const plan = getEntitlements(pro ? PLAN_TIERS.PRO : PLAN_TIERS.FREE);
  return {
    tier: pro ? PLAN_TIERS.PRO : PLAN_TIERS.FREE,
    dailyMessages: envInt(pro ? 'ASK_PRO_DAILY' : 'ASK_FREE_DAILY', plan.askDailyMessages),
    picksPerAnswer: pro ? plan.askPicksPerAnswer : envInt('ASK_FREE_PICKS', plan.askPicksPerAnswer),
  };
}

/**
 * May this message start a turn? Checked before anything is stored.
 * @returns {{ ok: true, text: string } | { ok: false, code: 'paused'|'empty'|'too_long' }}
 */
export function canAsk(text) {
  if (isPaused()) return { ok: false, code: 'paused' };
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!clean) return { ok: false, code: 'empty' };
  if (clean.length > MAX_MESSAGE_CHARS) return { ok: false, code: 'too_long' };
  return { ok: true, text: clean };
}

const conviction = (p) => p?.conviction?.score ?? Math.round((p?.betScore?.total || 0) * 100);
const isRecommended = (p) => p?.pickRole === 'hero';

/**
 * Recommended first, then highest conviction, then expected value. A tie is
 * broken by id, so the order never depends on how the board happened to be
 * listed.
 */
export function rankPicks(picks = []) {
  return [...picks].sort((a, b) =>
    (isRecommended(b) - isRecommended(a)) || (conviction(b) - conviction(a)) || ((b.ev || 0) - (a.ev || 0))
    || String(a.id).localeCompare(String(b.id)));
}

/**
 * The picks an account may be shown from a board.
 *
 * Pro sees every pick. Free sees the top `picksPerAnswer` for the week,
 * ranked the same way the public home page ranks them, so the free picks
 * in chat are the same ones shown there. The cut is made on the whole
 * week's board, not on each answer: asking again never reveals a different
 * set.
 *
 * @returns {{ open: Set<string>, lockedCount: number }}
 */
export function openPickIds(board, limits) {
  const recommended = rankPicks((board?.heroPicks || []).filter(Boolean));
  if (limits.tier === PLAN_TIERS.PRO) {
    const all = [...(board?.fullSlatePicks || []), ...(board?.trackingPicks || []), ...recommended].filter(Boolean);
    return { open: new Set(all.map((p) => p.id)), lockedCount: 0 };
  }
  const open = recommended.slice(0, limits.picksPerAnswer);
  return {
    open: new Set(open.map((p) => p.id)),
    lockedCount: Math.max(0, recommended.length - open.length),
  };
}

/** Is a number fetched at `asOfMs` still fresh enough to present as current? */
export function isFresh(asOfMs, { now = Date.now(), maxAgeMs = LINE_FRESH_MS } = {}) {
  return Number.isFinite(asOfMs) && now - asOfMs <= maxAgeMs;
}
