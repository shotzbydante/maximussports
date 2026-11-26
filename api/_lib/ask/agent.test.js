import { describe, it, expect, vi, afterEach } from 'vitest';
import { reply, toClaudeMessages, toPlain, buildContext, HOUSE_RULES, AskError, MAX_ROUNDS } from './agent.js';
import { ClaudeError } from '../claude.js';
import { fakeConnector, GUEST, FREE, PRO, NOW } from './fixtures.js';

afterEach(() => vi.restoreAllMocks());

let n = 0;
const use = (name, input = {}) => ({ type: 'tool_use', id: `tu_${++n}`, name, input });
const say = (text) => ({ type: 'text', text });
const thought = () => ({ type: 'thinking', thinking: '', signature: 'sig' });
const turn = (...content) => ({ content, usage: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0 } });

/**
 * A scripted model. Each call returns the next response and records what it
 * was sent. Text blocks stream through onText; a display tool's input
 * streams through onToolInput in two pieces, as the API delivers it.
 */
function scripted(responses) {
  const calls = [];
  const callModel = async (req) => {
    calls.push(JSON.parse(JSON.stringify({ system: req.system, messages: req.messages, effort: req.effort, model: req.model })));
    const next = responses[calls.length - 1];
    if (!next) throw new Error('model called more times than scripted');
    if (next instanceof Error) throw next;
    for (const b of next.content) {
      if (b.type === 'text') req.onText(b.text);
      if (b.type === 'tool_use' && !b.truncated) {
        const json = JSON.stringify(b.input);
        const half = Math.ceil(json.length / 2);
        req.onToolInput(b, json.slice(0, half));
        req.onToolInput(b, json);
      }
    }
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
  const words = () => stream.reduce((acc, [t, d]) => (t === 'reset' ? '' : t === 'text' ? acc + d : acc), '');
  return { promise, calls, stream, words, fake };
}

describe('reply', () => {
  it('reads, then answers in one display call: words streamed, cards built by the server', async () => {
    const answer = 'Two spreads beat the market. LV +3.5 at -110 is the cleaner one.';
    const { promise, calls, stream, words } = run([
      turn(thought(), use('get_picks')),
      turn(thought(), use('show_picks', { say: answer, ids: ['g1-runline-away', 'g3-runline-home'], followups: ['Why LV?'] })),
    ]);
    const out = await promise;
    expect(out.text).toBe(answer);
    expect(out.cards.map((c) => c.type)).toEqual(['pick', 'pick', 'chips']);
    expect(out.cards[0]).toMatchObject({ label: 'LV +3.5', price: -110, book: 'betmgm' });
    expect(out.meta).toMatchObject({ rounds: 2, tools: ['get_picks', 'show_picks'], corrections: 0 });
    expect(out.meta.usage.input).toBe(20);
    // The display call ended the turn: no third model call.
    expect(calls).toHaveLength(2);
    // The words reached the page as they were written, in pieces, with no reset.
    expect(stream[0]).toEqual(['status', 'Pulling the board']);
    expect(stream.filter(([t]) => t === 'text').length).toBeGreaterThan(1);
    expect(stream.some(([t]) => t === 'reset')).toBe(false);
    expect(words()).toBe(answer);
    // Thinking blocks go back exactly as they came, with the tool result after them.
    expect(calls[1].messages.at(-2).content[0]).toEqual(thought());
    expect(calls[1].messages.at(-1).content[0]).toMatchObject({ type: 'tool_result' });
  });

  it('answers in plain words with no cards when nothing needs showing', async () => {
    const { promise, calls, words } = run([turn(say('I only cover the NFL here. Ask me about this week\'s picks.'))], { text: 'Who wins the World Cup?' });
    const out = await promise;
    expect(out.cards).toEqual([]);
    expect(calls).toHaveLength(1);
    expect(words()).toBe(out.text);
  });

  it('caches the house rules and keeps per-turn context out of the cached block', async () => {
    const { promise, calls } = run([turn(say('No bet.'))], {
      context: { teams: ['chiefs', 'not-a-team'], page: { kind: 'game', teams: ['raiders', 'chiefs'] } }, limits: FREE(),
    });
    await promise;
    const [rules, context] = calls[0].system;
    expect(rules).toEqual({ type: 'text', text: HOUSE_RULES, cache_control: { type: 'ephemeral' } });
    expect(context.cache_control).toBeUndefined();
    expect(context.text).toContain('They follow: Chiefs.');
    expect(context.text).toContain('Visitor: free account.');
    expect(context.text).toContain('They opened chat from the Raiders at Chiefs game page.');
    expect(HOUSE_RULES).not.toMatch(/\b20\d\d\b/);
  });

  it('tells the model who it is talking to, by tier', () => {
    expect(buildContext({ limits: GUEST(), now: NOW })).toMatch(/Visitor: no account\..*Nothing they say is saved/s);
    expect(buildContext({ limits: PRO(), now: NOW })).toMatch(/Visitor: Pro member\..*up to 120 words/s);
    expect(buildContext({ limits: PRO(), channel: 'sms', now: NOW })).toMatch(/over text message/);
    expect(buildContext({ limits: PRO(), now: NOW })).toMatch(/^Today is Sunday, November 22, 2026 \(Eastern\)\./);
    expect(buildContext({ limits: FREE(), context: { page: { kind: 'team', teams: ['lions'] } }, now: NOW })).toContain('the Lions team page');
    expect(buildContext({ limits: FREE(), context: { page: { kind: 'game', teams: ['lions'] } }, now: NOW })).not.toContain('game page');
  });

  it('holds a display call made in the same step as a read, until the data is back', async () => {
    const { promise, calls, words } = run([
      turn(use('get_record'), use('show_record', { say: 'Probably around 60 percent.' })),
      turn(use('show_record', { say: '13-9 on the season.' })),
    ]);
    const out = await promise;
    expect(out.text).toBe('13-9 on the season.');
    expect(out.meta.tools).toEqual(['get_record', 'show_record']);
    const results = calls[1].messages.at(-1).content;
    expect(results[1]).toMatchObject({ type: 'tool_result', is_error: true });
    expect(results[1].content).toMatch(/same step as a read tool/);
    expect(words()).toBe('13-9 on the season.');
  });

  it('discards loose text written before a read', async () => {
    const { promise, stream } = run([
      turn(say('Let me check.'), use('get_record')),
      turn(use('show_record', { say: '13-9 on the season.' })),
    ]);
    const out = await promise;
    expect(out.text).toBe('13-9 on the season.');
    expect(stream.slice(0, 3)).toEqual([['text', 'Let me check.'], ['reset'], ['status', 'Opening the ledger']]);
  });

  it('lets the words in the display call win over loose text beside it', async () => {
    const { promise, words } = run([
      turn(use('get_picks')),
      turn(say('Here you go.'), use('show_picks', { say: 'LV +3.5 at -110.', ids: ['g1-runline-away'] })),
    ]);
    expect((await promise).text).toBe('LV +3.5 at -110.');
    expect(words()).toBe('LV +3.5 at -110.');
  });

  it('does not let an invented number stand: one rewrite, then the answer, with the cards kept once', async () => {
    const { promise, calls, words } = run([
      turn(use('get_picks')),
      turn(use('show_picks', { say: 'LV +3.5 hits 62% of the time.', ids: ['g1-runline-away'] })),
      turn(use('show_picks', { say: 'LV +3.5 at -110 is worth +3.5% in expected value.', ids: ['g1-runline-away'] })),
    ]);
    const out = await promise;
    expect(out.text).toBe('LV +3.5 at -110 is worth +3.5% in expected value.');
    expect(out.meta.corrections).toBe(1);
    expect(out.cards.filter((c) => c.type === 'pick')).toHaveLength(1);
    expect(calls[2].messages.at(-1).content.at(-1).text).toMatch(/not in any tool result: 62.*calling the display tool again/s);
    expect(words()).toBe(out.text);
  });

  it('keeps the cards when the rewrite comes back as plain text', async () => {
    const { promise } = run([
      turn(use('get_picks')),
      turn(use('show_picks', { say: 'LV covers 62% of the time.', ids: ['g1-runline-away'] })),
      turn(say('LV +3.5 at -110 is the pick.')),
    ]);
    const out = await promise;
    expect(out.text).toBe('LV +3.5 at -110 is the pick.');
    expect(out.cards.map((c) => c.label)).toEqual(['LV +3.5']);
  });

  it('falls back to a safe line when the rewrite is wrong too', async () => {
    const { promise, words } = run([
      turn(use('get_picks')),
      turn(use('show_picks', { say: 'LV covers 62% of the time.', ids: ['g1-runline-away'] })),
      turn(use('show_picks', { say: 'Make that 64%.', ids: ['g1-runline-away'] })),
    ]);
    const out = await promise;
    expect(out.text).toBe('Here is what the board shows.');
    expect(out.meta.fellBack).toBe(true);
    expect(out.cards[0].label).toBe('LV +3.5');
    expect(words()).toBe('Here is what the board shows.');
  });

  it('accepts a number that is on a card it is showing', async () => {
    // The record card is built from data the model never read this turn.
    const { promise } = run([turn(use('show_record', { say: 'Recommended picks are 13-9 on the season.' }))]);
    const out = await promise;
    expect(out.meta.corrections).toBe(0);
    expect(out.text).toBe('Recommended picks are 13-9 on the season.');
  });

  it('will not publish a promise of an outcome', async () => {
    const { promise, calls } = run([
      turn(say('LV is the lock of the week.')),
      turn(say('LV is the lean.')),
    ]);
    expect((await promise).text).toBe('LV is the lean.');
    expect(calls[1].messages.at(-1).content[0].text).toMatch(/Do not promise an outcome/);
  });

  it('never runs a tool call that was cut off, drops that step\'s thinking, and asks again', async () => {
    const cut = { ...use('show_picks'), truncated: true };
    const { promise, calls, fake } = run([
      turn(use('get_picks')),
      turn(thought(), cut),
      turn(use('show_picks', { say: 'Two spreads beat the market.', ids: ['g1-runline-away'] })),
    ]);
    const out = await promise;
    expect(out.cards.filter((c) => c.type === 'pick')).toHaveLength(1);
    expect(fake.calls.picks).toBe(2); // get_picks, then the complete show_picks only
    const sent = JSON.stringify(calls[2].messages);
    expect(sent).not.toContain(cut.id);
    expect(calls[2].messages.at(-2).content).toEqual([{ type: 'text', text: '(tool call cut off)' }]);
    expect(calls[2].messages.at(-1).content.at(-1).text).toMatch(/cut off/);
  });

  it('keeps a guest to the calls they have been shown, even when the model asks for more', async () => {
    const { promise } = run([
      turn(use('get_picks')),
      turn(use('show_picks', { say: 'Three calls are open to you.', ids: ['g1-runline-away', 'g3-moneyline-home'] })),
    ], { limits: GUEST() });
    const out = await promise;
    expect(out.cards.map((c) => c.type)).toEqual(['pick', 'locked']);
    expect(out.cards[1]).toMatchObject({ count: 6, games: 3 });
  });

  it('adds the Pro offer itself when a free account asks for a Pro feature', async () => {
    const { promise } = run([
      turn(use('shop_prices', { team: 'Chiefs' })),
      turn(say('Shopping every book is a Pro feature. The consensus is KC by a field goal.')),
    ], { limits: FREE(), text: 'Where is the best price on the Chiefs?' });
    const out = await promise;
    expect(out.cards).toEqual([{ type: 'upgrade', id: 'upgrade', reason: 'shop_prices' }]);
    expect(out.meta.proOnly).toBe('shop_prices');
  });

  it('shops the books for Pro and makes no offer', async () => {
    const { promise } = run([
      turn(use('shop_prices', { team: 'Chiefs' })),
      turn(use('show_prices', { say: 'BetMGM is the outlier: LV +3.5 at -110.', game_id: 'g1' })),
    ], { limits: PRO() });
    const out = await promise;
    expect(out.cards.map((c) => c.type)).toEqual(['prices']);
    expect(out.cards[0].best.spreadAway).toEqual({ book: 'betmgm', line: 3.5, price: -110 });
  });

  it('stays on the model and effort that answered, for the rest of the turn', async () => {
    const first = { ...turn(use('get_picks')), model: 'claude-haiku-5-5', effort: null };
    const { promise, calls } = run([first, turn(say('No bet.'))]);
    const out = await promise;
    expect(calls[1]).toMatchObject({ model: 'claude-haiku-5-5', effort: null });
    expect(out.meta.model).toBe('claude-haiku-5-5');
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
  it('writes history as plain text with what was shown, and warns that prices move', () => {
    const history = [
      { role: 'user', text: 'best bet?' },
      { role: 'assistant', text: 'LV +3.5.', cards: [{ type: 'locked', id: 'locked', count: 2, games: 2 }] },
    ];
    const out = toClaudeMessages(history, 'why?');
    expect(out.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(out[1].content).toContain('[locked] 2 more calls are open with a free account');
    expect(out[1].content).toMatch(/may have moved since: read them again/);
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

describe('toPlain', () => {
  it('strips markdown the model was told not to write', () => {
    expect(toPlain('**LV +3.5** at `-110`.\n\n- One\n- Two\n# Head')).toBe('LV +3.5 at -110.\n\nOne\nTwo\nHead');
    expect(toPlain('Under 44.5 is *fine* here.')).toBe('Under 44.5 is fine here.');
  });
});
