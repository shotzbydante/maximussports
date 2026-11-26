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

/** How hard the model thinks between tool calls: ASK_EFFORT, else low. Chat wants speed. */
export function getAskEffort() {
  const v = String(process.env.ASK_EFFORT || '').trim().toLowerCase();
  return ['low', 'medium', 'high'].includes(v) ? v : 'low';
}

/**
 * Build the request body. Exported for tests.
 *
 * `effort` is sent only to a model that thinks. Sonnet 5.5 defaults to high
 * effort when the field is absent, which is slower than a chat reply should
 * be. Pass `effort: null` to leave it out.
 */
export function buildToolRequest({ system, messages, tools, maxTokens, model, effort = getAskEffort() }) {
  const shape = modelShape(model, maxTokens);
  const thinks = shape.thinking?.type !== 'disabled';
  const outputConfig = shape.output_config || (thinks && effort ? { effort } : null);
  return {
    model,
    max_tokens: thinks ? maxTokens + THINKING_HEADROOM_TOKENS : maxTokens,
    system,
    tools,
    messages: withCacheBreakpoint(thinks ? messages : stripThinking(messages)),
    stream: true,
    ...(shape.thinking ? { thinking: shape.thinking } : {}),
    ...(outputConfig ? { output_config: outputConfig } : {}),
  };
}

/**
 * The value of one string field in a JSON object that is still being
 * written, as far as it has got. Used to stream a tool's `say` field to the
 * page while the rest of the tool call is still arriving.
 *
 *   partialString('{"say":"Two spreads be', 'say')  →  'Two spreads be'
 */
export function partialString(json, field) {
  const m = new RegExp(`"${field}"\\s*:\\s*"`).exec(json);
  if (!m) return '';
  let out = '';
  for (let i = m.index + m[0].length; i < json.length; i += 1) {
    const ch = json[i];
    if (ch === '"') return out;
    if (ch !== '\\') { out += ch; continue; }
    const next = json[i + 1];
    if (next === undefined) return out; // an escape cut in half: wait for the rest
    if (next === 'u') {
      const hex = json.slice(i + 2, i + 6);
      if (hex.length < 4) return out;
      out += String.fromCharCode(parseInt(hex, 16));
      i += 5;
    } else {
      out += ({ n: '\n', t: '\t', r: '', b: '', f: '' })[next] ?? next;
      i += 1;
    }
  }
  return out;
}

/**
 * Read a Messages API event stream into content blocks.
 * Exported for tests; `events` is an async iterable of parsed stream events.
 * `onText` receives answer text as it arrives; `onToolInput` receives a
 * tool-use block and its input JSON so far, each time more arrives.
 *
 * @returns {Promise<{ content: Array, stopReason: string|null, usage: object }>}
 */
export async function readEvents(events, { onText, onToolInput } = {}) {
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
        const soFar = (partialJson.get(event.index) || '') + (d.partial_json || '');
        partialJson.set(event.index, soFar);
        if (onToolInput) onToolInput(block, soFar);
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
 * If the API rejects the request (400 or 404) it is retried in two steps
 * that each give something up: first without the effort setting, then on
 * the fallback model. `model` and `effort` in the result say what answered,
 * so the caller can stay on that for the rest of the turn.
 */
export async function streamMessage({
  system, messages, tools, maxTokens, model, effort, signal, onText, onToolInput, fetchImpl = fetch,
}) {
  const apiKey = getClaudeApiKey();
  if (!apiKey) throw new ClaudeError('not_configured', 'ANTHROPIC_API_KEY not set');

  let useModel = model || getAskModel();
  let useEffort = effort === undefined ? getAskEffort() : effort;
  try {
    for (;;) {
      const body = buildToolRequest({ system, messages, tools, maxTokens, model: useModel, effort: useEffort });
      const r = await fetchImpl(API_URL, { method: 'POST', headers: requestHeaders(apiKey), body: JSON.stringify(body), signal });
      if (r.ok) {
        const out = await readEvents(sseEvents(r.body), { onText, onToolInput });
        return { ...out, model: useModel, effort: useEffort };
      }
      const text = await r.text().catch(() => '');
      if (r.status === 400 || r.status === 404) {
        // Only an effort setting we chose ourselves is ours to drop.
        if (useEffort && body.output_config && !modelShape(useModel, maxTokens).output_config) {
          console.warn(`[ask/claude] ${useModel} rejected (${r.status}): ${text.slice(0, 160)} — retrying without effort`);
          useEffort = null;
          continue;
        }
        if (useModel !== FALLBACK_CLAUDE_MODEL) {
          console.warn(`[ask/claude] ${useModel} rejected (${r.status}): ${text.slice(0, 160)} — retrying on ${FALLBACK_CLAUDE_MODEL}`);
          useModel = FALLBACK_CLAUDE_MODEL;
          continue;
        }
      }
      const code = r.status === 429 || r.status === 529 || r.status === 503 ? 'busy' : 'http_error';
      throw new ClaudeError(code, `Claude API ${r.status}: ${text.slice(0, 200)}`, r.status);
    }
  } catch (err) {
    if (err instanceof ClaudeError) throw err;
    if (isAbort(err)) throw new ClaudeError('timeout', 'Claude request timed out');
    throw new ClaudeError('network_error', err?.message || 'Claude request failed');
  }
}
