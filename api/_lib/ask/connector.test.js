import { describe, it, expect, vi } from 'vitest';
import { createNflConnector, callJsonHandler, getConnector } from './connector.js';

const NOW = Date.parse('2026-11-22T18:00:00Z');
const boardAt = (minutesAgo, extra = {}) => ({ generatedAt: new Date(NOW - minutesAgo * 60_000).toISOString(), heroPicks: [], ...extra });

function make(deps) {
  return createNflConnector({
    getSlate: vi.fn(async () => ({ games: [{ gameId: '1' }], week: 12 })),
    getLatestBoard: vi.fn(async () => null),
    buildBoard: vi.fn(async () => ({ board: boardAt(0), source: 'fresh' })),
    getInPlay: vi.fn(async () => ({ picks: [{ id: 'a' }] })),
    getInjuries: vi.fn(async () => ({ teams: { chiefs: [{ name: 'A', position: 'QB', status: 'out', statusLabel: 'Out' }] }, generatedAt: new Date(NOW).toISOString(), ok: true })),
    getStandings: vi.fn(async () => ({ teams: { chiefs: { record: '9-2' } }, generatedAt: new Date(NOW).toISOString() })),
    getScorecard: vi.fn(async () => ({ sport: 'nfl', season: null })),
    now: () => NOW,
    ...deps,
  });
}

describe('picks', () => {
  it('uses a stored board that is fresh, without building', async () => {
    const buildBoard = vi.fn();
    const c = make({ getLatestBoard: async () => boardAt(5), buildBoard });
    expect(await c.picks()).toMatchObject({ stale: false, asOf: NOW - 5 * 60_000 });
    expect(buildBoard).not.toHaveBeenCalled();
  });

  it('builds when the stored board is old', async () => {
    const c = make({ getLatestBoard: async () => boardAt(90) });
    expect(await c.picks()).toMatchObject({ stale: false, asOf: NOW });
  });

  it('falls back to the old board, marked stale, when a build fails or comes back empty', async () => {
    for (const buildBoard of [async () => { throw new Error('feeds down'); }, async () => ({ board: boardAt(0), source: 'empty' })]) {
      const c = make({ getLatestBoard: async () => boardAt(90, { week: 12 }), buildBoard });
      expect(await c.picks()).toMatchObject({ stale: true, board: { week: 12 } });
    }
  });

  it('returns no board, not an error, when there is nothing at all', async () => {
    const c = make({ buildBoard: async () => null });
    expect(await c.picks()).toEqual({ board: null, asOf: null, stale: false });
  });
});

describe('per-turn memo', () => {
  it('makes each call once however many tools ask', async () => {
    const getSlate = vi.fn(async () => ({ games: [], week: 12 }));
    const getInjuries = vi.fn(async () => ({ teams: {}, generatedAt: null, ok: true }));
    const c = make({ getSlate, getInjuries });
    await Promise.all([c.games(), c.games(), c.inPlay(), c.injuries('chiefs'), c.injuries('chiefs'), c.injuries('bills')]);
    expect(getSlate).toHaveBeenCalledTimes(1);
    expect(getInjuries).toHaveBeenCalledTimes(2);
  });
});

describe('other reads', () => {
  it('shapes injuries and standings and flags a delayed feed', async () => {
    const c = make({ getInjuries: async () => ({ teams: {}, generatedAt: null, ok: false }) });
    expect(await c.injuries('chiefs')).toMatchObject({ injuries: [], stale: true, asOf: null });
    expect(await make().injuries('chiefs')).toMatchObject({ summary: { out: 1 }, stale: false });
    expect((await make().standings()).teams.chiefs.record).toBe('9-2');
  });

  it('treats a scorecard that reports an error as no record', async () => {
    expect(await make({ getScorecard: async () => ({ _error: 'query_failed' }) }).record()).toBeNull();
    expect(await make({ getScorecard: async () => { throw new Error('x'); } }).record()).toBeNull();
  });
});

describe('callJsonHandler and getConnector', () => {
  it('runs a route handler in-process and returns its JSON', async () => {
    const handler = (req, res) => res.setHeader('x', 'y').status(200).json({ days: req.query.days, method: req.method });
    expect(await callJsonHandler(handler, { days: '9' })).toEqual({ days: '9', method: 'GET' });
  });

  it('has no connector for a league that is not built', () => {
    expect(() => getConnector('nba')).toThrow(/No Ask Maximus connector/);
  });
});
