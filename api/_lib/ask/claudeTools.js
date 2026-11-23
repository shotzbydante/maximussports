/**
 * One streamed Messages API call with tools, for the Ask Maximus agent.
 *
 * api/_lib/claude.js covers one-shot copy (a system prompt, a user prompt,
 * text back). The agent needs more: a message list, tool definitions, tool
 * calls streamed back as blocks, and prompt caching. Model choice, request
 * headers, the thinking shape and the Haiku fallback are shared with that
 * module so both speak to the API the same way.
 *
 * The response's content blocks are returned exactly as the API sent them
 * (thinking blocks and signatures included), because the next round of a
 * tool loop has to send them back unchanged.
 */

import {
  API_URL, ClaudeError, FALLBACK_CLAUDE_MODEL,
  getClaudeApiKey, getClaudeModel, modelShape, requestHeaders,
} from '../claude.js';

/** Room for thinking between tool calls on models that think. */
const THINKING_HEADROOM_TOKENS = 2000;

const isAbort = (err) => err?.name === 'AbortError' || err?.name === 'TimeoutError' || /aborted|timed? ?out/i.test(err?.message || '');

/** The agent's model: ASK_MODEL, else the app-wide CLAUDE_MODEL, else the default. */
export function getAskModel() {
  return getClaudeModel((process.env.ASK_MODEL || '').trim() || undefined);
}

const isThinking = (b) => b?.type === 'thinking' || b?.type === 'redacted_thinking';

/** Messages without thinking blocks, for a model that runs with thinking off. */
export function stripThinking(messages) {
  return messages.map((m) => (Array.isArray(m.content)
    ? { ...m, content: m.content.filter((b) => !isThinking(b)) }
    : m)).filter((m) => !Array.isArray(m.content) || m.content.length > 0);
}

/**
 * Mark the newest message as a cache breakpoint. With the breakpoint on the
 * system prompt, the whole conversation so far is read from cache on the
 * next round and the next turn. Returns a copy; the input is not changed.
 */
export function withCacheBreakpoint(messages) {
  if (messages.length === 0) return messages;
  const out = messages.slice(0, -1);
  const last = messages[messages.length - 1];
  const blocks = typeof last.content === 'string'
    ? [{ type: 'text', text: last.content }]
    : last.content.map((b) => ({ ...b }));
  if (blocks.length === 0) return messages;
  blocks[blocks.length - 1] = { ...blocks[blocks.length - 1], cache_control: { type: 'ephemeral' } };
  out.push({ ...last, content: blocks });
  return out;
}

/** Build the request body. Exported for tests. */
export function buildToolRequest({ system, messages, tools, maxTokens, model }) {
  const shape = modelShape(model, maxTokens);
  const thinks = shape.thinking?.type !== 'disabled';
  return {
    model,
    max_tokens: thinks ? maxTokens + THINKING_HEADROOM_TOKENS : maxTokens,
    system,
    tools,
    messages: withCacheBreakpoint(thinks ? messages : stripThinking(messages)),
    stream: true,
    ...(shape.thinking ? { thinking: shape.thinking } : {}),
    ...(shape.output_config ? { output_config: shape.output_config } : {}),
  };
}

/**
 * Read a Messages API event stream into content blocks.
 * Exported for tests; `lines` is an async iterable of SSE `data:` payloads.
 *
 * @returns {Promise<{ content: Array, stopReason: string|null, usage: object }>}
 */
