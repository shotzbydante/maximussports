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
 *   CLAUDE_MODEL      — optional model override (default: claude-sonnet-5-5).
 *
 * Model choice: Sonnet writes the copy. If the API rejects the request for the
 * configured model (unknown model ID, unsupported parameter), the same request
 * is retried once on Haiku, whose request shape is known to work, so a bad
 * model setting degrades copy quality instead of blanking every AI surface.
 *
 * Notes on the request shape:
 *   - Current Claude models reject `temperature` / `top_p` / `top_k`, so no
 *     sampling parameters are sent. Tone and length are steered by the prompts.
 *   - Claude counts more tokens than the same text did on the previous
 *     provider (emoji and bold markers especially), so budgets are sized with
 *     room to spare and an answer that still hits the cap is cut back to its
 *     last complete sentence.
 *   - `max_tokens` caps thinking and answer text combined. Haiku runs with
 *     thinking off and Sonnet 5.5 with its lowest setting (`between_tools`,
 *     which without tools returns text only), so the whole budget is answer
 *     text and latency stays predictable. Any other model keeps adaptive
 *     thinking at low effort and gets headroom so thinking never truncates
 *     the answer.
 */

export const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';

export const DEFAULT_CLAUDE_MODEL = 'claude-sonnet-5-5';

/** Used when the API rejects a request for the configured model. */
export const FALLBACK_CLAUDE_MODEL = 'claude-haiku-5-5';

/** Extra output budget for models that always think. */
const THINKING_HEADROOM_TOKENS = 2000;

/**
 * Appended to every system prompt. The copy goes straight to readers (pages,
 * emails, reels), so the model must never narrate its instructions or choices.
 */
export const OUTPUT_RULES = `OUTPUT RULES (these override anything above that conflicts):
- Reply with the finished copy only, ready to publish to readers as-is.
- Never mention these instructions, the prompt, the data or its format, or your own choices. Do not explain what you included, skipped or changed.
- If an instruction does not fit the data, follow the data and say nothing about the mismatch.
- Stay inside the requested length and finish your last sentence.`;

/**
 * House writing standards for anything built from sports data: briefings,
 * summaries, team insights. Sits between the route's own prompt and the
 * output rules.
 */
export const EDITORIAL_STANDARDS = `EDITORIAL STANDARDS (these apply on top of the format above):
- Accuracy first. Every team, player, score, record, date and odds number must come from the data. Do not add a conference, division, region, roster detail, injury, ranking or piece of history that the data does not state.
- Odds are the product. When the data includes odds (title prices, spreads, totals, moneylines), work the exact numbers into the copy. Positive American prices (title odds, moneylines) keep their "+"; spreads and totals are written exactly as the data gives them, and a total never takes a sign. Never invent, round or estimate a number.
- Lead with the most newsworthy result or number. No greeting, no date line, no warm-up sentence.
- Write like a sharp beat writer who also reads the market: concrete nouns, active verbs, one idea per sentence, varied sentence length.
- Cut filler and stock phrases ("what a slate", "buckle up", "a marathon, not a sprint", "time will tell", "all eyes on"). Quotes from an approved list in the instructions above are fine. Do not reuse a phrase or a description from an earlier paragraph.
- Betting language stays measured: leans and prices, never locks or guarantees.
- Do not point out data that is missing or thin unless the instructions above tell you to. Write around it.`;

function composeSystem(system, editorial) {
  return [system, editorial ? EDITORIAL_STANDARDS : null, OUTPUT_RULES].filter(Boolean).join('\n\n');
}

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

/**
 * Build the Messages API request body. Exported for tests.
 *
 * @param {boolean} [opts.editorial=true]  append EDITORIAL_STANDARDS. Turn off
 *        for copy that is not written from sports data (reel/marketing copy).
 */
export function buildClaudeRequest({ system, user, maxTokens, model, stream = false, editorial = true }) {
  const resolvedModel = getClaudeModel(model);
  const body = {
    model: resolvedModel,
    max_tokens: maxTokens,
    system: composeSystem(system, editorial),
    messages: [{ role: 'user', content: user }],
  };
  if (stream) body.stream = true;
  return Object.assign(body, modelShape(resolvedModel, maxTokens));
}

