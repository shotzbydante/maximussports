import { describe, it, expect, vi, afterEach } from 'vitest';
import { reply, toClaudeMessages, toPlain, buildContext, HOUSE_RULES, AskError, MAX_ROUNDS } from './agent.js';
import { ClaudeError } from '../claude.js';
import { fakeConnector, FREE, PRO, NOW } from './fixtures.js';

afterEach(() => vi.restoreAllMocks());

let n = 0;
const use = (name, input = {}) => ({ type: 'tool_use', id: `tu_${++n}`, name, input });
const say = (text) => ({ type: 'text', text });
const turn = (...content) => ({ content, usage: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0 } });

/** A scripted model: each call returns the next response and records what it was sent. */
function scripted(responses) {
  const calls = [];
  const callModel = async (req) => {
    calls.push(JSON.parse(JSON.stringify({ system: req.system, messages: req.messages })));
    const next = responses[calls.length - 1];
    if (!next) throw new Error('model called more times than scripted');
    if (next instanceof Error) throw next;
    for (const b of next.content) if (b.type === 'text') req.onText(b.text);
    return next;
  };
  return { callModel, calls };
}

function run(responses, { limits = PRO(), connector, history = [], text = 'Who do you like this week?', ...rest } = {}) {
  const fake = connector ? { connector } : fakeConnector();
  const { callModel, calls } = scripted(responses);
  const stream = [];
  const promise = reply({
    history, text, limits, connector: fake.connector, callModel, now: NOW,
    onText: (d) => stream.push(['text', d]),
    onReset: () => stream.push(['reset']),
    onStatus: (l) => stream.push(['status', l]),
    ...rest,
  });
  return { promise, calls, stream, fake };
}