export async function readEvents(events, { onText } = {}) {
  const blocks = [];
  const partialJson = new Map();
  let stopReason = null;
  let finished = false;
  const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

  for await (const event of events) {
    if (event.type === 'message_start') {
      const u = event.message?.usage || {};
      usage.input = u.input_tokens || 0;
      usage.cacheRead = u.cache_read_input_tokens || 0;
      usage.cacheWrite = u.cache_creation_input_tokens || 0;
    } else if (event.type === 'content_block_start') {
      blocks[event.index] = { ...event.content_block };
      if (event.content_block?.type === 'tool_use') partialJson.set(event.index, '');
    } else if (event.type === 'content_block_delta') {
      const block = blocks[event.index];
      const d = event.delta || {};
      if (!block) continue;
      if (d.type === 'text_delta') {
        block.text = (block.text || '') + (d.text || '');
        if (d.text && onText) onText(d.text);
      } else if (d.type === 'input_json_delta') {
        partialJson.set(event.index, (partialJson.get(event.index) || '') + (d.partial_json || ''));
      } else if (d.type === 'thinking_delta') {
        block.thinking = (block.thinking || '') + (d.thinking || '');
      } else if (d.type === 'signature_delta') {
        block.signature = (block.signature || '') + (d.signature || '');
      }
    } else if (event.type === 'content_block_stop') {
      const block = blocks[event.index];
      if (block?.type === 'tool_use') {
        const raw = partialJson.get(event.index) || '';
        try { block.input = raw ? JSON.parse(raw) : {}; }
        catch { block.input = {}; block.truncated = true; }
        partialJson.delete(event.index);
      }
    } else if (event.type === 'message_delta') {
      if (event.delta?.stop_reason) stopReason = event.delta.stop_reason;
      if (event.usage?.output_tokens != null) usage.output = event.usage.output_tokens;
    } else if (event.type === 'message_stop') {
      finished = true;
    } else if (event.type === 'error') {
      const type = event.error?.type || 'error';
      throw new ClaudeError(
        type === 'overloaded_error' || type === 'rate_limit_error' ? 'busy' : 'api_error',
        `${type}: ${event.error?.message || 'stream error'}`,
      );
    }
  }
  if (!finished) throw new ClaudeError('network_error', 'Claude stream ended before completion');

  // A tool call whose JSON never closed was cut off by the output cap.
  for (const [index] of partialJson) {
    if (blocks[index]) { blocks[index].input = {}; blocks[index].truncated = true; }
  }
  return { content: blocks.filter(Boolean), stopReason, usage };
}

/** Parse an SSE byte stream into JSON events. */
async function* sseEvents(body) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
    let sep;
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      const raw = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      let data = '';
      for (const line of raw.split('\n')) if (line.startsWith('data:')) data += line.slice(5).trimStart();
      if (!data) continue;
      try { yield JSON.parse(data); } catch { /* skip a malformed event */ }
    }
  }
}

/**
 * Call Claude once and stream the answer. Throws ClaudeError with a code the
 * route can turn into an exact message: not_configured, busy, timeout,
 * http_error, api_error, network_error.
 *
 * If the API rejects the configured model's request, the call is retried
 * once on the fallback model, and `model` in the result says which answered
 * so the caller can stay on it for the rest of the turn.
 */
export async function streamMessage({ system, messages, tools, maxTokens, model, signal, onText, fetchImpl = fetch }) {
  const apiKey = getClaudeApiKey();
  if (!apiKey) throw new ClaudeError('not_configured', 'ANTHROPIC_API_KEY not set');

  let useModel = model || getAskModel();
  try {
    for (;;) {
      const r = await fetchImpl(API_URL, {
        method: 'POST',
        headers: requestHeaders(apiKey),
        body: JSON.stringify(buildToolRequest({ system, messages, tools, maxTokens, model: useModel })),
        signal,
      });
      if (r.ok) {
        const out = await readEvents(sseEvents(r.body), { onText });
        return { ...out, model: useModel };
      }
      const body = await r.text().catch(() => '');
      if ((r.status === 400 || r.status === 404) && useModel !== FALLBACK_CLAUDE_MODEL) {
        console.warn(`[ask/claude] ${useModel} rejected (${r.status}): ${body.slice(0, 160)} — retrying on ${FALLBACK_CLAUDE_MODEL}`);
        useModel = FALLBACK_CLAUDE_MODEL;
        continue;
      }
      const code = r.status === 429 || r.status === 529 || r.status === 503 ? 'busy' : 'http_error';
      throw new ClaudeError(code, `Claude API ${r.status}: ${body.slice(0, 200)}`, r.status);
    }
  } catch (err) {
    if (err instanceof ClaudeError) throw err;
    if (isAbort(err)) throw new ClaudeError('timeout', 'Claude request timed out');
    throw new ClaudeError('network_error', err?.message || 'Claude request failed');
  }
}
