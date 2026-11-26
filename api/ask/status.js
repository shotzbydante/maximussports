/**
 * GET /api/ask/status — should the Ask Maximus launcher show, and what can
 * it say before anyone opens it?
 *
 * Every page asks this once, so it does no real work: it reads the rollout
 * switch and the week's stored picks board. No model call, no build.
 *
 *   { enabled, week, picks, games, nextKickoff }
 *
 * `picks` is how many recommended picks are on the board; the launcher's
 * one-line prompt is written from these numbers on the page.
 *
 * With ASK_ROLLOUT=all the answer is the same for everyone and is cached
 * at the edge for a minute. With ASK_ROLLOUT=admin only the owner's
 * session gets enabled: true, and nothing is cached.
 */

import { verifyUserToken } from '../_lib/supabaseAdmin.js';
import { isAdminEmail } from '../_lib/admin.js';
import { isClaudeConfigured } from '../_lib/claude.js';
import { getLatestNflPicksBoard } from '../_lib/nflPicksBuilder.js';
import { rolloutMode, splitBoard } from '../_lib/ask/policy.js';

const OFF = { enabled: false };

/** The few numbers the launcher needs from a board. Exported for tests. */
export function boardSummary(board, now = Date.now()) {
  if (!board) return {};
  const { recommended, leans } = splitBoard(board);
  const kicks = [...recommended, ...leans]
    .map((p) => Date.parse(p?.matchup?.startTime))
    .filter((t) => Number.isFinite(t) && t > now);
  return {
    week: board.slateLabel || (board.week ? `Week ${board.week}` : null),
    picks: recommended.length,
    games: new Set([...recommended, ...leans].map((p) => String(p.gameId))).size,
    nextKickoff: kicks.length ? new Date(Math.min(...kicks)).toISOString() : null,
  };
}

async function isAdminRequest(req) {
  const header = String(req.headers?.authorization || '');
  const token = /^Bearer\s+/i.test(header) ? header.replace(/^Bearer\s+/i, '').trim() : '';
  if (!token) return false;
  const user = await verifyUserToken(token).catch(() => null);
  return !!user && isAdminEmail(user.email);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const mode = rolloutMode();

  if (mode === 'off' || !isClaudeConfigured()) {
    res.setHeader('Cache-Control', 'public, s-maxage=60');
    return res.status(200).json(OFF);
  }
  if (mode === 'admin') {
    res.setHeader('Cache-Control', 'private, no-store');
    if (!(await isAdminRequest(req))) return res.status(200).json(OFF);
  } else {
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
  }

  const board = await getLatestNflPicksBoard().catch(() => null);
  return res.status(200).json({ enabled: true, ...boardSummary(board) });
}
