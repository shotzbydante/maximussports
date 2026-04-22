/**
 * Tests for getPicksForSlate — the multi-run-safe picks fetcher.
 *
 * Production-bug regression guard: when picks_runs has multiple rows for
 * the same slate_date (concurrent /built calls), settle/scorecard/audit
 * must see ALL picks persisted under that slate_date, not just picks
 * attached to the latest run_id.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

function makeMockAdmin(behavior) {
  return {
    from(table) {
      const b = behavior[table] || {};
      const chain = {
        select() {
          return {
            eq() { return this; },
            then(onF) {
              const r = b.select ? b.select() : { data: [], error: null };
              return Promise.resolve(r).then(onF);
            },
          };
        },
      };
      return chain;
    },
  };
}

vi.mock('./supabaseAdmin.js', () => ({
  getSupabaseAdmin: () => {
    if (globalThis.__MOCK_ADMIN__ == null) {
      const err = new Error('not configured');
      err.code = 'AUTH_UNAVAILABLE';
      throw err;
    }
    return globalThis.__MOCK_ADMIN__;
  },
  getEnvStatus: () => ({
    hasUrl: !!globalThis.__MOCK_ADMIN__,
    hasServiceRoleKey: !!globalThis.__MOCK_ADMIN__,
    urlHost: 'mock',
  }),
}));

async function freshImport() {
  vi.resetModules();
  return import('./picksHistory.js');
}

describe('getPicksForSlate', () => {
  beforeEach(() => { globalThis.__MOCK_ADMIN__ = null; });

  it('dedupes picks by pick_key, keeping the highest bet_score across runs', async () => {
    globalThis.__MOCK_ADMIN__ = makeMockAdmin({
      picks: {
        select: () => ({
          data: [
            // same pick_key persisted twice across two runs (the race)
            { id: 'p1a', pick_key: 'gA-ml-home', run_id: 'run-1', bet_score: 0.62, game_id: 'gA', pick_results: [] },
            { id: 'p1b', pick_key: 'gA-ml-home', run_id: 'run-2', bet_score: 0.81, game_id: 'gA', pick_results: [] },
            { id: 'p2',  pick_key: 'gB-tot-over', run_id: 'run-1', bet_score: 0.70, game_id: 'gB', pick_results: [] },
            { id: 'p3',  pick_key: 'gC-ml-away', run_id: 'run-3', bet_score: 0.55, game_id: 'gC', pick_results: [] },
          ],
          error: null,
        }),
      },
    });
    const { getPicksForSlate } = await freshImport();
    const r = await getPicksForSlate({ sport: 'mlb', slateDate: '2026-04-21' });
    expect(r.picks).toHaveLength(3);
    expect(r.totalRaw).toBe(4);
    expect(r.droppedDuplicates).toBe(1);
    const kept = r.picks.find(p => p.pick_key === 'gA-ml-home');
    expect(kept.id).toBe('p1b');
    expect(kept.bet_score).toBe(0.81);
    expect(r.runIds.size).toBe(3);
  });

  it('returns empty picks when no rows match the slate', async () => {
    globalThis.__MOCK_ADMIN__ = makeMockAdmin({
      picks: { select: () => ({ data: [], error: null }) },
    });
    const { getPicksForSlate } = await freshImport();
    const r = await getPicksForSlate({ sport: 'mlb', slateDate: '2026-04-21' });
    expect(r.picks).toEqual([]);
    expect(r.totalRaw).toBe(0);
  });

  it('gracefully handles Supabase read errors', async () => {
    globalThis.__MOCK_ADMIN__ = makeMockAdmin({
      picks: {
        select: () => ({ data: null, error: { code: '42P01', message: 'relation does not exist' } }),
      },
    });
    const { getPicksForSlate } = await freshImport();
    const r = await getPicksForSlate({ sport: 'mlb', slateDate: '2026-04-21' });
    expect(r.picks).toEqual([]);
    expect(r.totalRaw).toBe(0);
  });

  it('returns empty result when Supabase is unavailable', async () => {
    globalThis.__MOCK_ADMIN__ = null; // triggers getSupabaseAdmin to throw
    const { getPicksForSlate } = await freshImport();
    const r = await getPicksForSlate({ sport: 'mlb', slateDate: '2026-04-21' });
    expect(r.picks).toEqual([]);
    expect(r.totalRaw).toBe(0);
  });
});
