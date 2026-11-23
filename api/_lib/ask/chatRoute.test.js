import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../supabaseAdmin.js', () => ({
  verifyUserToken: vi.fn(async (t) => (t === 'good' ? { id: 'u1', email: 'fan@example.com' } : null)),
  getSupabaseAdmin: vi.fn(() => { throw new Error('no db in tests'); }),
}));
vi.mock('../subscription.js', () => ({ getUserEntitlements: vi.fn(async () => ({ tier: 'free' })) }));
vi.mock('../posthogServer.js', () => ({ captureEvent: vi.fn(async () => {}) }));
vi.mock('./thread.js', () => ({
  beginTurn: vi.fn(),
  saveReply: vi.fn(),
  undoTurn: vi.fn(async () => ({ ok: true })),
  listThread: vi.fn(async () => ({ ok: true, messages: [{ id: 7, role: 'user', text: 'hi', cards: [] }] })),
  usedToday: vi.fn(async () => 2),
  clearThread: vi.fn(async () => ({ ok: true })),
}));
vi.mock('./connector.js', () => ({ getConnector: vi.fn(() => ({ league: 'nfl' })) }));
vi.mock('./agent.js', async (orig) => ({ ...(await orig()), reply: vi.fn() }));

const thread = await import('./thread.js');
const agent = await import('./agent.js');
const posthog = await import('../posthogServer.js');
const { getUserEntitlements } = await import('../subscription.js');
const { default: handler } = await import('../../ask/chat.js');

function call({ method = 'POST', token = 'good', body, query = {} } = {}) {
  const res = {
    statusCode: 200, headers: {}, chunks: [], body: null, ended: false,
    setHeader(k, v) { this.headers[k] = v; return this; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; this.ended = true; return this; },
    write(c) { this.chunks.push(c); return true; },
    end() { this.ended = true; return this; },
  };
  const req = { method, query, body, headers: token ? { authorization: `Bearer ${token}` } : {} };
  return handler(req, res).then(() => ({ ...res, events: res.chunks.map((c) => JSON.parse(c)) }));
}

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = 'k';
  vi.clearAllMocks();
  thread.beginTurn.mockResolvedValue({ ok: true, id: 41, used: 3, history: [] });
  thread.saveReply.mockImplementation(async ({ text, cards }) => ({ ok: true, message: { id: 42, role: 'assistant', text, cards } }));
  agent.reply.mockImplementation(async ({ onStatus, onText }) => {
    onStatus('Pulling the board');
    onText('No bet. ');
    return { text: 'No bet. The price is fair.', cards: [], meta: { rounds: 2, tools: ['get_picks'], corrections: 0, model: 'm', usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 } } };
  });
});
afterEach(() => { delete process.env.ANTHROPIC_API_KEY; delete process.env.ASK_PAUSED; });

describe('/api/ask/chat', () => {
  it('turns away anyone who is not signed in', async () => {
    expect((await call({ token: null })).statusCode).toBe(401);
    expect((await call({ token: 'forged' })).statusCode).toBe(401);
    expect(thread.beginTurn).not.toHaveBeenCalled();
  });

  it('returns the thread and today\'s usage', async () => {
    const res = await call({ method: 'GET', query: { since: '5' } });
    expect(thread.listThread).toHaveBeenCalledWith({ userId: 'u1', since: '5' });
    expect(res.body).toMatchObject({ ok: true, ready: true, messages: [{ id: 7 }], usage: { tier: 'free', used: 2, cap: 5, left: 3, picksPerAnswer: 3 } });
  });

  it('streams status, text and the stored answer for a turn', async () => {
    const res = await call({ body: { text: '  who do you like?  ' } });
    expect(thread.beginTurn).toHaveBeenCalledWith({ userId: 'u1', channel: 'web', text: 'who do you like?', dailyCap: 5 });
    expect(res.headers['Content-Type']).toMatch(/ndjson/);
    expect(res.events.map((e) => e.type)).toEqual(['status', 'text', 'done']);
    expect(res.events[2]).toMatchObject({ userMessageId: 41, message: { id: 42, text: 'No bet. The price is fair.' }, usage: { used: 3, left: 2 } });
    expect(agent.reply.mock.calls[0][0]).toMatchObject({ channel: 'web', limits: { tier: 'free', picksPerAnswer: 3 } });
    expect(agent.reply.mock.calls[0][0].signal).toBeInstanceOf(AbortSignal);
    expect(posthog.captureEvent).toHaveBeenCalledWith(expect.objectContaining({ event: 'ask_answered', distinctId: 'u1' }));
    expect(res.ended).toBe(true);
  });

  it('gives Pro its own limits', async () => {
    getUserEntitlements.mockResolvedValueOnce({ tier: 'pro' });
    await call({ body: { text: 'hi' } });
    expect(thread.beginTurn.mock.calls[0][0].dailyCap).toBe(150);
  });

  it('stops at the daily cap before the model is ever called', async () => {
    thread.beginTurn.mockResolvedValue({ ok: false, code: 'capped', used: 5 });
    const res = await call({ body: { text: 'one more' } });
    expect(res.statusCode).toBe(429);
    expect(res.body).toMatchObject({ error: 'capped', usage: { used: 5, left: 0 } });
    expect(agent.reply).not.toHaveBeenCalled();
    expect(posthog.captureEvent).toHaveBeenCalledWith(expect.objectContaining({ event: 'ask_cap_hit' }));
  });

  it('refuses empty, oversized and paused before storing anything', async () => {
    expect((await call({ body: { text: '  ' } })).body.error).toBe('empty');
    expect((await call({ body: { text: 'x'.repeat(601) } })).body.error).toBe('too_long');
    process.env.ASK_PAUSED = '1';
    expect((await call({ body: { text: 'hi' } })).body.error).toBe('paused');
    expect(thread.beginTurn).not.toHaveBeenCalled();
  });

  it('says not_configured when there is no API key or the table is missing', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect((await call({ body: { text: 'hi' } })).body.error).toBe('not_configured');
    process.env.ANTHROPIC_API_KEY = 'k';
    thread.beginTurn.mockResolvedValue({ ok: false, code: 'not_configured' });
    const res = await call({ body: { text: 'hi' } });
    expect(res.statusCode).toBe(503);
    expect(res.body.error).toBe('not_configured');
  });

  it('takes the question back when the turn fails, so it is not counted', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    agent.reply.mockRejectedValue(new agent.AskError('busy', 'overloaded'));
    const res = await call({ body: { text: 'hi' } });
    expect(thread.undoTurn).toHaveBeenCalledWith({ userId: 'u1', messageId: 41 });
    expect(thread.saveReply).not.toHaveBeenCalled();
    expect(res.events.at(-1)).toMatchObject({ type: 'error', code: 'busy', usage: { used: 2 } });
    expect(res.ended).toBe(true);
  });

  it('treats an answer that could not be stored as a failed turn', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    thread.saveReply.mockResolvedValue({ ok: false, code: 'failed', detail: 'db' });
    const res = await call({ body: { text: 'hi' } });
    expect(thread.undoTurn).toHaveBeenCalled();
    expect(res.events.at(-1)).toMatchObject({ type: 'error', code: 'failed' });
  });

  it('clears the conversation', async () => {
    const res = await call({ method: 'DELETE' });
    expect(thread.clearThread).toHaveBeenCalledWith('u1');
    expect(res.body).toEqual({ ok: true });
  });
});
