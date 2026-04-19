/**
 * Tests for the hard-dedupe rule — the trust-layer invariant that no matchup
 * is ever rendered twice.
 */

import { describe, it, expect } from 'vitest';
import { dedupeByMatchupKey } from './groupPicks.js';

function mk({ id, gameId, away, home, score, startTime = '2026-04-18T22:00:00Z', date }) {
  return {
    id, gameId,
    betScore: { total: score },
    matchup: {
      awayTeam: { slug: away, shortName: away.toUpperCase() },
      homeTeam: { slug: home, shortName: home.toUpperCase() },
      startTime,
    },
  };
}

describe('dedupeByMatchupKey', () => {
  it('returns empty result for empty input', () => {
    const r = dedupeByMatchupKey([]);
    expect(r.picks).toEqual([]);
    expect(r.droppedCount).toBe(0);
  });

  it('keeps a single pick when there are no conflicts', () => {
    const r = dedupeByMatchupKey([
      mk({ id: 'a', gameId: 'g1', away: 'nyy', home: 'bos', score: 0.80 }),
    ], { slateDate: '2026-04-18' });
    expect(r.picks).toHaveLength(1);
    expect(r.droppedCount).toBe(0);
  });

  it('collapses multi-market same-game picks to the best', () => {
    const r = dedupeByMatchupKey([
      mk({ id: 'a-ml', gameId: 'g1', away: 'lad', home: 'col', score: 0.72 }),
      mk({ id: 'a-tot', gameId: 'g1', away: 'lad', home: 'col', score: 0.85 }),
      mk({ id: 'a-rl',  gameId: 'g1', away: 'lad', home: 'col', score: 0.60 }),
    ], { slateDate: '2026-04-18' });
    expect(r.picks).toHaveLength(1);
    expect(r.picks[0].id).toBe('a-tot');
    expect(r.droppedCount).toBe(2);
    expect(r.droppedIds.sort()).toEqual(['a-ml', 'a-rl']);
  });

  it('collapses doubleheaders (two gameIds, same teams, same day) to the best', () => {
    const r = dedupeByMatchupKey([
      mk({ id: 'g1-ml', gameId: 'g1', away: 'lad', home: 'col', score: 0.70, startTime: '2026-04-18T17:00:00Z' }),
      mk({ id: 'g2-ml', gameId: 'g2', away: 'lad', home: 'col', score: 0.88, startTime: '2026-04-18T23:00:00Z' }),
    ], { slateDate: '2026-04-18' });
    expect(r.picks).toHaveLength(1);
    expect(r.picks[0].id).toBe('g2-ml');
    expect(r.droppedCount).toBe(1);
  });

  it('keeps distinct matchups separate', () => {
    const r = dedupeByMatchupKey([
      mk({ id: 'a', gameId: 'g1', away: 'nyy', home: 'bos', score: 0.80 }),
      mk({ id: 'b', gameId: 'g2', away: 'lad', home: 'sd',  score: 0.75 }),
      mk({ id: 'c', gameId: 'g3', away: 'hou', home: 'tex', score: 0.70 }),
    ], { slateDate: '2026-04-18' });
    expect(r.picks).toHaveLength(3);
    expect(r.droppedCount).toBe(0);
  });

  it('preserves insertion order of first-winner per matchup', () => {
    const r = dedupeByMatchupKey([
      mk({ id: 'b', gameId: 'g2', away: 'lad', home: 'sd',  score: 0.70 }),  // first appearance of LAD/SD
      mk({ id: 'a-lo', gameId: 'g1', away: 'nyy', home: 'bos', score: 0.50 }),
      mk({ id: 'a-hi', gameId: 'g1', away: 'nyy', home: 'bos', score: 0.90 }),
    ], { slateDate: '2026-04-18' });
    expect(r.picks.map(p => p.matchup.awayTeam.slug)).toEqual(['lad', 'nyy']);
    // NYY slot was taken by a-lo first; a-hi upgraded it but order stays
    expect(r.picks[1].id).toBe('a-hi');
  });

  it('same-score ties keep the original (first) pick', () => {
    const r = dedupeByMatchupKey([
      mk({ id: 'first', gameId: 'g1', away: 'nyy', home: 'bos', score: 0.75 }),
      mk({ id: 'tie',   gameId: 'g1', away: 'nyy', home: 'bos', score: 0.75 }),
    ], { slateDate: '2026-04-18' });
    expect(r.picks).toHaveLength(1);
    expect(r.picks[0].id).toBe('first');
    expect(r.droppedIds).toEqual(['tie']);
  });

  it('handles picks missing team slugs gracefully', () => {
    const bad = { id: 'x', betScore: { total: 0.5 }, matchup: {} };
    const good = mk({ id: 'y', gameId: 'g1', away: 'nyy', home: 'bos', score: 0.70 });
    const r = dedupeByMatchupKey([bad, good]);
    expect(r.picks).toHaveLength(2); // bad got a unique fallback key
  });
});