describe('reply', () => {
  it('reads, then answers with words and cards the server built', async () => {
    const { promise, calls, stream } = run([
      turn(use('get_picks')),
      turn(say('Two spreads beat the market. LV +3.5 at -110 is the cleaner one.'), use('show_picks', { ids: ['g1-runline-away', 'g3-runline-home'], followups: ['Why LV?'] })),
    ]);
    const out = await promise;
    expect(out.text).toBe('Two spreads beat the market. LV +3.5 at -110 is the cleaner one.');
    expect(out.cards.map((c) => c.type)).toEqual(['pick', 'pick', 'chips']);
    expect(out.cards[0]).toMatchObject({ label: 'LV +3.5', price: -110, book: 'betmgm' });
    expect(out.meta).toMatchObject({ rounds: 2, tools: ['get_picks', 'show_picks'], corrections: 0 });
    expect(out.meta.usage.input).toBe(20);
    // The display call ended the turn: no third model call.
    expect(calls).toHaveLength(2);
    expect(stream).toEqual([['status', 'Pulling the board'], ['text', out.text]]);
    // The second request carries the tool result back.
    expect(calls[1].messages.at(-1).content[0]).toMatchObject({ type: 'tool_result' });
  });

  it('answers in plain words with no cards when nothing needs showing', async () => {
    const { promise, calls } = run([turn(say('I only cover the NFL here. Ask me about this week\'s picks.'))], { text: 'Who wins the World Cup?' });
    const out = await promise;
    expect(out.cards).toEqual([]);
    expect(calls).toHaveLength(1);
  });

  it('caches the house rules and keeps per-turn context out of the cached block', async () => {
    const { promise, calls } = run([turn(say('No bet.'))], { context: { teams: ['chiefs', 'not-a-team'] }, limits: FREE() });
    await promise;
    const [rules, context] = calls[0].system;
    expect(rules).toEqual({ type: 'text', text: HOUSE_RULES, cache_control: { type: 'ephemeral' } });
    expect(context.cache_control).toBeUndefined();
    expect(context.text).toContain('This member follows: Chiefs.');
    expect(context.text).toContain('Plan: free (the top 3 recommended picks of the week).');
    expect(HOUSE_RULES).not.toMatch(/\b20\d\d\b/);
  });

  it('asks for words when the model showed cards and said nothing', async () => {
    const { promise, calls } = run([
      turn(use('get_slate')),
      turn(use('show_games', { game_ids: ['g1'] })),
      turn(say('One game on the board.')),
    ]);
    const out = await promise;
    expect(out.text).toBe('One game on the board.');
    expect(out.cards.map((c) => c.type)).toEqual(['game']);
    expect(calls[2].messages.at(-1).content.at(-1).text).toMatch(/cards are on screen/);
  });

  it('discards preamble written before a read', async () => {
    const { promise, stream } = run([
      turn(say('Let me check.'), use('get_record')),
      turn(say('13-9 on the season.'), use('show_record')),
    ]);
    const out = await promise;
    expect(out.text).toBe('13-9 on the season.');
    expect(stream).toEqual([['text', 'Let me check.'], ['status', 'Opening the ledger'], ['reset'], ['text', '13-9 on the season.']]);
  });

  it('does not let an invented number stand: one correction, then the answer', async () => {
    const { promise, calls, stream } = run([
      turn(use('get_picks')),
      turn(say('LV +3.5 hits 62% of the time.'), use('show_picks', { ids: ['g1-runline-away'] })),
      turn(say('LV +3.5 at -110 is worth +3.5% in expected value.')),
    ]);
    const out = await promise;
    expect(out.text).toBe('LV +3.5 at -110 is worth +3.5% in expected value.');
    expect(out.meta.corrections).toBe(1);
    expect(out.cards.filter((c) => c.type === 'pick')).toHaveLength(1);
    const note = calls[2].messages.at(-1).content.at(-1).text;
    expect(note).toMatch(/not in any tool result: 62/);
    expect(stream.filter(([t]) => t === 'reset')).toHaveLength(1);
  });

  it('falls back to a safe line when the correction is wrong too', async () => {
    const { promise } = run([
      turn(use('get_picks')),
      turn(say('LV covers 62% of the time.'), use('show_picks', { ids: ['g1-runline-away'] })),
      turn(say('Make that 64%.')),
    ]);
    const out = await promise;
    expect(out.text).toBe('Here is what the board shows.');
    expect(out.meta.fellBack).toBe(true);
    expect(out.cards[0].label).toBe('LV +3.5');
  });

  it('will not publish a promise of an outcome', async () => {
    const { promise, calls } = run([
      turn(say('LV is the lock of the week.')),
      turn(say('LV is the lean.')),
    ]);
    expect((await promise).text).toBe('LV is the lean.');
    expect(calls[1].messages.at(-1).content[0].text).toMatch(/Do not promise an outcome/);
  });

  it('never runs a tool call that was cut off, and asks for it again', async () => {
    const cut = { ...use('show_picks'), truncated: true };
    const { promise, calls, fake } = run([
      turn(use('get_picks')),
      turn(say('Two spreads.'), cut),
      turn(say('Two spreads beat the market.'), use('show_picks', { ids: ['g1-runline-away'] })),
    ]);
    const out = await promise;
    expect(out.cards.filter((c) => c.type === 'pick')).toHaveLength(1);
    expect(fake.calls.picks).toBe(2); // get_picks, then the complete show_picks only
    expect(JSON.stringify(calls[2].messages)).not.toContain(cut.id);
    expect(calls[2].messages.at(-1).content.at(-1).text).toMatch(/cut off/);
  });

  it('keeps a free account inside its plan even when the model asks for more', async () => {
    const limits = { ...FREE(), picksPerAnswer: 1 };
    const { promise } = run([
      turn(use('get_picks')),
      turn(say('One pick is open on your plan.'), use('show_picks', { ids: ['g1-runline-away', 'g3-runline-home'] })),
    ], { limits });
    const out = await promise;
    expect(out.cards.map((c) => c.type)).toEqual(['pick', 'locked']);
    expect(JSON.stringify(out.cards)).not.toContain('DET');
  });

  it('stops after the round limit with a safe answer instead of looping', async () => {
    const { promise, calls } = run(Array.from({ length: MAX_ROUNDS }, () => turn(use('get_slate'))));
    const out = await promise;
    expect(calls).toHaveLength(MAX_ROUNDS);
    expect(out.meta.fellBack).toBe(true);
    expect(out.text).toMatch(/could not back that up/);
  });

  it('reports typed errors: busy, timeout, not configured, failed', async () => {
    for (const [thrown, code] of [
      [new ClaudeError('busy', 'x'), 'busy'],
      [new ClaudeError('timeout', 'x'), 'timeout'],
      [new ClaudeError('not_configured', 'x'), 'not_configured'],
      [new Error('boom'), 'failed'],
    ]) {
      const err = await run([thrown]).promise.catch((e) => e);
      expect(err).toBeInstanceOf(AskError);
      expect(err.code).toBe(code);
    }
  });

  it('stops at the turn deadline before calling the model again', async () => {
    const controller = new AbortController();
    const { connector } = fakeConnector({ picks: async () => { controller.abort(); return { board: null, asOf: null, stale: false }; } });
    const { promise, calls } = run([turn(use('get_picks')), turn(say('never sent'))], { connector, signal: controller.signal });
    await expect(promise).rejects.toMatchObject({ code: 'timeout' });
    expect(calls).toHaveLength(1);
  });

  it('survives a failed lookup and lets the model say so', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { connector } = fakeConnector({ record: async () => { throw new Error('db down'); } });
    const { promise, calls } = run([
      turn(use('get_record')),
      turn(say('I could not pull the record up right now.')),
    ], { connector });
    expect((await promise).text).toBe('I could not pull the record up right now.');
    expect(calls[1].messages.at(-1).content[0]).toMatchObject({ type: 'tool_result', is_error: true });
  });
});

describe('toClaudeMessages', () => {
  it('writes history as plain text with what was shown, and ends on the new message', () => {
    const history = [
      { role: 'user', text: 'best bet?' },
      { role: 'assistant', text: 'LV +3.5.', cards: [{ type: 'locked', id: 'locked', count: 2 }] },
    ];
    const out = toClaudeMessages(history, 'why?');
    expect(out.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(out[1].content).toContain('[locked] 2 more recommended picks are for Pro members');
    expect(out[2].content).toBe('why?');
  });

  it('keeps roles alternating and starting with the user', () => {
    const history = [
      { role: 'assistant', text: 'orphan' },
      { role: 'user', text: 'one' },
      { role: 'user', text: 'two' },
    ];
    expect(toClaudeMessages(history, 'three')).toEqual([{ role: 'user', content: 'one\n\ntwo\n\nthree' }]);
  });
});

describe('toPlain and buildContext', () => {
  it('strips markdown the model was told not to write', () => {
    expect(toPlain('**LV +3.5** at `-110`.\n\n- One\n- Two\n# Head')).toBe('LV +3.5 at -110.\n\nOne\nTwo\nHead');
    expect(toPlain('Under 44.5 is *fine* here.')).toBe('Under 44.5 is fine here.');
  });

  it('tells a text conversation to stay shorter', () => {
    expect(buildContext({ limits: PRO(), channel: 'sms', now: NOW })).toMatch(/over text message/);
    expect(buildContext({ limits: PRO(), now: NOW })).toMatch(/^Today is Sunday, November 22, 2026 \(Eastern\)\.\nPlan: Pro/);
  });
});
