/**
 * Claude (Anthropic Messages API) client for server routes.
 *
 * Every LLM-generated briefing, summary, insight and reel copy in the app
 * goes through this module. It talks to the REST API directly with fetch,
 * so there is no SDK dependency.
 *
 * Env:
 *   ANTHROPIC_API_KEY — required. Without it the helpers report "not configured"
 *                       and callers fall back to their non-AI behaviour.
 *   CLAUDE_MODEL      — optional model override (default: claude-haiku-5-5).
 *
 * Notes on the request shape:
 *   - Current Claude models reject `temperature` / `top_p` / `top_k`, so no
 *     sampling parameters are sent. Tone and length are steered by the prompts.
 *   - `max_tokens` caps thinking and answer text combined. Haiku runs with
 *     thinking off, so the whole budget is answer text. Other models cannot
 *     turn thinking off; for those the helper asks for low effort and adds
 *     headroom so thinking never truncates the answer.
 */

const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';

export const DEFAULT_CLAUDE_MODEL = 'claude-haiku-5-5';

/** Extra output budget for models that always think. */
const THINKING_HEADROOM_TOKENS = 2000;

export function getClaudeModel(override) {
  const fromEnv = (process.env.CLAUDE_MODEL || '').trim();
  return (override && String(override).trim()) || fromEnv || DEFAULT_CLAUDE_MODEL;
}

export function getClaudeApiKey() {
  const key = (process.env.ANTHROPIC_API_KEY || '').trim();
  return key || null;
}

export function isClaudeConfigured() {
  return getClaudeApiKey() !== null;
}

function isHaiku(model) {
  return /^claude-haiku/i.test(model);
}

/** Build the Messages API request body. Exported for tests. */
export function buildClaudeRequest({ system, user, maxTokens, model, stream = false }) {
  const resolvedModel = getClaudeModel(model);
  const body = {
    model: resolvedModel,
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: user }],
  };
  if (system) body.system = system;
  if (stream) body.stream = true;

  if (isHaiku(resolvedModel)) {
    body.thinking = { type: 'disabled' };
  } else {
    body.output_config = { effort: 'low' };
    body.max_tokens = maxTokens + THINKING_HEADROOM_TOKENS;
  }
  return body;
}

function requestHeaders(apiKey) {
  return {
    'content-type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': API_VERSION,
  };
}

/** Join the text blocks of a Messages API response, skipping thinking blocks. */
export function extractClaudeText(json) {
  const blocks = Array.isArray(json?.content) ? json.content : [];
  const text = blocks
    .filter((b) => b?.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('');
  return text.trim() || null;
}

export class ClaudeError extends Error {
  constructor(code, message, status = null) {
    super(message);
    this.name = 'ClaudeError';
    this.code = code; // 'not_configured' | 'timeout' | 'http_error' | 'api_error' | 'network_error'
    this.status = status;
  }
}

function isAbort(err) {
  return err?.name === 'AbortError' || /aborted/i.test(err?.message || '');
}

/**
 * One-shot completion. Resolves to the answer text (or null when the model
 * returned no text). Throws ClaudeError on configuration, HTTP, network or
 * timeout failures so callers can decide how loudly to log.
 *
 * @param {object}  opts
 * @param {string}  [opts.system]
 * @param {string}  opts.user
 * @param {number}  opts.maxTokens
 * @param {number}  [opts.timeoutMs]  abort after this long (no timeout if omitted)
 * @param {string}  [opts.model]
 */
export async function claudeComplete({ system, user, maxTokens, timeoutMs, model }) {
  const apiKey = getClaudeApiKey();
  if (!apiKey) throw new ClaudeError('not_configured', 'ANTHROPIC_API_KEY not set');

  const controller = new AbortController();
  const timer = timeoutMs ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const r = await fetch(API_URL, {
      method: 'POST',
      headers: requestHeaders(apiKey),
      body: JSON.stringify(buildClaudeRequest({ system, user, maxTokens, model })),
      signal: controller.signal,
    });
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      throw new ClaudeError('http_error', `Claude API ${r.status}: ${body.slice(0, 200)}`, r.status);
    }
    return extractClaudeText(await r.json());
  } catch (err) {
    if (err instanceof ClaudeError) throw err;
    if (isAbort(err)) throw new ClaudeError('timeout', 'Claude request timed out');
    throw new ClaudeError('network_error', err?.message || 'Claude request failed');
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Streaming completion. Async generator that yields answer text deltas as they
 * arrive. Throws ClaudeError if the request fails, the API reports an error
 * mid-stream, or the stream ends before the message is complete.
 */
export async function* claudeStream({ system, user, maxTokens, model, signal }) {
  const apiKey = getClaudeApiKey();
  if (!apiKey) throw new ClaudeError('not_configured', 'ANTHROPIC_API_KEY not set');

  let r;
  try {
    r = await fetch(API_URL, {
      method: 'POST',
      headers: requestHeaders(apiKey),
      body: JSON.stringify(buildClaudeRequest({ system, user, maxTokens, model, stream: true })),
      signal,
    });
  } catch (err) {
    if (isAbort(err)) throw new ClaudeError('timeout', 'Claude request timed out');
    throw new ClaudeError('network_error', err?.message || 'Claude request failed');
  }
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    throw new ClaudeError('http_error', `Claude API ${r.status}: ${body.slice(0, 200)}`, r.status);
  }

  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finished = false;

  while (!finished) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');

    let sep;
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      const rawEvent = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);

      let data = '';
      for (const line of rawEvent.split('\n')) {
        if (line.startsWith('data:')) data += line.slice(5).trimStart();
      }
      if (!data) continue;

      let event;
      try {
        event = JSON.parse(data);
      } catch {
        continue;
      }

      if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
        if (event.delta.text) yield event.delta.text;
      } else if (event.type === 'error') {
        throw new ClaudeError(
          'api_error',
          `${event.error?.type || 'error'}: ${event.error?.message || 'stream error'}`,
        );
      } else if (event.type === 'message_stop') {
        finished = true;
        break;
      }
      // message_start, content_block_start/stop, message_delta, ping, thinking
      // and signature deltas, and any future event types are ignored.
    }
  }

  if (!finished) throw new ClaudeError('network_error', 'Claude stream ended before completion');
}
