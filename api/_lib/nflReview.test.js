import { describe, it, expect, vi, beforeEach } from 'vitest';

const state = { picks: [], artifacts: [], kv: new Map(), written: [], closes: new Map() };

vi.mock('../_globalCache.js', () => ({
  getJson: async (k) => state.kv.get(k) ?? null,
  setJson: async (k, v) => { state.kv.set(k, JSON.parse(JSON.stringify(v))); },
}));
vi.mock('./supabaseAdmin.js', () => ({
  getSupabaseAdmin: () => ({
    from: () => {
      const f = {};
      const q = {
        select: () => q, eq: () => q, order: () => q,
        gte: (_c, v) => { f.from = v; return q; },
        lte: (_c, v) => { f.to = v; return q; },
        limit: async () => ({ data: state.artifacts.filter((r) => r.slate_date >= f.from && r.slate_date <= f.to), error: null }),
      };
      return q;
    },
  }),
}));
vi.mock('./picksHistory.js', () => ({
  writeAuditArtifact: async (row) => {
    state.written.push(row);
    state.artifacts = [...state.artifacts.filter((r) => r.slate_date !== row.slate_date), row];
    return { id: 'a1' };
  },
  getActiveConfig: async () => null,
}));
vi.mock('./nflPicksStore.js', () => ({
  getNflPicks: async ({ from }) => ({ ok: true, picks: state.picks.filter((p) => p.slate_date === from) }),
  getLineSnapshots: async () => state.closes,
}));
vi.mock('./nflTalent.js', () => ({
  getNflTalent: async () => ({
    teams: {
      KC: { Quarterback: 95, 'Pass protection': 85, Receivers: 85, 'Run game': 85, 'Pass defense': 88, 'Pass rush': 88, Coverage: 88, 'Run defense': 88, 'Overall talent': 88 },
      ARI: { Quarterback: 70, 'Pass protection': 75, Receivers: 75, 'Run game': 75, 'Pass defense': 74, 'Pass rush': 74, Coverage: 74, 'Run defense': 74, 'Overall talent': 74 },
    },
  }),
}));

const { saveGameContexts, getGameContext, reviewNflSlate, getReviewNotes, getReviewLedger, seasonStart } = await import('./nflReview.js');
const { slateWork } = await import('../cron/nfl/review-games.js');

const stat = (name, displayValue) => ({ name, displayValue });
const summary = {
  boxscore: { teams: [
    { team: { id: '22' }, homeAway: 'away', statistics: [stat('totalYards', '205'), stat('turnovers', '0'), stat('redZoneAttempts', '1-1'), stat('possessionTime', '27:34')] },
    { team: { id: '12' }, homeAway: 'home', statistics: [stat('totalYards', '435'), stat('turnovers', '0'), stat('redZoneAttempts', '3-5'), stat('possessionTime', '32:26')] },
  ] },
};
const row = (id, over = {}) => ({
  id, game_id: '401', slate_date: '2026-11-22', start_time: '2026-11-22T18:00:00Z', locked_at: '2026-11-22T04:00:00Z',
  home_team_slug: 'chiefs', away_team_slug: 'cardinals', market_type: 'total', selection_side: 'under',
  line_value: '40.5', price_american: -105, tier: 'tier2', book: 'DraftKings', expected_value: '0.047',
  rationale: { pickRole: 'hero', headline: 'Under 40.5' },
  pick_results: [{ status: 'won', final_home_score: 24, final_away_score: 10, units: 0.952 }],
  ...over,
});

beforeEach(() => {
  state.picks = []; state.artifacts = []; state.kv = new Map(); state.written = [];
  state.closes = new Map([['401', { spread_home: '-15.5', total: '40.5', fair_margin: '15.25', fair_total: '40.38', fair_home_win: '0.932' }]]);
});

