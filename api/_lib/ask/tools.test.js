import { describe, it, expect } from 'vitest';
import { runTool, TOOL_DEFS, DISPLAY_TOOLS, TOOL_STATUS } from './tools.js';
import { fakeConnector, FREE, PRO, newCtx } from './fixtures.js';

const freeOne = () => ({ ...FREE(), picksPerAnswer: 1 });

describe('tool definitions', () => {
  it('gives every read tool an in-character status line and marks the display tools', () => {
    for (const def of TOOL_DEFS) {
      expect(def.input_schema.type).toBe('object');
      if (DISPLAY_TOOLS.has(def.name)) expect(TOOL_STATUS[def.name]).toBeUndefined();
      else expect(TOOL_STATUS[def.name]).toBeTruthy();
    }
    expect(Object.values(TOOL_STATUS).join(' ')).not.toMatch(/search/i);
  });
});

describe('get_picks', () => {
  it('returns recommended picks with price, book and reason, formatted to quote', async () => {
    const { connector } = fakeConnector();
    const out = await runTool('get_picks', {}, newCtx(connector, PRO()));
    expect(out.week).toBe('Week 12');
    expect(out.picks).toHaveLength(2);
    expect(out.picks[0]).toMatchObject({
      id: 'g1-runline-away', pick: 'LV +3.5', market: 'Spread', price: '-110', book: 'betmgm',
      status: 'recommended', conviction: '78 of 100', expected_value: '+3.5%',
    });
    expect(out.picks[0].why).toBeTruthy();
    expect(out.already_kicked_off[0]).toMatchObject({ id: 'live-row-1', standing: 'ahead', score: 'KC 14, SF 10' });
    expect(out.plan_note).toBeUndefined();
  });

  it('adds leans for Pro only when asked, and labels them as leans', async () => {
    const { connector } = fakeConnector();
    const out = await runTool('get_picks', { include_leans: true }, newCtx(connector, PRO()));
    const leans = out.picks.filter((p) => p.status !== 'recommended');
    expect(leans.length).toBeGreaterThan(0);
    expect(leans.every((p) => /lean/.test(p.status))).toBe(true);
    expect(out.picks[0].status).toBe('recommended');
  });

  it('never sends a free account the picks its plan does not include', async () => {
    const { connector, board } = fakeConnector();
    const out = await runTool('get_picks', { include_leans: true }, newCtx(connector, freeOne()));
    expect(out.picks.map((p) => p.id)).toEqual(['g1-runline-away']);
    expect(out.plan_note).toMatch(/1 more recommended pick is reserved for Pro/);
    const text = JSON.stringify(out);
    expect(text).not.toContain('DET -2.5');
    for (const lean of board.trackingPicks) expect(text).not.toContain(`"${lean.id}"`);
  });

  it('filters by market and by team, and says when a team is unknown', async () => {
    const { connector } = fakeConnector();
    const ctx = newCtx(connector, PRO());
    expect((await runTool('get_picks', { market: 'total' }, ctx)).picks).toEqual([]);
    expect((await runTool('get_picks', { team: 'the Lions' }, ctx)).picks.map((p) => p.pick)).toEqual(['DET -2.5']);
    expect((await runTool('get_picks', { team: 'Chiefs' }, ctx)).already_kicked_off).toHaveLength(1);
    expect(await runTool('get_picks', { team: 'Gotham Rogues' }, ctx)).toEqual({ error: 'No NFL team matches "Gotham Rogues".' });
  });

  it('says a pass is a pass when nothing qualifies', async () => {
    const { connector } = fakeConnector({ inPlay: async () => ({ picks: [] }) });
    const out = await runTool('get_picks', { market: 'moneyline' }, newCtx(connector, PRO()));
    expect(out.none).toMatch(/Most games are a pass/);
  });

  it('flags prices that have gone stale', async () => {
    const base = fakeConnector();
    const { connector } = fakeConnector({ picks: async () => ({ board: base.board, asOf: 1, stale: true }) });
    expect((await runTool('get_picks', {}, newCtx(connector, PRO()))).stale).toMatch(/older than 15 minutes/);
  });
});

describe('get_game', () => {
  it('gives Pro the full breakdown, with the projection labelled as a lean', async () => {
    const { connector } = fakeConnector();
    const out = await runTool('get_game', { team: 'KC' }, newCtx(connector, PRO()));
    expect(out).toMatchObject({ game_id: 'g1', spread: 'KC -3', total: '44.5', moneyline: 'KC -160, LV +140', lines_from: 'consensus of 6 books' });
    expect(out.maximus_projection).toMatch(/lean/);
    expect(out.unit_mismatches.length).toBeGreaterThan(0);
    expect(out.home_injuries).toEqual(['Test Tackle (OT): Out, Knee']);
    expect(out.picks_on_this_game[0].pick).toBe('LV +3.5');
  });

  it('withholds the projection and leans from a free account and says why', async () => {
    const { connector } = fakeConnector();
    const out = await runTool('get_game', { team: 'Lions' }, newCtx(connector, freeOne()));
    expect(out.maximus_projection).toBeUndefined();
    expect(out.picks_on_this_game).toEqual([]);
    expect(out.plan_note).toMatch(/reserved for Pro/);
    expect(JSON.stringify(out)).not.toContain('DET -2.5');
  });

  it('covers a game that has kicked off with its score and in-play picks', async () => {
    const { connector } = fakeConnector({ games: async () => ({ games: [(await import('./fixtures.js')).liveGame()], week: 12, asOf: Date.now() }) });
    const out = await runTool('get_game', { team: '49ers' }, newCtx(connector, PRO()));
    expect(out).toMatchObject({ status: 'live', score: 'KC 14, SF 10', clock: 'Q3 8:12' });
    expect(out.picks_already_kicked_off[0].pick).toBe('KC +2.5');
  });

  it('says when a team is not playing', async () => {
    const { connector } = fakeConnector();
    expect((await runTool('get_game', { team: 'Jets' }, newCtx(connector, PRO()))).error).toMatch(/do not play this week/);
  });
});

