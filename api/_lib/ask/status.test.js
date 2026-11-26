import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sampleWeek, NOW } from './fixtures.js';

vi.mock('../supabaseAdmin.js', () => ({
  verifyUserToken: vi.fn(async (t) => ({ owner: { id: 'u0', email: 'owner@example.com' }, good: { id: 'u1', email: 'fan@example.com' } })[t] || null),
}));
vi.mock('../admin.js', () => ({ isAdminEmail: (e) => e === 'owner@example.com' }));
vi.mock('../nflPicksBuilder.js', () => ({ getLatestNflPicksBoard: vi.fn() }));

const { getLatestNflPicksBoard } = await import('../nflPicksBuilder.js');
const { default: handler, boardSummary } = await import('../../ask/status.js');

function call({ token, method = 'GET' } = {}) {
  const res = { headers: {}, statusCode: 200, body: null, setHeader(k, v) { this.headers[k] = v; return this; }, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
  return handler({ method, headers: token ? { authorization: `Bearer ${token}` } : {} }, res).then(() => res);
}

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = 'k';
  vi.clearAllMocks();
  getLatestNflPicksBoard.mockResolvedValue(sampleWeek().board);
});
afterEach(() => { delete process.env.ANTHROPIC_API_KEY; delete process.env.ASK_ROLLOUT; delete process.env.ASK_PAUSED; });

describe('/api/ask/status', () => {
  it('by default tells only the owner that chat exists, and caches nothing', async () => {
    expect((await call()).body).toEqual({ enabled: false });
    expect((await call({ token: 'good' })).body).toEqual({ enabled: false });
    const owner = await call({ token: 'owner' });
    expect(owner.body).toMatchObject({ enabled: true, week: 'Week 12', picks: 2, games: 3 });
    expect(owner.headers['Cache-Control']).toBe('private, no-store');
    // Nobody but the owner costs a board read.
    expect(getLatestNflPicksBoard).toHaveBeenCalledTimes(1);
  });

  it('once opened, answers everyone the same and lets the edge cache it', async () => {
    process.env.ASK_ROLLOUT = 'all';
    const res = await call();
    expect(res.body).toMatchObject({ enabled: true, picks: 2 });
    expect(res.headers['Cache-Control']).toMatch(/^public, s-maxage=60/);
  });

  it('is off when paused or when there is no API key', async () => {
    process.env.ASK_ROLLOUT = 'all';
    process.env.ASK_PAUSED = '1';
    expect((await call({ token: 'owner' })).body).toEqual({ enabled: false });
    delete process.env.ASK_PAUSED;
    delete process.env.ANTHROPIC_API_KEY;
    expect((await call()).body).toEqual({ enabled: false });
  });

  it('still says enabled when there is no board to describe', async () => {
    process.env.ASK_ROLLOUT = 'all';
    getLatestNflPicksBoard.mockRejectedValue(new Error('kv down'));
    expect((await call()).body).toEqual({ enabled: true });
    expect((await call({ method: 'POST' })).statusCode).toBe(405);
  });
});

describe('boardSummary', () => {
  it('counts recommended picks and games and finds the next kickoff', () => {
    const { board } = sampleWeek();
    const s = boardSummary(board, NOW.getTime());
    expect(s).toMatchObject({ week: 'Week 12', picks: 2, games: 3 });
    expect(Date.parse(s.nextKickoff)).toBeGreaterThan(NOW.getTime());
    expect(boardSummary(board, Date.parse('2030-01-01')).nextKickoff).toBeNull();
    expect(boardSummary(null)).toEqual({});
  });

  it('carries no pick, only counts', () => {
    expect(JSON.stringify(boardSummary(sampleWeek().board, NOW.getTime()))).not.toMatch(/LV|DET|\+3\.5|-110/);
  });
});
