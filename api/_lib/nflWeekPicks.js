/**
 * This week's recommended picks whose games have kicked off, with where
 * each one stands against the scoreboard.
 *
 * The picks board only carries games still to be played, so a pick drops
 * off it at kickoff. The locked ticket is still in storage; this reads it
 * back and pairs it with the live score and the line the game closed at.
 */

import { getLockedPicks, getLineSnapshots } from './nflPicksStore.js';
import { pickLiveStatus } from '../../src/features/nfl/picks/pickLive.js';
import { closingLineValue } from '../../src/features/nfl/picks/v2/locks.js';

const num = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const odds = (v) => (v == null ? '' : v > 0 ? `+${v}` : `${v}`);

function labelFor(row, game) {
  const stored = row.payload?.selection?.label;
  if (stored) return stored;
  const line = num(row.line_value);
  if (row.market_type === 'total') return `${row.selection_side === 'over' ? 'Over' : 'Under'} ${line}`;
  const team = row.selection_side === 'home' ? game.teams.home : game.teams.away;
  if (row.market_type === 'runline') return `${team.abbrev} ${line > 0 ? '+' : ''}${line}`;
  return `${team.abbrev} ${odds(num(row.price_american))}`;
}

/** Pure: turn locked rows into picks with a live status. Exported for tests. */
export function toWeekPicks({ games = [], rows = [], closes = new Map() }) {
  const byId = new Map(games.map((g) => [String(g.gameId), g]));
  return rows
    .filter((r) => r.tier && r.tier !== 'tracking')
    .map((r) => {
      const game = byId.get(String(r.game_id));
      if (!game || game.status === 'upcoming') return null;
      const pick = { market: r.market_type, side: r.selection_side, line: num(r.line_value) };
      const close = closes.get(String(r.game_id)) || null;
      const clv = close ? closingLineValue(r, close) : null;
      const team = (t) => ({ slug: t.slug, abbrev: t.abbrev, name: t.name, score: t.score ?? null });
      return {
        id: r.id,
        gameId: String(r.game_id),
        market: pick.market,
        side: pick.side,
        line: pick.line,
        price: num(r.price_american),
        book: r.book || r.payload?.book?.title || null,
        label: labelFor(r, game),
        tier: r.tier,
        lockedAt: r.locked_at,
        evAtLock: num(r.expected_value),
        why: r.payload?.why || r.payload?.rationale?.why || null,
        whyShort: r.payload?.whyShort || r.payload?.rationale?.whyShort || null,
        closingLine: clv?.closingLine ?? null,
        clvPoints: clv?.clvPoints ?? null,
        away: team(game.teams.away),
        home: team(game.teams.home),
        startTime: game.startTime,
        gameStatus: game.status,
        clock: game.gameState?.periodLabel || null,
        status: pickLiveStatus(pick, game),
      };
    })
    .filter(Boolean)
    .sort((a, b) => (a.gameStatus === b.gameStatus ? Date.parse(a.startTime) - Date.parse(b.startTime) : a.gameStatus === 'live' ? -1 : 1));
}

/**
 * @param {object} slate  from getNflSlate()
 * @returns {Promise<{ picks: Array, closes: Map, ok: boolean }>}
 */
export async function getWeekPicksInPlay(slate) {
  const started = (slate?.games || []).filter((g) => g.status === 'live' || g.status === 'final');
  if (started.length === 0) return { picks: [], closes: new Map(), ok: true };
  const ids = started.map((g) => g.gameId);
  const [locked, closes] = await Promise.all([getLockedPicks(ids), getLineSnapshots(ids)]);
  return { picks: toWeekPicks({ games: started, rows: locked.rows || [], closes }), closes, ok: locked.ok !== false };
}
