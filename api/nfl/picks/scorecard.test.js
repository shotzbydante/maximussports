import { describe, it, expect, vi, beforeEach } from 'vitest';

const state = { picks: [], cards: [], games: [], picksOk: true };

vi.mock('../../_lib/supabaseAdmin.js', () => ({
  getSupabaseAdmin: () => ({
    from: () => {
      const q = {
        select: () => q,
        eq: () => q,
        order: () => q,
        limit: () => Promise.resolve({ data: state.cards, error: null }),
      };
      return q;
    },
  }),
}));

vi.mock('../../_lib/nflPicksStore.js', () => ({
  getNflPicks: async () => (state.picksOk
    ? { ok: true, picks: state.picks, totalRaw: state.picks.length, droppedDuplicates: 0 }
    : { ok: false, picks: [], error: 'boom' }),
}));

vi.mock('../../_lib/nflSlate.js', () => ({
  getNflSlate: async () => ({ week: 11, games: state.games }),
}));

vi.mock('../../_lib/dateWindows.js', () => ({ todayET: () => '2026-11-23' }));

const { default: handler } = await import('./scorecard.js');

function call(query = {}, method = 'GET') {
  return new Promise((resolve) => {
    const res = {
      statusCode: 200,
      setHeader() {},
      status(c) { this.statusCode = c; return this; },
      json(body) { resolve({ status: this.statusCode, body }); return this; },
    };
    handler({ method, query }, res);
  });
}

const pick = (over = {}) => ({
  id: 'p1',
  slate_date: '2026-11-22',
  game_id: 'g1',
  market_type: 'runline',
  selection_side: 'home',
  line_value: -3,
  price_american: -110,
  away_team_slug: 'chiefs',
  home_team_slug: 'lions',
  bet_score: 0.71,
  tier: 'tier2',
  rationale: { pickRole: 'hero' },
  pick_results: [],
  ...over,
});

const finalGame = (gameId, away, home) => ({
  gameId,
  status: 'final',
  gameState: { isFinal: true },
  teams: { away: { score: away }, home: { score: home } },
});

describe('GET /api/nfl/picks/scorecard', () => {
  beforeEach(() => {
    state.picks = [];
    state.cards = [];
    state.games = [];
    state.picksOk = true;
  });

  it('rejects non-GET requests', async () => {
    const { status } = await call({}, 'POST');
    expect(status).toBe(405);
  });

  it('returns an empty, well-formed scorecard when nothing is stored', async () => {
    const { status, body } = await call();
    expect(status).toBe(200);
    expect(body.sport).toBe('nfl');
    expect(body.window).toEqual({ from: '2026-11-15', to: '2026-11-23', days: 9 });
    expect(body.slates).toEqual([]);
    expect(body.season).toBeNull();
    expect(body.record).toEqual({ won: 0, lost: 0, push: 0, pending: 0 });
  });

  it('clamps the window to between 2 and 21 days', async () => {
    expect((await call({ days: '1' })).body.window.days).toBe(2);
    expect((await call({ days: '90' })).body.window.days).toBe(21);
  });

  it('uses the settled result when the cron has graded the pick', async () => {
    state.picks = [pick({ pick_results: [{ status: 'lost', final_away_score: 27, final_home_score: 20 }] })];
    // A conflicting live final must not override the stored grade.
    state.games = [finalGame('g1', 10, 30)];
    const { body } = await call();
    const row = body.slates[0].picks[0];
    expect(row.status).toBe('lost');
    expect(row.provisional).toBe(false);
    expect(row.finalScore).toBe('KC 27, DET 20');
    expect(body.record).toEqual({ won: 0, lost: 1, push: 0, pending: 0 });
  });

  it('grades a pending pick at read time once its game is final, and marks it provisional', async () => {
    state.picks = [pick()];
    state.games = [finalGame('g1', 17, 24)]; // home wins by 7, covers -3
    const { body } = await call();
    const row = body.slates[0].picks[0];
    expect(row.status).toBe('won');
    expect(row.provisional).toBe(true);
    expect(row.label).toBe('DET -3');
    expect(body.byMarket.runline.won).toBe(1);
    expect(body.byPickRole.hero.won).toBe(1);
  });

  it('leaves a pick pending while its game is still in progress', async () => {
    state.picks = [pick()];
    state.games = [{ gameId: 'g1', status: 'in_progress', gameState: { isFinal: false }, teams: { away: { score: 3 }, home: { score: 7 } } }];
    const { body } = await call();
    expect(body.slates[0].picks[0].status).toBe('pending');
    expect(body.record.pending).toBe(1);
  });

  it('groups by kickoff date, newest first, with hero picks ahead of tracking picks', async () => {
    state.picks = [
      pick({ id: 'a', slate_date: '2026-11-19', game_id: 'g0', pick_results: [{ status: 'won' }] }),
      pick({ id: 'b', game_id: 'g2', tier: 'tracking', rationale: { pickRole: 'tracking' }, bet_score: 0.5, market_type: 'total', selection_side: 'under', line_value: 46.5 }),
      pick({ id: 'c', game_id: 'g3', bet_score: 0.6 }),
      pick({ id: 'd', game_id: 'g4', bet_score: 0.75 }),
    ];
    const { body } = await call();
    expect(body.slates.map((s) => s.date)).toEqual(['2026-11-22', '2026-11-19']);
    expect(body.slates[0].picks.map((p) => p.id)).toEqual(['d', 'c', 'b']);
    expect(body.slates[0].picks[2].label).toBe('Under 46.5');
    expect(body.slates[1].record.won).toBe(1);
    expect(body.byPickRole.tracking.pending).toBe(1);
  });

  it('sums the season record from stored daily scorecards', async () => {
    state.cards = [
      { slate_date: '2026-11-15', record: { won: 5, lost: 3, push: 1 }, by_market: { runline: { won: 3, lost: 1, push: 1 }, total: { won: 2, lost: 2, push: 0 } }, by_pick_role: { hero: { won: 4, lost: 2, push: 0 } } },
      { slate_date: '2026-11-08', record: { won: 4, lost: 4, push: 0 }, by_market: { moneyline: { won: 1, lost: 1, push: 0 } }, by_pick_role: {} },
    ];
    const { body } = await call();
    expect(body.season.record).toEqual({ won: 9, lost: 7, push: 1, pending: 0 });
    expect(body.season.byMarket.runline.won).toBe(3);
    expect(body.season.slates).toBe(2);
    expect(body.season.lastGradedDate).toBe('2026-11-15');
  });

  it('reports a query failure without throwing', async () => {
    state.picksOk = false;
    const { status, body } = await call();
    expect(status).toBe(200);
    expect(body._error).toBe('query_failed');
    expect(body.slates).toEqual([]);
  });
});
