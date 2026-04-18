/**
 * Tests for the v2 child-rows fan-out in writePicksRun().
 *
 * These pin every path that moved the persistence from "0/13 inserted silently"
 * to "exact row-level diagnostics, structured summary".
 *
 * We exercise the public writePicksRun() by injecting a mock Supabase admin
 * client via the SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY env vars and a
 * monkey-patched @supabase/supabase-js createClient.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { buildPickRow } from './picksHistory.js';

// ────────────────────────────────────────────────────────────────────────────
// buildPickRow: pure preflight validation
// ────────────────────────────────────────────────────────────────────────────

function goodPick(overrides = {}) {
  return {
    id: 'g1-moneyline-away',
    gameId: 'g1',
    tier: 'tier1',
    market: { type: 'moneyline', line: null, priceAmerican: -135 },
    selection: { side: 'away', team: 'NYY', label: 'NYY -135' },
    matchup: {
      awayTeam: { slug: 'nyy', name: 'Yankees', shortName: 'NYY' },
      homeTeam: { slug: 'bos', name: 'Red Sox', shortName: 'BOS' },
      startTime: '2026-04-18T18:00:00Z',
    },
    betScore: { total: 0.82, components: { edgeStrength: 0.7, modelConfidence: 0.6, situationalEdge: 0.5, marketQuality: 0.8 } },
    modelProb: 0.58, impliedProb: 0.54, rawEdge: 0.04,
    model: { dataQuality: 0.76, signalAgreement: 0.8 },
    rationale: { headline: 'NYY undervalued', bullets: ['Projected wins +6'] },
    pick: { topSignals: ['Rotation quality (strong away edge)'] },
    ...overrides,
  };
}

const META = {
  runId: '00000000-0000-0000-0000-000000000001',
  sport: 'mlb',
  slateDate: '2026-04-18',
  modelVersion: 'mlb-picks-v2.0.0',
  configVersion: 'mlb-picks-tuning-2026-04-17a',
};

describe('buildPickRow — preflight validation', () => {
  it('maps a good pick into a row with no issues', () => {
    const { row, issues } = buildPickRow({ pick: goodPick(), ...META });
    expect(issues).toEqual([]);
    expect(row.run_id).toBe(META.runId);
    expect(row.sport).toBe('mlb');
    expect(row.slate_date).toBe('2026-04-18');
    expect(row.game_id).toBe('g1');
    expect(row.pick_key).toBe('g1-moneyline-away');
    expect(row.tier).toBe('tier1');
    expect(row.market_type).toBe('moneyline');
    expect(row.selection_side).toBe('away');
    expect(row.away_team_slug).toBe('nyy');
    expect(row.home_team_slug).toBe('bos');
    expect(row.bet_score).toBe(0.82);
    expect(row.bet_score_components).toBeTypeOf('object');
    expect(row.rationale).toEqual({ headline: 'NYY undervalued', bullets: ['Projected wins +6'] });
    expect(row.top_signals).toEqual(['Rotation quality (strong away edge)']);
  });

  it('flags a pick with no tier assigned', () => {
    const p = goodPick({ tier: null });
    const { issues } = buildPickRow({ pick: p, ...META });
    expect(issues.some(s => /tier/.test(s))).toBe(true);
  });

  it('flags a pick with missing team slug', () => {
    const p = goodPick();
    p.matchup.homeTeam.slug = null;
    const { issues } = buildPickRow({ pick: p, ...META });
    expect(issues.some(s => /home_team_slug/.test(s))).toBe(true);
  });

  it('flags a pick with invalid tier', () => {
    const p = goodPick({ tier: 'tierX' });
    const { issues } = buildPickRow({ pick: p, ...META });
    expect(issues.some(s => /invalid tier/.test(s))).toBe(true);
  });

  it('flags a pick with invalid market_type', () => {
    const p = goodPick();
    p.market.type = 'parlay';
    const { issues } = buildPickRow({ pick: p, ...META });
    expect(issues.some(s => /invalid market_type/.test(s))).toBe(true);
  });

  it('flags a pick missing market.type entirely', () => {
    const p = goodPick();
    p.market.type = null;
    const { issues } = buildPickRow({ pick: p, ...META });
    expect(issues.some(s => /missing market_type/.test(s))).toBe(true);
  });

  it('keeps null-able fields null without issue', () => {
    const p = goodPick({ modelProb: null, impliedProb: null, rawEdge: null });
    p.matchup.startTime = null;
    const { row, issues } = buildPickRow({ pick: p, ...META });
    expect(issues).toEqual([]);
    expect(row.model_prob).toBeNull();
    expect(row.start_time).toBeNull();
  });

  it('bet_score defaults to 0 when missing', () => {
    const p = goodPick();
    p.betScore = null;
    const { row, issues } = buildPickRow({ pick: p, ...META });
    expect(issues).toEqual([]); // bet_score NOT NULL but default 0
    expect(row.bet_score).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// writePicksRun: fan-out behavior via mocked Supabase client
// ────────────────────────────────────────────────────────────────────────────

/**
 * Build a mock Supabase admin client with programmable behavior per table.
 *
 *   behavior = {
 *     picks_runs: { insert: () => ({ data: { id: '...' }, error: null }) },
 *     picks: { insert: (rows) => ({ data: [...], error: null }) }
 *   }
 *
 * Per-row insert fallback uses `.insert(row)` (single row) which we also handle.
 */
