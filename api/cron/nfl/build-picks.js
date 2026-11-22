/**
 * GET /api/cron/nfl/build-picks
 *
 * Builds the NFL picks board on a schedule so that picks are locked, model
 * leans are recorded and closing lines are captured whether or not anyone
 * opens the site.
 *
 * Vercel calls this every ten minutes. Most calls do nothing: a build pulls
 * odds (three Odds API credits), so the handler only builds when it has a
 * reason to.
 *
 *   - a game kicks off within 25 minutes and the last build is 8+ minutes
 *     old (this is what captures the closing line)
 *   - a game is inside the 72-hour lock window and the last build is an
 *     hour old (NFL_BUILD_INTERVAL_MIN overrides the hour)
 *   - nothing is close, but six hours have passed
 *
 *   ?force=1   build regardless
 */

import { fetchScoreboardPage } from '../../nfl/live/_normalize.js';
import { buildNflPicksBoard, canPersist } from '../../_lib/nflPicksBuilder.js';
import { getJson, setJson } from '../../_globalCache.js';
import { requireAdminOrCron } from '../../_lib/requireAuth.js';
import { NFL_DEFAULT_CONFIG } from '../../../src/features/nfl/picks/buildNflPicksV2.js';

const STATE_KEY = 'nfl:cron:build-picks:last';
const CLOSING_WINDOW_MIN = 25;
const CLOSING_INTERVAL_MIN = 8;
const IDLE_INTERVAL_MIN = 360;

/** Exported for tests. */
export function buildDecision({ kickoffs = [], lastAt = 0, now = Date.now(), intervalMin = 60, lockWindowHours = NFL_DEFAULT_CONFIG.lockWindowHours }) {
  const upcoming = kickoffs.filter((k) => Number.isFinite(k) && k > now);
  if (upcoming.length === 0) return { build: false, reason: 'no_upcoming_games' };
  const sinceMin = lastAt ? (now - lastAt) / 60_000 : Infinity;
  const nextMin = (Math.min(...upcoming) - now) / 60_000;
  if (nextMin <= CLOSING_WINDOW_MIN && sinceMin >= CLOSING_INTERVAL_MIN) return { build: true, reason: 'closing_line' };
  if (nextMin <= lockWindowHours * 60 && sinceMin >= intervalMin) return { build: true, reason: 'lock_window' };
  if (sinceMin >= IDLE_INTERVAL_MIN) return { build: true, reason: 'idle_refresh' };
  return { build: false, reason: 'not_due', nextKickoffMin: Math.round(nextMin), sinceLastMin: Math.round(sinceMin) };
}

export default async function handler(req, res) {
  if (!(await requireAdminOrCron(req, res))) return;
  const t0 = Date.now();
  const force = req?.query?.force === '1';
  try {
    const page = await fetchScoreboardPage();
    if (!page.ok) {
      console.error('[cron/nfl/build-picks] ESPN scoreboard unavailable');
      return res.status(200).json({ ok: false, built: false, reason: 'espn_scoreboard_unavailable' });
    }
    const kickoffs = page.games
      .filter((g) => g.status === 'upcoming')
      .map((g) => Date.parse(g.startTime || ''));
    const state = await getJson(STATE_KEY).catch(() => null);
    const intervalMin = Math.max(10, Number(process.env.NFL_BUILD_INTERVAL_MIN) || 60);
    const decision = force ? { build: true, reason: 'forced' } : buildDecision({ kickoffs, lastAt: state?.at || 0, intervalMin });
    if (!decision.build) return res.status(200).json({ ok: true, built: false, ...decision });

    const { board, source, counts } = await buildNflPicksBoard({ preferFresh: true });
    await setJson(STATE_KEY, { at: Date.now(), reason: decision.reason }, { exSeconds: 24 * 3600 }).catch(() => {});
    console.log(`[cron/nfl/build-picks] reason=${decision.reason} source=${source} counts=${JSON.stringify(counts)} persisted=${JSON.stringify(board?._debug?.persisted || null)}`);
    return res.status(200).json({
      ok: true, built: true, reason: decision.reason, source, counts,
      week: board?.week ?? null,
      persist: canPersist(),
      persisted: board?._debug?.persisted || null,
      engine: board?.engine || null,
      durationMs: Date.now() - t0,
    });
  } catch (e) {
    console.error('[cron/nfl/build-picks] fatal:', e);
    return res.status(200).json({ ok: false, built: false, error: e?.message || 'unknown' });
  }
}
