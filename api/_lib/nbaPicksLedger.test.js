/**
 * Tonight's picks stay on the page after tip-off: the ledger keeps each of
 * Maximus's picks as last published before its game started.
 */

import { describe, it, expect } from 'vitest';
import { foldLedger, slimPick } from './nbaPicksBuilder.js';

const NOW = Date.parse('2026-11-23T01:00:00Z');
const pick = (id, gameId, role, startTime, line = 226) => ({
  id, gameId, pickRole: role,
  market: { type: 'total', line }, selection: { side: 'over', label: `Over ${line}` },
  conviction: { score: 80 },
  matchup: { awayTeam: { slug: 'okc' }, homeTeam: { slug: 'mia' }, startTime },
});

describe('foldLedger', () => {
  it('remembers a pick and returns it once its game has started', () => {
    const board = { fullSlatePicks: [pick('a', 'g1', 'hero', '2026-11-22T23:00:00Z'), pick('b', 'g2', 'hero', '2026-11-23T03:00:00Z')] };
    const before = foldLedger({}, board, new Set(['g1', 'g2']), Date.parse('2026-11-22T22:00:00Z'));
    expect(Object.keys(before.ledger)).toEqual(['a', 'b']);
    expect(before.started).toEqual([]);

    // g1 has tipped off: it is no longer on the board, but its pick is still known.
    const later = foldLedger(before.ledger, { fullSlatePicks: [board.fullSlatePicks[1]] }, new Set(['g2']), NOW);
    expect(later.started.map((p) => p.id)).toEqual(['a']);
    expect(later.started[0]).toMatchObject({ market: 'total', side: 'over', line: 226, away: 'okc', home: 'mia' });
  });

  it('keeps the last version published before tip-off', () => {
    const first = foldLedger({}, { fullSlatePicks: [pick('a', 'g1', 'hero', '2026-11-22T23:00:00Z', 226)] }, new Set(['g1']), NOW - 4 * 3600e3);
    const moved = foldLedger(first.ledger, { fullSlatePicks: [pick('a', 'g1', 'hero', '2026-11-22T23:00:00Z', 227.5)] }, new Set(['g1']), NOW - 3 * 3600e3);
    expect(moved.ledger.a.line).toBe(227.5);
  });

  it('drops a pick that was withdrawn before its game started', () => {
    const first = foldLedger({}, { fullSlatePicks: [pick('a', 'g1', 'hero', '2026-11-23T03:00:00Z')] }, new Set(['g1']), NOW);
    const withdrawn = foldLedger(first.ledger, { fullSlatePicks: [pick('a', 'g1', 'tracking', '2026-11-23T03:00:00Z')] }, new Set(['g1']), NOW);
    expect(withdrawn.ledger).toEqual({});
  });

  it('never records a lean', () => {
    expect(foldLedger({}, { fullSlatePicks: [pick('a', 'g1', 'tracking', '2026-11-22T23:00:00Z')] }, new Set(), NOW).ledger).toEqual({});
  });

  it('lets a pick go once its game is long over', () => {
    const old = { a: slimPick(pick('a', 'g1', 'hero', '2026-11-21T23:00:00Z')) };
    expect(foldLedger(old, null, new Set(), NOW).started).toEqual([]);
  });
});