describe('saveGameContexts', () => {
  it('saves games that have not kicked off, and only those', async () => {
    const now = new Date('2026-11-22T17:50:00Z');
    const out = await saveGameContexts([
      { gameId: '401', startTime: '2026-11-22T18:00:00Z', homeTeam: { shortName: 'KC' }, awayTeam: { shortName: 'ARI' }, market: { spreadHome: -15.5, total: 40.5 } },
      { gameId: '400', startTime: '2026-11-22T17:00:00Z', homeTeam: { shortName: 'A' }, awayTeam: { shortName: 'B' } },
    ], { now });
    expect(out.saved).toBe(1);
    expect((await getGameContext('401')).home).toBe('KC');
    expect(await getGameContext('400')).toBeNull();
  });
});

describe('reviewNflSlate', () => {
  it('reviews graded picks, stores them, and leaves the engine alone', async () => {
    state.picks = [
      row('p1'),
      row('p2', { market_type: 'runline', selection_side: 'away', line_value: '15.5', price_american: -108, tier: 'tracking', rationale: { pickRole: 'tracking' }, expected_value: '-0.027',
        pick_results: [{ status: 'won', final_home_score: 24, final_away_score: 10, units: 0.926 }] }),
      row('p3', { game_id: '402', pick_results: [{ status: 'pending' }] }),
    ];
    const out = await reviewNflSlate({ slateDate: '2026-11-22', loadSummary: async () => summary });
    expect(out).toMatchObject({ ok: true, reviewed: 2, total: 2, games: 1, boxScores: 1, partialContext: 1 });
    const saved = state.written[0];
    expect(saved.sport).toBe('nfl');
    expect(saved.recommended_deltas).toEqual({});            // a review never proposes a change
    expect(saved.summary.kind).toBe('post_game_review');
    expect(saved.summary.reviews.map((r) => r.pickId)).toEqual(['p1', 'p2']);
    expect(saved.summary.reviews[0].verdict).toBe('bad_number_won');
    // No pre-game record was saved, so roster talent is rebuilt and graded: KC did not cover 15.5.
    expect(saved.summary.signals).toEqual([expect.objectContaining({ signal: 'talent', team: 'KC', status: 'lost' })]);
    expect(saved.signal_attribution.recommended[0]).toMatchObject({ results: 1, status: 'logging' });
    expect(out.findings.at(-1)).toMatch(/The engine is unchanged/);
  });

  it('does nothing the second time, and adds a game that finishes later', async () => {
    state.picks = [row('p1')];
    await reviewNflSlate({ slateDate: '2026-11-22', loadSummary: async () => summary });
    const again = await reviewNflSlate({ slateDate: '2026-11-22', loadSummary: async () => { throw new Error('should not fetch'); } });
    expect(again).toMatchObject({ reviewed: 0, note: 'already reviewed' });
    expect(state.written).toHaveLength(1);

    state.picks.push(row('p9', { game_id: '409', home_team_slug: 'bears', away_team_slug: 'saints', line_value: '49',
      pick_results: [{ status: 'lost', final_home_score: 31, final_away_score: 27, units: -1 }] }));
    // No summary yet, an hour after the final: the game waits.
    const soon = await reviewNflSlate({ slateDate: '2026-11-22', loadSummary: async () => null, now: Date.parse('2026-11-22T22:00:00Z') });
    expect(soon).toMatchObject({ reviewed: 0, waiting: 1, note: 'box scores not final yet' });
    expect(state.written).toHaveLength(1);
    // Still none eight hours after kickoff: reviewed without a box score.
    const later = await reviewNflSlate({ slateDate: '2026-11-22', loadSummary: async () => null, now: Date.parse('2026-11-23T02:30:00Z') });
    expect(later).toMatchObject({ reviewed: 1, total: 2, boxScores: 0 });
    expect(state.written[1].summary.reviews.map((r) => r.pickId)).toEqual(['p1', 'p9']);
    expect(state.written[1].summary.reviews[1].play).toBeNull();          // no box score: still reviewed
  });

  it('uses the saved pre-game record when there is one', async () => {
    state.kv.set('nfl:review:context:401', {
      gameId: '401', week: 11, startTime: '2026-11-22T18:00:00Z', home: 'KC', away: 'ARI',
      model: { margin: 11.2, total: 43.2 }, indoor: false, wind: 15, talent: { leansTo: 'KC' }, spots: [],
    });
    state.picks = [row('p1')];
    const out = await reviewNflSlate({ slateDate: '2026-11-22', loadSummary: async () => summary });
    expect(out.partialContext).toBe(0);
    expect(state.written[0].summary.signals.map((s) => s.signal).sort()).toEqual(['ratings_side', 'ratings_side_3plus', 'ratings_total', 'talent', 'wind_under']);
    expect(state.written[0].summary.reviews[0].week).toBe(11);
  });

  it('waits when ESPN is still serving a box score from earlier in the game', async () => {
    const halftime = { boxscore: { teams: [
      { team: { id: '22' }, homeAway: 'away', statistics: [stat('totalYards', '128'), stat('possessionTime', '11:58')] },
      { team: { id: '12' }, homeAway: 'home', statistics: [stat('totalYards', '183'), stat('possessionTime', '16:11')] },
    ] } };
    state.picks = [row('p1')];
    const out = await reviewNflSlate({ slateDate: '2026-11-22', loadSummary: async () => halftime, now: Date.parse('2026-11-22T21:30:00Z') });
    expect(out).toMatchObject({ reviewed: 0, waiting: 1 });
    expect(state.written).toHaveLength(0);
    const next = await reviewNflSlate({ slateDate: '2026-11-22', loadSummary: async () => summary, now: Date.parse('2026-11-22T22:00:00Z') });
    expect(next).toMatchObject({ reviewed: 1, boxScores: 1, waiting: 0 });
  });

  it('reports nothing to do before any pick is graded', async () => {
    state.picks = [row('p3', { pick_results: [{ status: 'pending' }] })];
    expect(await reviewNflSlate({ slateDate: '2026-11-22' })).toMatchObject({ ok: true, reviewed: 0, note: 'nothing graded yet' });
    expect(state.written).toHaveLength(0);
  });
});