describe('get_record, get_injuries, get_standings, get_slate', () => {
  it('reports the graded record as quotable strings, wins and losses alike', async () => {
    const { connector } = fakeConnector();
    const out = await runTool('get_record', {}, newCtx(connector, PRO()));
    expect(out.recommended[0]).toEqual({
      span: 'Season', record: '13-9', win_rate: '59.1%', units: '+3.41', return_per_pick: '+15.5%', beat_closing_line: '61.5% of 13 picks',
    });
    expect(out.leans[0].units).toBe('-2.2');
    expect(out.recent_results.map((r) => r.result)).toEqual(['won', 'lost']);
    expect(out.recent_results[0].review).toMatch(/Covered by 7.5/);
  });

  it('says so when the record cannot be read', async () => {
    const { connector } = fakeConnector({ record: async () => null });
    expect((await runTool('get_record', {}, newCtx(connector, PRO()))).error).toBeTruthy();
  });

  it('lists a team\'s injuries and its division', async () => {
    const { connector } = fakeConnector();
    const ctx = newCtx(connector, FREE());
    const inj = await runTool('get_injuries', { team: 'Kansas City Chiefs' }, ctx);
    expect(inj).toMatchObject({ team: 'Kansas City Chiefs', counts: { out: 1 }, players: [{ name: 'Test Tackle', status: 'Out' }] });
    const st = await runTool('get_standings', { team: 'Raiders' }, ctx);
    expect(st.team).toMatchObject({ record: '4-7', division_rank: 4 });
    expect(st.division.map((t) => t.team)).toEqual(['Kansas City Chiefs', 'Las Vegas Raiders']);
    expect((await runTool('get_standings', {}, ctx)).division_leaders.map((t) => t.team)).toEqual(['Kansas City Chiefs']);
  });

  it('lists every game with state and lines', async () => {
    const { connector } = fakeConnector();
    const out = await runTool('get_slate', {}, newCtx(connector, FREE()));
    expect(out.games).toHaveLength(4);
    expect(out.games.find((g) => g.status === 'live')).toMatchObject({ score: 'KC 14, SF 10', spread: 'SF -2.5' });
  });
});

describe('display tools', () => {
  it('builds cards from ids and reports ids it does not know', async () => {
    const { connector } = fakeConnector();
    const ctx = newCtx(connector, PRO());
    const out = await runTool('show_picks', { ids: ['g1-runline-away', 'live-row-1', 'made-up'], followups: ['Why LV?'] }, ctx);
    expect(out).toEqual({ shown: ['g1-runline-away', 'live-row-1'], unknown_ids: ['made-up'] });
    expect(ctx.cards.map((c) => c.id)).toEqual(['g1-runline-away', 'live-row-1']);
    expect(ctx.chips.items).toEqual(['Why LV?']);
  });

  it('will not build a card for a pick outside the plan, even when asked by id', async () => {
    const { connector } = fakeConnector();
    const ctx = newCtx(connector, freeOne());
    const out = await runTool('show_picks', { ids: ['g1-runline-away', 'g3-runline-home'] }, ctx);
    expect(out).toEqual({ shown: ['g1-runline-away'], not_in_plan: 1 });
    expect(ctx.cards.map((c) => c.type)).toEqual(['pick', 'locked']);
    expect(ctx.cards[1]).toEqual({ type: 'locked', id: 'locked', count: 1 });
    expect(JSON.stringify(ctx.cards)).not.toContain('DET');
  });

  it('shows games and the record', async () => {
    const { connector } = fakeConnector();
    const ctx = newCtx(connector, FREE());
    expect(await runTool('show_games', { game_ids: ['g1', 'game-g9', 'zzz'] }, ctx)).toEqual({ shown: ['g1', 'g9'], unknown_ids: ['zzz'] });
    expect(await runTool('show_record', {}, ctx)).toEqual({ shown: ['record'] });
    expect(ctx.cards.map((c) => c.type)).toEqual(['game', 'game', 'record']);
  });
});

describe('runTool', () => {
  it('turns a failed lookup into an error result instead of throwing', async () => {
    const { connector } = fakeConnector({ games: async () => { throw new Error('ESPN down'); } });
    expect(await runTool('get_slate', {}, newCtx(connector, PRO()))).toEqual({ error: expect.stringMatching(/could not pull it up/) });
    expect(await runTool('place_bet', {}, newCtx(connector, PRO()))).toEqual({ error: 'Unknown tool place_bet.' });
  });
});
