import { describe, it, expect, afterEach, vi } from 'vitest';
import { buildToolRequest, readEvents, withCacheBreakpoint, stripThinking, streamMessage, getAskModel, getAskEffort, partialString } from './claudeTools.js';
import { ClaudeError, FALLBACK_CLAUDE_MODEL } from '../claude.js';

async function* events(list) { for (const e of list) yield e; }

const toolTurn = [
  { type: 'message_start', message: { usage: { input_tokens: 40, cache_read_input_tokens: 900, cache_creation_input_tokens: 12 } } },
  { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'board first' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'sig' } },
  { type: 'content_block_stop', index: 0 },
  { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'tu_1', name: 'get_picks', input: {} } },
  { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{"market":' } },
  { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '"spread"}' } },
  { type: 'content_block_stop', index: 1 },
  { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 31 } },
  { type: 'message_stop' },
];

afterEach(() => { delete process.env.ASK_MODEL; delete process.env.ASK_EFFORT; delete process.env.ANTHROPIC_API_KEY; vi.restoreAllMocks(); });

describe('readEvents', () => {
  it('rebuilds thinking and tool-use blocks exactly, with usage', async () => {
    const out = await readEvents(events(toolTurn));
    expect(out.content).toEqual([
      { type: 'thinking', thinking: 'board first', signature: 'sig' },
      { type: 'tool_use', id: 'tu_1', name: 'get_picks', input: { market: 'spread' } },
    ]);
    expect(out.stopReason).toBe('tool_use');
    expect(out.usage).toEqual({ input: 40, output: 31, cacheRead: 900, cacheWrite: 12 });
  });

  it('reports a tool call\'s input as it grows, so its words can be streamed', async () => {
    const seen = [];
    await readEvents(events(toolTurn), { onToolInput: (block, json) => seen.push([block.name, json]) });
    expect(seen).toEqual([['get_picks', '{"market":'], ['get_picks', '{"market":"spread"}']]);
  });

  it('streams text as it arrives', async () => {
    const seen = [];
    const out = await readEvents(events([
      { type: 'message_start', message: {} },
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'No bet. ' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'The price is fair.' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: { stop_reason: 'end_turn' } },
      { type: 'message_stop' },
    ]), { onText: (t) => seen.push(t) });
    expect(seen).toEqual(['No bet. ', 'The price is fair.']);
    expect(out.content[0].text).toBe('No bet. The price is fair.');
  });

  it('marks a tool call cut off by the output cap as truncated', async () => {
    const out = await readEvents(events([
      { type: 'message_start', message: {} },
      { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'tu_1', name: 'show_picks', input: {} } },
      { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"ids":["g1-run' } },
      { type: 'message_delta', delta: { stop_reason: 'max_tokens' } },
      { type: 'message_stop' },
    ]));
    expect(out.content[0]).toMatchObject({ name: 'show_picks', input: {}, truncated: true });
  });

  it('throws when the stream stops early, and maps an overload to busy', async () => {
    await expect(readEvents(events([{ type: 'message_start', message: {} }]))).rejects.toMatchObject({ code: 'network_error' });
    await expect(readEvents(events([{ type: 'error', error: { type: 'overloaded_error', message: 'x' } }]))).rejects.toMatchObject({ code: 'busy' });
  });
});