describe('reading reviews back', () => {
  it('gives notes by pick and a season ledger', async () => {
    state.picks = [row('p1')];
    await reviewNflSlate({ slateDate: '2026-11-22', loadSummary: async () => summary });
    const notes = await getReviewNotes({ from: '2026-11-15', to: '2026-11-23' });
    expect(notes.get('p1').note).toMatch(/^Won by 6\.5 points\./);
    const { ledger, slates, from } = await getReviewLedger({ to: '2026-11-23' });
    expect(from).toBe('2026-08-01');
    expect(slates).toBe(1);
    expect(ledger.recommended[0].results).toBe(1);
  });
  it('puts January in the season that started the year before', () => {
    expect(seasonStart('2027-01-10')).toBe('2026-08-01');
    expect(seasonStart('2026-11-22')).toBe('2026-08-01');
  });
});

describe('slateWork', () => {
  const now = Date.parse('2026-11-22T21:00:00Z');
  const pending = (id, start) => ({ id, start_time: start, pick_results: [] });
  it('waits until a game has had time to finish', () => {
    expect(slateWork({ picks: [pending('a', '2026-11-22T18:30:00Z')], now })).toMatchObject({ settle: false, review: false });
    expect(slateWork({ picks: [pending('a', '2026-11-22T18:00:00Z')], now })).toMatchObject({ settle: true, review: true, due: 1 });
  });
  it('reviews graded picks that have no review yet, and nothing else', () => {
    const graded = { id: 'g', start_time: '2026-11-22T18:00:00Z', pick_results: [{ status: 'won' }] };
    expect(slateWork({ picks: [graded], now })).toMatchObject({ settle: false, review: true, unreviewed: 1 });
    expect(slateWork({ picks: [graded], reviewedIds: new Set(['g']), now })).toMatchObject({ settle: false, review: false });
  });
});
