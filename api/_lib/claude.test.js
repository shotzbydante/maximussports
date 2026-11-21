/**
 * Tests for the Claude client used by every LLM-backed route.
 *
 * The API is mocked: these lock the request shape (headers, system prompt,
 * no sampling parameters, thinking config per model), text extraction, the
 * streaming parser, and the error codes callers branch on.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  buildClaudeRequest,
  extractClaudeText,
  claudeComplete,
  claudeStream,
  isClaudeConfigured,
  getClaudeModel,
  DEFAULT_CLAUDE_MODEL,
} from './claude.js';

const ENV_KEYS = ['ANTHROPIC_API_KEY', 'CLAUDE_MODEL'];
let savedEnv;

beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  process.env.ANTHROPIC_API_KEY = 'test-key';
  delete process.env.CLAUDE_MODEL;
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function sseResponse(chunks) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

const sse = (event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
const textDelta = (text) => sse({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } });

async function collect(gen) {
  const out = [];
  for await (const d of gen) out.push(d);
  return out;
}

describe('configuration', () => {
  it('reports unconfigured when the key is missing or blank', () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(isClaudeConfigured()).toBe(false);
    process.env.ANTHROPIC_API_KEY = '   ';
    expect(isClaudeConfigured()).toBe(false);
    process.env.ANTHROPIC_API_KEY = 'k';
    expect(isClaudeConfigured()).toBe(true);
  });

  it('resolves the model from override, then env, then default', () => {
    expect(getClaudeModel()).toBe(DEFAULT_CLAUDE_MODEL);
    process.env.CLAUDE_MODEL = 'claude-sonnet-5-5';
    expect(getClaudeModel()).toBe('claude-sonnet-5-5');
    expect(getClaudeModel('claude-opus-5-5')).toBe('claude-opus-5-5');
  });
});

describe('buildClaudeRequest', () => {
  it('puts the system prompt at the top level and never sends sampling parameters', () => {
    const body = buildClaudeRequest({ system: 'sys', user: 'hi', maxTokens: 600 });
    expect(body.system).toBe('sys');
    expect(body.messages).toEqual([{ role: 'user', content: 'hi' }]);
    expect(body).not.toHaveProperty('temperature');
    expect(body).not.toHaveProperty('top_p');
    expect(body).not.toHaveProperty('stream');
  });

  it('turns thinking off on Haiku so max_tokens is all answer text', () => {
    const body = buildClaudeRequest({ user: 'hi', maxTokens: 600 });
    expect(body.model).toBe('claude-haiku-5-5');
    expect(body.thinking).toEqual({ type: 'disabled' });
    expect(body.max_tokens).toBe(600);
    expect(body).not.toHaveProperty('output_config');
  });

  it('uses low effort plus headroom on models that cannot disable thinking', () => {
    const body = buildClaudeRequest({ user: 'hi', maxTokens: 600, model: 'claude-sonnet-5-5' });
    expect(body).not.toHaveProperty('thinking');
    expect(body.output_config).toEqual({ effort: 'low' });
    expect(body.max_tokens).toBeGreaterThan(600);
  });

  it('sets stream only when asked', () => {
    expect(buildClaudeRequest({ user: 'hi', maxTokens: 10, stream: true }).stream).toBe(true);
  });
});

describe('extractClaudeText', () => {
  it('joins text blocks and skips thinking blocks', () => {
    const json = {
      content: [
        { type: 'thinking', thinking: '', signature: 'abc' },
        { type: 'text', text: 'Hello ' },
        { type: 'text', text: 'world.\n' },
      ],
    };
    expect(extractClaudeText(json)).toBe('Hello world.');
  });

  it('returns null when there is no text', () => {
    expect(extractClaudeText({ content: [] })).toBeNull();
    expect(extractClaudeText({})).toBeNull();
    expect(extractClaudeText(null)).toBeNull();
  });
});

describe('claudeComplete', () => {
  it('posts to the Messages API with the key and version headers', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ content: [{ type: 'text', text: ' Briefing. ' }] }));
    vi.stubGlobal('fetch', fetchMock);

    const text = await claudeComplete({ system: 'sys', user: 'data', maxTokens: 850, timeoutMs: 1000 });

    expect(text).toBe('Briefing.');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(init.method).toBe('POST');
    expect(init.headers['x-api-key']).toBe('test-key');
    expect(init.headers['anthropic-version']).toBe('2023-06-01');
    expect(init.headers).not.toHaveProperty('Authorization');
    const body = JSON.parse(init.body);
    expect(body.max_tokens).toBe(850);
    expect(body.system).toBe('sys');
  });

  it('throws not_configured without calling the API when the key is missing', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(claudeComplete({ user: 'x', maxTokens: 10 })).rejects.toMatchObject({ code: 'not_configured' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws http_error with the status on a non-2xx response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ type: 'error', error: { type: 'authentication_error' } }, 401)));
    await expect(claudeComplete({ user: 'x', maxTokens: 10 })).rejects.toMatchObject({ code: 'http_error', status: 401 });
  });

  it('throws timeout when the request outlives timeoutMs', async () => {
    vi.stubGlobal('fetch', vi.fn((_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => {
        const err = new Error('This operation was aborted');
        err.name = 'AbortError';
        reject(err);
      });
    })));
    await expect(claudeComplete({ user: 'x', maxTokens: 10, timeoutMs: 20 })).rejects.toMatchObject({ code: 'timeout' });
  });

  it('throws network_error when fetch itself fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed'); }));
    await expect(claudeComplete({ user: 'x', maxTokens: 10 })).rejects.toMatchObject({ code: 'network_error' });
  });
});

describe('claudeStream', () => {
  it('yields text deltas in order and ignores other events', async () => {
    const fetchMock = vi.fn(async () => sseResponse([
      sse({ type: 'message_start', message: { id: 'msg_1', content: [] } }),
      sse({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }),
      sse({ type: 'ping' }),
      textDelta('Duke '),
      sse({ type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'hidden' } }),
      textDelta('covers.'),
      sse({ type: 'content_block_stop', index: 0 }),
      sse({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 4 } }),
      sse({ type: 'message_stop' }),
    ]));
    vi.stubGlobal('fetch', fetchMock);

    const deltas = await collect(claudeStream({ system: 'sys', user: 'data', maxTokens: 480 }));

    expect(deltas).toEqual(['Duke ', 'covers.']);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).stream).toBe(true);
  });

  it('reassembles events split across network chunks', async () => {
    const whole = textDelta('Split ') + textDelta('event.') + sse({ type: 'message_stop' });
    const cut = 37;
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse([whole.slice(0, cut), whole.slice(cut)])));
    expect(await collect(claudeStream({ user: 'x', maxTokens: 10 }))).toEqual(['Split ', 'event.']);
  });

  it('handles CRLF-delimited events', async () => {
    const whole = (textDelta('Hi') + sse({ type: 'message_stop' })).replace(/\n/g, '\r\n');
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse([whole])));
    expect(await collect(claudeStream({ user: 'x', maxTokens: 10 }))).toEqual(['Hi']);
  });

  it('throws api_error on a mid-stream error event', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse([
      textDelta('Partial'),
      sse({ type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }),
    ])));
    await expect(collect(claudeStream({ user: 'x', maxTokens: 10 }))).rejects.toMatchObject({ code: 'api_error' });
  });

  it('throws when the stream ends without message_stop', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse([textDelta('Cut off')])));
    await expect(collect(claudeStream({ user: 'x', maxTokens: 10 }))).rejects.toMatchObject({ code: 'network_error' });
  });

  it('throws http_error before yielding anything on a non-2xx response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ type: 'error' }, 529)));
    await expect(collect(claudeStream({ user: 'x', maxTokens: 10 }))).rejects.toMatchObject({ code: 'http_error', status: 529 });
  });

  it('throws not_configured when the key is missing', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    await expect(collect(claudeStream({ user: 'x', maxTokens: 10 }))).rejects.toMatchObject({ code: 'not_configured' });
  });
});