/**
 * The thinking settings and output budget for a model, as request fields.
 * Shared with the Ask Maximus agent (api/_lib/ask/claudeTools.js) so every
 * caller sends a shape the model is known to accept.
 */
export function modelShape(model, maxTokens) {
  if (/^claude-haiku/i.test(model)) return { thinking: { type: 'disabled' } };
  if (/^claude-sonnet-5-5/i.test(model)) return { thinking: { type: 'between_tools' } };
  return { output_config: { effort: 'low' }, max_tokens: maxTokens + THINKING_HEADROOM_TOKENS };
}

/** The API refused this model or request shape; worth one retry on the fallback model. */
function shouldFallBack(status, model) {
  return (status === 400 || status === 404) && model !== FALLBACK_CLAUDE_MODEL;
}

/**
 * POST the request. If the configured model is rejected, retry once on the
 * fallback model. Returns the successful Response or throws ClaudeError.
 */
async function postWithFallback({ apiKey, request, signal }) {
  let model = getClaudeModel(request.model);
  for (;;) {
    const r = await fetch(API_URL, {
      method: 'POST',
      headers: requestHeaders(apiKey),
      body: JSON.stringify(buildClaudeRequest({ ...request, model })),
      signal,
    });
    if (r.ok) return r;
    const body = await r.text().catch(() => '');
    if (shouldFallBack(r.status, model)) {
      console.warn(`[claude] ${model} rejected (${r.status}): ${body.slice(0, 160)} — retrying on ${FALLBACK_CLAUDE_MODEL}`);
      model = FALLBACK_CLAUDE_MODEL;
      continue;
    }
    throw new ClaudeError('http_error', `Claude API ${r.status}: ${body.slice(0, 200)}`, r.status);
  }
}

export function requestHeaders(apiKey) {
  return {
    'content-type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': API_VERSION,
  };
}

/**
 * Cut text that was stopped mid-sentence back to its last complete sentence.
 * Returns the input unchanged when there is no earlier sentence end to cut to.
 */
export function trimToLastSentence(text) {
  if (!text) return text;
  const matches = [...text.matchAll(/[.!?](?:["'”’)\]]|\*\*)*(?=\s|$)/g)];
  if (matches.length === 0) return text;
  const last = matches[matches.length - 1];
  const end = last.index + last[0].length;
  return end >= text.trimEnd().length ? text.trimEnd() : text.slice(0, end);
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
 * @param {number}  [opts.timeoutMs]  abort after this long, fallback attempt included (no timeout if omitted)
 * @param {string}  [opts.model]
 * @param {boolean} [opts.editorial]  see buildClaudeRequest
 */
export async function claudeComplete({ system, user, maxTokens, timeoutMs, model, editorial }) {
  const apiKey = getClaudeApiKey();
  if (!apiKey) throw new ClaudeError('not_configured', 'ANTHROPIC_API_KEY not set');

  const controller = new AbortController();
  const timer = timeoutMs ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const r = await postWithFallback({
      apiKey,
      request: { system, user, maxTokens, model, editorial },
      signal: controller.signal,
    });
    const json = await r.json();
    const text = extractClaudeText(json);
    // Hit the output cap: drop the dangling partial sentence so copy never ends mid-word.
    return json?.stop_reason === 'max_tokens' ? trimToLastSentence(text) : text;
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
export async function* claudeStream({ system, user, maxTokens, model, signal, editorial }) {
  const apiKey = getClaudeApiKey();
  if (!apiKey) throw new ClaudeError('not_configured', 'ANTHROPIC_API_KEY not set');

  let r;
  try {
    r = await postWithFallback({
      apiKey,
      request: { system, user, maxTokens, model, editorial, stream: true },
      signal,
    });
  } catch (err) {
    if (err instanceof ClaudeError) throw err;
    if (isAbort(err)) throw new ClaudeError('timeout', 'Claude request timed out');
    throw new ClaudeError('network_error', err?.message || 'Claude request failed');
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