describe('request building', () => {
  const messages = [
    { role: 'user', content: 'who do you like?' },
    { role: 'assistant', content: [{ type: 'thinking', thinking: 't', signature: 's' }, { type: 'tool_use', id: 'tu_1', name: 'get_picks', input: {} }] },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tu_1', content: '{}' }] },
  ];

  it('puts one cache breakpoint on the newest message and leaves the input alone', () => {
    const out = withCacheBreakpoint(messages);
    expect(out[2].content[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(messages[2].content[0].cache_control).toBeUndefined();
    expect(JSON.stringify(out.slice(0, 2))).not.toContain('cache_control');
    expect(withCacheBreakpoint([{ role: 'user', content: 'hi' }])[0].content).toEqual([{ type: 'text', text: 'hi', cache_control: { type: 'ephemeral' } }]);
  });

  it('keeps thinking blocks for a model that thinks, adds headroom, and asks for low effort', () => {
    const body = buildToolRequest({ system: 's', messages, tools: [], maxTokens: 900, model: 'claude-sonnet-5-5' });
    expect(body).toMatchObject({ model: 'claude-sonnet-5-5', stream: true, max_tokens: 2900, thinking: { type: 'between_tools' }, output_config: { effort: 'low' } });
    expect(body.messages[1].content[0].type).toBe('thinking');
  });

  it('takes effort from ASK_EFFORT, ignores a bad value, and can leave it out', () => {
    process.env.ASK_EFFORT = 'medium';
    expect(getAskEffort()).toBe('medium');
    process.env.ASK_EFFORT = 'ludicrous';
    expect(getAskEffort()).toBe('low');
    const body = buildToolRequest({ system: 's', messages, tools: [], maxTokens: 900, model: 'claude-sonnet-5-5', effort: null });
    expect(body.output_config).toBeUndefined();
  });

  it('drops thinking blocks for a model that runs with thinking off', () => {
    const body = buildToolRequest({ system: 's', messages, tools: [], maxTokens: 900, model: FALLBACK_CLAUDE_MODEL });
    expect(body).toMatchObject({ max_tokens: 900, thinking: { type: 'disabled' } });
    expect(body.output_config).toBeUndefined();
    expect(JSON.stringify(body.messages)).not.toContain('"thinking"');
    expect(stripThinking(messages)).toHaveLength(3);
  });

  it('prefers ASK_MODEL over the app-wide model', () => {
    process.env.ASK_MODEL = 'claude-haiku-5-5';
    expect(getAskModel()).toBe('claude-haiku-5-5');
  });
});

describe('streamMessage', () => {
  const sse = (list) => new Response(list.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join(''), { status: 200 });

  it('reports not_configured without calling the API when there is no key', async () => {
    const fetchImpl = vi.fn();
    await expect(streamMessage({ system: 's', messages: [], tools: [], maxTokens: 10, fetchImpl })).rejects.toMatchObject({ code: 'not_configured' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('when a request is rejected, drops the effort setting first and keeps the model', async () => {
    process.env.ANTHROPIC_API_KEY = 'k';
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response('output_config.effort: not allowed', { status: 400 }))
      .mockResolvedValueOnce(sse(toolTurn));
    const out = await streamMessage({ system: 's', messages: [{ role: 'user', content: 'hi' }], tools: [], maxTokens: 10, model: 'claude-sonnet-5-5', fetchImpl });
    expect(out).toMatchObject({ model: 'claude-sonnet-5-5', effort: null });
    const [first, second] = fetchImpl.mock.calls.map((c) => JSON.parse(c[1].body));
    expect(first.output_config).toEqual({ effort: 'low' });
    expect(second.output_config).toBeUndefined();
    expect(second.model).toBe('claude-sonnet-5-5');
  });

  it('then falls back to the other model, and reports which answered', async () => {
    process.env.ANTHROPIC_API_KEY = 'k';
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response('unknown model', { status: 404 }))
      .mockResolvedValueOnce(new Response('unknown model', { status: 404 }))
      .mockResolvedValueOnce(sse(toolTurn));
    const out = await streamMessage({ system: 's', messages: [{ role: 'user', content: 'hi' }], tools: [], maxTokens: 10, model: 'claude-sonnet-5-5', fetchImpl });
    expect(out.model).toBe(FALLBACK_CLAUDE_MODEL);
    expect(JSON.parse(fetchImpl.mock.calls[2][1].body).model).toBe(FALLBACK_CLAUDE_MODEL);
    expect(out.content[1].input).toEqual({ market: 'spread' });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('gives up with an error when even the fallback is rejected', async () => {
    process.env.ANTHROPIC_API_KEY = 'k';
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchImpl = vi.fn().mockImplementation(async () => new Response('bad request', { status: 400 }));
    await expect(streamMessage({ system: 's', messages: [], tools: [], maxTokens: 10, model: 'claude-sonnet-5-5', fetchImpl })).rejects.toMatchObject({ code: 'http_error', status: 400 });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('maps rate limits to busy and an aborted call to timeout', async () => {
    process.env.ANTHROPIC_API_KEY = 'k';
    const busy = vi.fn().mockResolvedValue(new Response('slow down', { status: 429 }));
    await expect(streamMessage({ system: 's', messages: [], tools: [], maxTokens: 10, fetchImpl: busy })).rejects.toMatchObject({ code: 'busy' });
    const aborted = vi.fn().mockRejectedValue(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }));
    const err = await streamMessage({ system: 's', messages: [], tools: [], maxTokens: 10, fetchImpl: aborted }).catch((e) => e);
    expect(err).toBeInstanceOf(ClaudeError);
    expect(err.code).toBe('timeout');
  });
});

describe('partialString', () => {
  it('returns a field\'s text as far as it has been written', () => {
    expect(partialString('{"say":"Two spreads be', 'say')).toBe('Two spreads be');
    expect(partialString('{"say": "Done.","ids":["a"]}', 'say')).toBe('Done.');
    expect(partialString('{"ids":["a"]', 'say')).toBe('');
    expect(partialString('', 'say')).toBe('');
  });

  it('decodes escapes and waits for one that is cut in half', () => {
    expect(partialString('{"say":"He said \\"no\\"\\nand left', 'say')).toBe('He said "no"\nand left');
    expect(partialString('{"say":"caf\\u00e9 \\u00', 'say')).toBe('café ');
    expect(partialString('{"say":"end\\', 'say')).toBe('end');
  });

  it('only ever grows, so a page can append the difference', () => {
    const full = JSON.stringify({ say: 'LV +3.5 at -110 is "the" one.\nSmall edge.', ids: ['g1'] });
    let prev = '';
    for (let i = 1; i <= full.length; i += 1) {
      const now = partialString(full.slice(0, i), 'say');
      expect(now.startsWith(prev)).toBe(true);
      prev = now;
    }
    expect(prev).toBe('LV +3.5 at -110 is "the" one.\nSmall edge.');
  });
});
