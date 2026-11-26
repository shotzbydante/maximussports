/**
 * Ask Maximus policy: who may use chat, how much, and what they may see.
 *
 * Deterministic and unit-tested. The model never sees this file and cannot
 * talk its way past it: a pick this file withholds is never sent to the
 * model at all, and a message over the cap never reaches it.
 *
 * Three tiers, matching what each sees on the NFL picks page:
 *
 *   guest  no account. A few questions a day, nothing saved. Sees the same
 *          calls the signed-out picks page shows: every recommended pick,
 *          topped up to three with the strongest leans.
 *   free   an account. More questions, a saved thread, every call.
 *   pro    paying. Far more questions, plus the agent-only extras: prices
 *          shopped across every book, and longer breakdowns on request.
 *
 * Everything here moves with env vars, never from chat:
 *
 *   ASK_ROLLOUT=admin        off | admin | all. Who chat exists for.
 *                            Defaults to admin, so merging shows it to the
 *                            owner only. ASK_PAUSED=1 is the same as off.
 *   ASK_GUEST_DAILY=3        questions a day, signed out (per device)
 *   ASK_GUEST_PASS_DAILY=6   the same, once they have given an email
 *   ASK_GUEST_IP_DAILY=15    ceiling per network address, for shared wifi
 *   ASK_GUEST_BUDGET=500     ceiling on all signed-out questions in a day
 *   ASK_FREE_DAILY=10        questions a day on a free account
 *   ASK_PRO_DAILY=150        questions a day on Pro
 */

import { getEntitlements, PLAN_TIERS } from '../entitlements.js';
import { freeLeans, byConviction, isRecommended } from '../../../src/components/nfl/home/pickHelpers.js';

export const TIERS = Object.freeze({ GUEST: 'guest', FREE: 'free', PRO: 'pro' });

/** Longest message accepted from a user, in characters. */
export const MAX_MESSAGE_CHARS = 600;

/** A price older than this on a game that has not finished is marked stale. */
export const LINE_FRESH_MS = 15 * 60 * 1000;

/** A live score older than this is not presented as live. */
export const LIVE_FRESH_MS = 2 * 60 * 1000;

/** How many calls the signed-out picks page opens with. Chat shows guests the same ones. */
export const GUEST_FREE_CALLS = 3;

function envInt(name, fallback) {
  const n = parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** 'off' | 'admin' | 'all'. Anything unrecognised is 'admin', the cautious reading. */
export function rolloutMode() {
  if (process.env.ASK_PAUSED === '1' || process.env.ASK_PAUSED === 'true') return 'off';
  const mode = String(process.env.ASK_ROLLOUT || '').trim().toLowerCase();
  return mode === 'off' || mode === 'all' ? mode : 'admin';
}

/** Does chat exist for this visitor at all? */
export function canUse({ isAdmin = false } = {}) {
  const mode = rolloutMode();
  if (mode === 'off') return false;
  return mode === 'all' || isAdmin;
}

/**
 * @param {'guest'|'free'|'pro'} tier
 * @param {{ guestPass?: boolean }} [opts] a signed-out visitor who has given an email
 * @returns {{ tier:string, dailyMessages:number, picks:'preview'|'all', saved:boolean, shopPrices:boolean, deepAnswers:boolean }}
 */
export function limitsFor(tier, { guestPass = false } = {}) {
  if (tier === TIERS.PRO) {
    return {
      tier: TIERS.PRO,
      dailyMessages: envInt('ASK_PRO_DAILY', getEntitlements(PLAN_TIERS.PRO).askDailyMessages),
      picks: 'all', saved: true, shopPrices: true, deepAnswers: true,
    };
  }
  if (tier === TIERS.FREE) {
    return {
      tier: TIERS.FREE,
      dailyMessages: envInt('ASK_FREE_DAILY', getEntitlements(PLAN_TIERS.FREE).askDailyMessages),
      picks: 'all', saved: true, shopPrices: false, deepAnswers: false,
    };
  }
  return {
    tier: TIERS.GUEST,
    dailyMessages: guestPass ? envInt('ASK_GUEST_PASS_DAILY', 6) : envInt('ASK_GUEST_DAILY', 3),
    picks: 'preview', saved: false, shopPrices: false, deepAnswers: false,
  };
}

/** Ceilings that protect the budget from signed-out traffic. */
export function guestCeilings() {
  return { perIp: envInt('ASK_GUEST_IP_DAILY', 15), all: envInt('ASK_GUEST_BUDGET', 500) };
}

/**
 * Is this message acceptable? Checked before anything is stored or counted.
 * @returns {{ ok: true, text: string } | { ok: false, code: 'empty'|'too_long' }}
 */
export function canAsk(text) {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!clean) return { ok: false, code: 'empty' };
  if (clean.length > MAX_MESSAGE_CHARS) return { ok: false, code: 'too_long' };
  return { ok: true, text: clean };
}

/**
 * Recommended first, then highest conviction, then expected value. A tie is
 * broken by id, so the order never depends on how the board was listed.
 */
export function rankPicks(picks = []) {
  return [...picks].sort((a, b) =>
    (isRecommended(b) - isRecommended(a)) || byConviction(a, b) || String(a.id).localeCompare(String(b.id)));
}

/** A board's recommended picks and its leans, each ranked. */
export function splitBoard(board) {
  const recommended = rankPicks((board?.heroPicks || []).filter(Boolean));
  const ids = new Set(recommended.map((p) => p.id));
  const leans = rankPicks([...(board?.fullSlatePicks || []), ...(board?.trackingPicks || [])]
    .filter((p) => p && !ids.has(p.id) && ids.add(p.id)));
  return { recommended, leans };
}

/**
 * The picks an account may be shown from a board.
 *
 * Accounts see every call, as they do on the picks page. A guest sees what
 * the signed-out picks page shows, chosen by the same function that page
 * uses, so the two can never disagree. The cut is made on the whole week's
 * board: asking again never reveals a different set.
 *
 * @returns {{ open: Set<string>, lockedCount: number, games: number }}
 *          lockedCount: calls withheld; games: games on the board
 */
export function openPickIds(board, limits) {
  const { recommended, leans } = splitBoard(board);
  const games = new Set([...recommended, ...leans].map((p) => String(p.gameId))).size;
  if (limits.picks === 'all') {
    return { open: new Set([...recommended, ...leans].map((p) => p.id)), lockedCount: 0, games };
  }
  const open = [...recommended, ...freeLeans(leans, recommended, GUEST_FREE_CALLS)];
  return {
    open: new Set(open.map((p) => p.id)),
    lockedCount: Math.max(0, recommended.length + leans.length - open.length),
    games,
  };
}

/** Is a number fetched at `asOfMs` still fresh enough to present as current? */
export function isFresh(asOfMs, { now = Date.now(), maxAgeMs = LINE_FRESH_MS } = {}) {
  return Number.isFinite(asOfMs) && now - asOfMs <= maxAgeMs;
}
