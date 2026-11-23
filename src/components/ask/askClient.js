/**
 * Ask Maximus client: the three calls the chat page makes.
 *
 * sendMessage() reads the answer as it streams. The server sends one JSON
 * object per line (see api/ask/chat.js); `readLines` is exported so the
 * parsing can be tested without a network.
 */

import { getAuthHeaders } from '../../lib/authHeaders';

const ENDPOINT = '/api/ask/chat';

/** The thread, or only what arrived after message `since`. */
export async function fetchThread(since = 0) {
  const headers = await getAuthHeaders();
  const r = await fetch(since ? `${ENDPOINT}?since=${since}` : ENDPOINT, { headers });
  if (!r.ok) throw new Error(`thread ${r.status}`);
  return r.json();
}

export async function clearThread() {
  const headers = await getAuthHeaders();
  const r = await fetch(ENDPOINT, { method: 'DELETE', headers });
  return r.ok;
}

/** Split a stream of text chunks into parsed JSON lines. */
export async function* readLines(chunks) {
  let buffer = '';
  for await (const chunk of chunks) {
    buffer += chunk;
    let nl;
    while ((nl = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      try { yield JSON.parse(line); } catch { /* skip a broken line */ }
    }
  }
  const rest = buffer.trim();
  if (rest) { try { yield JSON.parse(rest); } catch { /* ignore */ } }
}

async function* decode(body) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    yield decoder.decode(value, { stream: true });
  }
}

/**
 * Send one message. `onEvent` receives each stream event as it arrives.
 * Resolves to the last event: `done` with the stored answer, or `error`
 * with a code and a sentence to show.
 */
export async function sendMessage(text, onEvent = () => {}) {
  const headers = { 'Content-Type': 'application/json', ...(await getAuthHeaders()) };
  let r;
  try {
    r = await fetch(ENDPOINT, { method: 'POST', headers, body: JSON.stringify({ text }) });
  } catch {
    return { type: 'error', code: 'offline', message: 'No connection. Check your signal and send that again.' };
  }
  if (!r.ok || !r.body) {
    const body = await r.json().catch(() => ({}));
    return {
      type: 'error',
      code: body.error || (r.status === 401 ? 'signed_out' : 'failed'),
      message: body.message || (r.status === 401 ? 'Sign in to ask Maximus.' : 'Something went wrong on our side. Send that again.'),
      usage: body.usage,
    };
  }
  let last = null;
  try {
    for await (const event of readLines(decode(r.body))) {
      onEvent(event);
      if (event.type === 'done' || event.type === 'error') last = event;
    }
  } catch { /* the connection dropped mid-answer */ }
  return last || { type: 'error', code: 'interrupted', message: 'The connection dropped before the answer finished. It may appear when you reopen this page.' };
}
