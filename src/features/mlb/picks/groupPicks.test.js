/**
 * Tests for pick grouping helpers — the logic that kills the "same matchup
 * rendered twice" bug and expresses legitimate doubleheaders clearly.
 */

import { describe, it, expect } from 'vitest';
import {
  groupByMatchup,
  annotateDoubleheaders,
  groupByMarketType,
  subgroupLabel,
} from './groupPicks.js';

function p(overrides = {}) {
  return {
    id: overrides.id || `${overrides.gameId}-${overrides.market?.type}-${overrides.selection?.side}`,
    gameId: 'g1',
    market: { type: 'moneyline' },
    selection: { side: 'away', label: 'NYY -135' },
    matchup: {
      awayTeam: { slug: 'nyy', shortName: 'NYY' },
      homeTeam: { slug: 'bos', shortName: 'BOS' },
      startTime: '2026-04-18T22:00:00Z',
    },
    betScore: { total: 0.75 },
    ...overrides,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// groupByMatchup
// ────────────────────────────────────────────────────────────────────────────
describe('groupByMatchup', () => {
  it('returns empty array for empty input', () => {
    expect(groupByMatchup([])).toEqual([]);
  });

  it('returns one card per matchup', () => {
    const picks = [
      p({ gameId: 'g1', market: { type: 'moneyline' }, betScore: { total: 0.80 } }),
      p({ gameId: 'g1', market: { type: 'total' },     betScore: { total: 0.65 } }),
      p({ gameId: 'g2', market: { type: 'moneyline' }, betScore: { total: 0.70 } }),
    ];
    const out = groupByMatchup(picks);
    expect(out).toHaveLength(2);
    expect(out[0].primary.gameId).toBe('g1');
    expect(out[0].siblings).toHaveLength(1);
    expect(out[0].siblings[0].market.type).toBe('total');
    expect(out[1].primary.gameId).toBe('g2');
    expect(out[1].siblings).toHaveLength(0);
  });

  it('picks highest bet_score as primary within each matchup', () => {
    const picks = [
      p({ id: 'a', gameId: 'g1', market: { type: 'total' },     betScore: { total: 0.60 } }),
      p({ id: 'b', gameId: 'g1', market: { type: 'moneyline' }, betScore: { total: 0.85 } }),
      p({ id: 'c', gameId: 'g1', market: { type: 'runline' },   betScore: { total: 0.72 } }),
    ];
    const out = groupByMatchup(picks);
    expect(out).toHaveLength(1);
    expect(out[0].primary.id).toBe('b');
    expect(out[0].siblings.map(s => s.id)).toEqual(['c', 'a']);
  });

  it('preserves insertion order of first appearance of each gameId', () => {
    const picks = [
      p({ id: 'a', gameId: 'g2' }),
      p({ id: 'b', gameId: 'g1' }),
      p({ id: 'c', gameId: 'g2' }),
    ];
    const out = groupByMatchup(picks);
    expect(out.map(c => c.primary.gameId)).toEqual(['g2', 'g1']);
  });

  it('skips picks missing gameId and id', () => {
    const picks = [
      p({ gameId: undefined, id: undefined }),
      p({ gameId: 'g1' }),
    ];
    const out = groupByMatchup(picks);
    expect(out).toHaveLength(1);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// annotateDoubleheaders
// ────────────────────────────────────────────────────────────────────────────
describe('annotateDoubleheaders', () => {
  const LAD = { slug: 'lad', shortName: 'LAD' };
  const COL = { slug: 'col', shortName: 'COL' };

  it('does nothing when each matchup has only one gameId', () => {
    const picks = [
      p({ gameId: 'g1', matchup: { awayTeam: LAD, homeTeam: COL, startTime: '2026-04-18T19:00:00Z' } }),
    ];
    const out = annotateDoubleheaders(picks, { slateDate: '2026-04-18' });
    expect(out[0]._doubleheaderGame).toBeUndefined();
  });

  it('tags both games when two distinct gameIds share same teams/date', () => {
    const picks = [
      p({ gameId: 'g1', matchup: { awayTeam: LAD, homeTeam: COL, startTime: '2026-04-18T19:00:00Z' } }),
      p({ gameId: 'g2', matchup: { awayTeam: LAD, homeTeam: COL, startTime: '2026-04-18T23:00:00Z' } }),
    ];
    const out = annotateDoubleheaders(picks, { slateDate: '2026-04-18' });
    expect(out[0]._doubleheaderGame).toBe(1);
    expect(out[1]._doubleheaderGame).toBe(2);
  });

  it('orders doubleheader games by startTime', () => {
    const picks = [
      p({ gameId: 'g-late', matchup: { awayTeam: LAD, homeTeam: COL, startTime: '2026-04-18T23:00:00Z' } }),
      p({ gameId: 'g-early', matchup: { awayTeam: LAD, homeTeam: COL, startTime: '2026-04-18T16:00:00Z' } }),
    ];
    const out = annotateDoubleheaders(picks, { slateDate: '2026-04-18' });
    expect(out.find(p => p.gameId === 'g-early')._doubleheaderGame).toBe(1);
    expect(out.find(p => p.gameId === 'g-late')._doubleheaderGame).toBe(2);
  });

  it('annotates every pick belonging to a doubleheader game', () => {
    // Two picks for game g1, one pick for game g2. Same matchup.
    const picks = [
      p({ id: 'a', gameId: 'g1', market: { type: 'moneyline' }, matchup: { awayTeam: LAD, homeTeam: COL, startTime: '2026-04-18T19:00:00Z' } }),
      p({ id: 'b', gameId: 'g1', market: { type: 'total' },     matchup: { awayTeam: LAD, homeTeam: COL, startTime: '2026-04-18T19:00:00Z' } }),
      p({ id: 'c', gameId: 'g2', market: { type: 'moneyline' }, matchup: { awayTeam: LAD, homeTeam: COL, startTime: '2026-04-18T23:00:00Z' } }),
    ];
    const out = annotateDoubleheaders(picks, { slateDate: '2026-04-18' });
    expect(out.find(x => x.id === 'a')._doubleheaderGame).toBe(1);
    expect(out.find(x => x.id === 'b')._doubleheaderGame).toBe(1);
    expect(out.find(x => x.id === 'c')._doubleheaderGame).toBe(2);
  });

  it('returns same reference when no doubleheaders exist', () => {
    const picks = [p({ gameId: 'g1' }), p({ gameId: 'g2', matchup: { awayTeam: LAD, homeTeam: COL, startTime: '2026-04-18T19:00:00Z' } })];
    const out = annotateDoubleheaders(picks, { slateDate: '2026-04-18' });
    expect(out).toBe(picks);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// groupByMarketType
// ────────────────────────────────────────────────────────────────────────────
describe('groupByMarketType', () => {
  it('groups matchup cards by market type in ML→RL→Total order', () => {
    const cards = [
      { primary: p({ market: { type: 'total' } }), siblings: [] },
      { primary: p({ market: { type: 'moneyline' } }), siblings: [] },
      { primary: p({ market: { type: 'runline' } }), siblings: [] },
    ];
    const out = groupByMarketType(cards);
    expect(out.map(g => g.marketType)).toEqual(['moneyline', 'runline', 'total']);
    expect(out[0].cards).toHaveLength(1);
  });

  it('puts multiple cards of same market into one group', () => {
    const cards = [
      { primary: p({ gameId: 'g1', market: { type: 'moneyline' } }), siblings: [] },
      { primary: p({ gameId: 'g2', market: { type: 'moneyline' } }), siblings: [] },
    ];
    const out = groupByMarketType(cards);
    expect(out).toHaveLength(1);
    expect(out[0].cards).toHaveLength(2);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// subgroupLabel — product-accurate naming
// ────────────────────────────────────────────────────────────────────────────
describe('subgroupLabel', () => {
  it('uses Pick \'Ems for moneyline in tiers 1 and 2', () => {
    expect(subgroupLabel('moneyline', 'tier1', 2)).toBe("Pick 'Ems");
    expect(subgroupLabel('moneyline', 'tier2', 2)).toBe("Pick 'Ems");
  });
  it('uses Value Leans for moneyline specifically in tier 3', () => {
    expect(subgroupLabel('moneyline', 'tier3', 2)).toBe('Value Leans');
    expect(subgroupLabel('moneyline', 'tier3', 1)).toBe('Value Lean');
  });
  it('uses Spreads for runline', () => {
    expect(subgroupLabel('runline', 'tier1', 3)).toBe('Spreads');
    expect(subgroupLabel('runline', 'tier2', 1)).toBe('Spread');
  });
  it('uses Game Totals for total', () => {
    expect(subgroupLabel('total', 'tier1', 2)).toBe('Game Totals');
    expect(subgroupLabel('total', 'tier2', 1)).toBe('Total');
  });
});