function makeMockSupabase(behavior) {
  return {
    from(table) {
      const b = behavior[table] || {};
      return {
        insert(body) {
          // Two shapes: batch (.insert(rows).select(...)) or per-row (.insert(row))
          const isBatch = Array.isArray(body);
          const chain = {
            select(/* cols */) {
              return {
                single: async () => b.insertSingle
                  ? b.insertSingle(body)
                  : { data: { id: 'run-uuid' }, error: null },
                then: function (onF) {
                  const r = b.insertSelect
                    ? b.insertSelect(body)
                    : { data: body.map((_, i) => ({ id: `pk-${i}` })), error: null };
                  return Promise.resolve(r).then(onF);
                },
              };
            },
            then(onF) {
              // Used by per-row insert fallback: `.insert(row)` without .select()
              const r = !isBatch && b.perRow
                ? b.perRow(body)
                : { data: null, error: null };
              return Promise.resolve(r).then(onF);
            },
          };
          return chain;
        },
      };
    },
  };
}

/**
 * Inject the mock admin client by mocking the supabaseAdmin module.
 * Each test file gets its own mock spec.
 */
vi.mock('./supabaseAdmin.js', () => ({
  getSupabaseAdmin: () => globalThis.__MOCK_SUPABASE__,
  getEnvStatus: () => ({ hasUrl: true, hasServiceRoleKey: true, urlHost: 'mock' }),
}));

async function importFresh() {
  // Dynamic re-import so each test can tweak globalThis.__MOCK_SUPABASE__
  // The mock above is module-scoped, but getSupabaseAdmin() reads at call time.
  vi.resetModules();
  const mod = await import('./picksHistory.js');
  return mod;
}

function payloadWithPublished(n, tier = 'tier1') {
  const tiers = { tier1: [], tier2: [], tier3: [] };
  for (let i = 0; i < n; i++) {
    const p = goodPick({
      id: `g${i}-moneyline-away`,
      gameId: `g${i}`,
      tier,
    });
    tiers[tier].push(p);
  }
  return {
    sport: 'mlb',
    date: '2026-04-18',
    modelVersion: 'mlb-picks-v2.0.0',
    configVersion: 'mlb-picks-tuning-2026-04-17a',
    generatedAt: new Date().toISOString(),
    tiers,
    meta: { picksPublished: n },
  };
}

describe('writePicksRun — fan-out happy path', () => {
  beforeEach(() => { globalThis.__MOCK_SUPABASE__ = null; });

  it('returns ok=true when batch insert succeeds for all rows', async () => {
    globalThis.__MOCK_SUPABASE__ = makeMockSupabase({
      picks_runs: { insertSingle: () => ({ data: { id: 'run-42' }, error: null }) },
      picks: {
        insertSelect: (rows) => ({ data: rows.map((_, i) => ({ id: `pk-${i}`, pick_key: rows[i].pick_key })), error: null }),
      },
    });
    const { writePicksRun } = await importFresh();
    const summary = await writePicksRun(payloadWithPublished(13));
    expect(summary.ok).toBe(true);
    expect(summary.runInserted).toBe(true);
    expect(summary.runId).toBe('run-42');
    expect(summary.picksAttempted).toBe(13);
    expect(summary.picksInserted).toBe(13);
    expect(summary.picksFailed).toBe(0);
    expect(summary.picksSkipped).toBe(0);
  });

  it('returns ok=true with empty tiers when picksPublished=0', async () => {
    globalThis.__MOCK_SUPABASE__ = makeMockSupabase({
      picks_runs: { insertSingle: () => ({ data: { id: 'run-43' }, error: null }) },
      picks: { insertSelect: () => ({ data: [], error: null }) },
    });
    const { writePicksRun } = await importFresh();
    const summary = await writePicksRun(payloadWithPublished(0));
    expect(summary.ok).toBe(true);
    expect(summary.picksAttempted).toBe(0);
    expect(summary.picksInserted).toBe(0);
  });
});

