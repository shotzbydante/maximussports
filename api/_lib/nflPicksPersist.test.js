import { describe, it, expect, vi, beforeEach } from 'vitest';

const writes = [];
const kv = new Map();
let rejectTracking = false;

vi.mock('./picksHistory.js', () => ({
  writePicksRun: vi.fn(async (payload) => {
    writes.push(payload);
    const tracking = payload.fullSlatePicks.some((p) => p.tier === 'tracking');
    if (tracking && rejectTracking) {
      return {
        ok: false, reason: 'partial', picksAttempted: payload.fullSlatePicks.length, picksInserted: 0,
        failures: [{ code: '23514', message: 'new row for relation "picks" violates check constraint "picks_tier_check"' }],
      };
    }
    return { ok: true, picksAttempted: payload.fullSlatePicks.length, picksInserted: payload.fullSlatePicks.length, failures: [] };
  }),
  getActiveConfig: vi.fn(async () => null),
  getLatestGradedScorecard: vi.fn(async () => null),
}));

vi.mock('../_globalCache.js', () => ({
  getJson: vi.fn(async (k) => kv.get(k) ?? null),
  setJson: vi.fn(async (k, v) => { kv.set(k, v); }),
}));

const soon = (h) => new Date(Date.now() + h * 3_600_000).toISOString();
const pick = (id, tier, role, startTime) => ({ id, tier, pickRole: role, matchup: { startTime } });

function board(startTime) {
  const hero = [pick('g1-runline-home', 'tier1', 'hero', startTime), pick('g2-total-over', 'tier3', 'hero', startTime)];
  const tracking = [pick('g1-total-under', 'tracking', 'tracking', startTime), pick('g2-runline-away', 'tracking', 'tracking', startTime)];
  return {
    sport: 'nfl', week: 12, modelVersion: 'm', configVersion: 'c', generatedAt: new Date().toISOString(), meta: {},
    tiers: { tier1: [hero[0]], tier2: [], tier3: [hero[1]] },
    fullSlatePicks: [tracking[0], hero[0], tracking[1], hero[1]],
  };
}

describe('NFL picks persistence', () => {
  beforeEach(() => {
    writes.length = 0;
    kv.clear();
    rejectTracking = false;
    vi.resetModules();
  });

  it('writes recommended picks first, in their own run, then tracking picks', async () => {
    const { persistBoard } = await import('./nflPicksBuilder.js');
    await persistBoard(board(soon(20)));
    expect(writes).toHaveLength(2);
    expect(writes[0].meta.part).toBe('recommended');
    expect(writes[0].fullSlatePicks.map((p) => p.tier)).toEqual(['tier1', 'tier3']);
    expect(writes[1].meta.part).toBe('tracking');
    expect(writes[1].fullSlatePicks.every((p) => p.tier === 'tracking')).toBe(true);
  });

  it('throttles repeat writes for the same slate', async () => {
    const { persistBoard } = await import('./nflPicksBuilder.js');
    const b = board(soon(20));
    await persistBoard(b);
    await persistBoard(b);
    expect(writes).toHaveLength(2);
  });

  it('skips games outside the 36 hour window', async () => {
    const { persistBoard } = await import('./nflPicksBuilder.js');
    await persistBoard(board(soon(60)));
    expect(writes).toHaveLength(0);
  });

  it('stops retrying tracking writes when the database rejects the tier, and keeps recommended picks', async () => {
    rejectTracking = true;
    const first = await import('./nflPicksBuilder.js');
    await first.persistBoard(board(soon(20)));
    expect(writes.map((w) => w.meta.part)).toEqual(['recommended', 'tracking']);

    // A fresh instance (cold start) reads the verdict from the shared cache.
    vi.resetModules();
    writes.length = 0;
    const second = await import('./nflPicksBuilder.js');
    await second.persistBoard(board(soon(20)));
    expect(writes.map((w) => w.meta.part)).toEqual(['recommended']);
  });
});