describe('writePicksRun — fan-out failure paths', () => {
  beforeEach(() => { globalThis.__MOCK_SUPABASE__ = null; });

  it('parent insert failure short-circuits everything', async () => {
    globalThis.__MOCK_SUPABASE__ = makeMockSupabase({
      picks_runs: { insertSingle: () => ({ data: null, error: { code: '42P01', message: 'relation does not exist' } }) },
    });
    const { writePicksRun } = await importFresh();
    const summary = await writePicksRun(payloadWithPublished(5));
    expect(summary.ok).toBe(false);
    expect(summary.runInserted).toBe(false);
    expect(summary.reason).toBe('missing_table');
    expect(summary.picksAttempted).toBe(0);
  });

  it('batch insert error triggers per-row fallback (every row fails)', async () => {
    globalThis.__MOCK_SUPABASE__ = makeMockSupabase({
      picks_runs: { insertSingle: () => ({ data: { id: 'run-44' }, error: null }) },
      picks: {
        insertSelect: () => ({ data: null, error: { code: '23502', message: 'null value in column violates not-null constraint' } }),
        perRow: () => ({ data: null, error: { code: '23502', message: 'null value' } }),
      },
    });
    const { writePicksRun } = await importFresh();
    const summary = await writePicksRun(payloadWithPublished(3));
    expect(summary.ok).toBe(false);
    expect(summary.runInserted).toBe(true);
    expect(summary.picksAttempted).toBe(3);
    expect(summary.picksInserted).toBe(0);
    expect(summary.picksFailed).toBe(3);
    expect(summary.reason).toBe('all_picks_failed');
    expect(summary.failures.length).toBe(3);
    expect(summary.failures[0]).toHaveProperty('pick_key');
    expect(summary.failures[0]).toHaveProperty('code', '23502');
  });

  it('batch returns fewer rows than sent — falls back and records partial', async () => {
    let perRowCalls = 0;
    globalThis.__MOCK_SUPABASE__ = makeMockSupabase({
      picks_runs: { insertSingle: () => ({ data: { id: 'run-45' }, error: null }) },
      picks: {
        // Batch reports success for only 1 of 3 (anomaly)
        insertSelect: () => ({ data: [{ id: 'a', pick_key: 'g0-moneyline-away' }], error: null }),
        // Per-row fallback: 2 succeed, 1 fails
        perRow: (_row) => {
          perRowCalls += 1;
          return perRowCalls === 2
            ? { data: null, error: { code: '23505', message: 'duplicate' } }
            : { data: null, error: null };
        },
      },
    });
    const { writePicksRun } = await importFresh();
    const summary = await writePicksRun(payloadWithPublished(3));
    expect(summary.runInserted).toBe(true);
    expect(summary.picksAttempted).toBe(3);
    expect(summary.picksInserted).toBe(2);
    expect(summary.picksFailed).toBe(1);
    expect(summary.reason).toBe('partial_failure');
  });

  it('pre-flight rejects picks with missing required fields before DB', async () => {
    let dbCalls = 0;
    globalThis.__MOCK_SUPABASE__ = makeMockSupabase({
      picks_runs: { insertSingle: () => ({ data: { id: 'run-46' }, error: null }) },
      picks: {
        insertSelect: (rows) => {
          dbCalls += 1;
          // Only the valid rows should reach DB
          return { data: rows.map((_, i) => ({ id: `pk-${i}`, pick_key: rows[i].pick_key })), error: null };
        },
      },
    });
    // Build a payload where one pick is invalid (no tier)
    const payload = payloadWithPublished(2);
    payload.tiers.tier1[1].tier = null;
    const { writePicksRun } = await importFresh();
    const summary = await writePicksRun(payload);
    expect(summary.picksAttempted).toBe(2);
    expect(summary.picksSkipped).toBe(1);
    expect(summary.picksInserted).toBe(1); // only the valid one
    expect(summary.picksFailed).toBe(1);
    expect(summary.ok).toBe(false);
    expect(dbCalls).toBe(1);
    expect(summary.failures[0].kind).toBe('preflight_invalid');
  });

  it('parent row succeeds but all children rejected pre-flight → summary reflects reality', async () => {
    globalThis.__MOCK_SUPABASE__ = makeMockSupabase({
      picks_runs: { insertSingle: () => ({ data: { id: 'run-47' }, error: null }) },
      picks: { insertSelect: () => ({ data: [], error: null }) },
    });
    const payload = payloadWithPublished(3);
    for (const p of payload.tiers.tier1) p.matchup.awayTeam.slug = null;
    const { writePicksRun } = await importFresh();
    const summary = await writePicksRun(payload);
    expect(summary.runInserted).toBe(true);
    expect(summary.picksInserted).toBe(0);
    expect(summary.picksSkipped).toBe(3);
    expect(summary.ok).toBe(false);
    expect(summary.reason).toBe('all_picks_failed');
  });

  it('no_supabase when admin client unavailable', async () => {
    globalThis.__MOCK_SUPABASE__ = undefined;
    // Re-mock to throw
    vi.doMock('./supabaseAdmin.js', () => ({
      getSupabaseAdmin: () => { const err = new Error('not configured'); err.code = 'AUTH_UNAVAILABLE'; throw err; },
      getEnvStatus: () => ({ hasUrl: false, hasServiceRoleKey: false }),
    }));
    const { writePicksRun } = await importFresh();
    const summary = await writePicksRun(payloadWithPublished(5));
    expect(summary.ok).toBe(false);
    expect(summary.reason).toBe('no_supabase');
    expect(summary.runInserted).toBe(false);
    vi.doUnmock('./supabaseAdmin.js');
  });
});
