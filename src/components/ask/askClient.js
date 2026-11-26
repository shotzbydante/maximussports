/**
 * Ask Maximus client: the calls the chat makes.
 *
 * A signed-in page sends its session token. A signed-out page sends a
 * random device id instead (kept in localStorage, so the daily count
 * follows the browser, not the tab) and holds the conversation itself.
 *
 * sendMessage() reads the answer as it streams. The server sends one JSON
 * object per line (see api/ask/chat.js); `readLines` is exported so the
 * parsing can be tested without a network.
 */

import { getAuthHeaders } from '../../lib/authHeaders';
import { readGuestPass } from '../../features/account/guestPass';

const ENDPOINT = '/api/ask/chat';
const DEVICE_KEY = 'mx_ask_device';
let memoryDevice = null;

function newId() {
  try { return crypto.randomUUID(); } catch { return `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}xxxxxxxx`; }
}

/** This browser's id for counting signed-out questions. Not tied to a person. */
export function deviceId() {
  try {
    let id = window.localStorage.getItem(DEVICE_KEY);
    if (!id) { id = newId(); window.localStorage.setItem(DEVICE_KEY, id); }
    return id;
  } catch {
    // Storage is blocked (private mode, some in-app browsers): the id lasts for this page load.
    memoryDevice ||= newId();
    return memoryDevice;
  }
}

/** Headers that say who is asking: a session, or a device with or without a guest pass. */
export async function whoHeaders() {
  const auth = await getAuthHeaders();
  if (auth.Authorization) return auth;
  return { 'X-Ask-Device': deviceId(), ...(readGuestPass() ? { 'X-Ask-Pass': '1' } : {}) };
}

/** Should the launcher show, and what does the week look like? Never throws. */
export async function fetchStatus({ signedIn = false } = {}) {
  try {
    // Only a signed-in page sends its session: the signed-out answer is the same for everyone and cached.
    const headers = signedIn ? await getAuthHeaders() : {};
    const r = await fetch('/api/ask/status', { headers });
    return r.ok ? await r.json() : { enabled: false };
  } catch { return { enabled: false }; }
}

/** The thread and today's usage, or only what arrived after message `since`. */
export async function fetchThread(since = 0) {
  const headers = await whoHeaders();
  const r = await fetch(since ? `${ENDPOINT}?since=${since}` : ENDPOINT, { headers });
  if (!r.ok) throw new Error(`thread ${r.status}`);
  return r.json();
}

export async function clearThread() {
  const headers = await whoHeaders();
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
 * Resolves to the last event: `done` with the answer, or `error` with a
 * code and a sentence to show.
 *
 * @param {string} text
 * @param {{ page?: object, history?: Array, onEvent?: Function }} [opts]
 *   page: where chat was opened from; history: a guest's own recent messages
 */
export async function sendMessage(text, { page = null, history = null, onEvent = () => {} } = {}) {
  const headers = { 'Content-Type': 'application/json', ...(await whoHeaders()) };
  const payload = { text, ...(page ? { context: { page } } : {}), ...(history ? { history } : {}) };
  let r;
  try {
    r = await fetch(ENDPOINT, { method: 'POST', headers, body: JSON.stringify(payload) });
  } catch {
    return { type: 'error', code: 'offline', message: 'No connection. Check your signal and send that again.' };
  }
  if (!r.ok || !r.body) {
    const body = await r.json().catch(() => ({}));
    return {
      type: 'error',
      code: body.error || (r.status === 401 ? 'signed_out' : 'failed'),
      message: body.message || (r.status === 401 ? 'Your session ended. Sign in again to keep going.' : 'Something went wrong on our side. Send that again.'),
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
  return last || { type: 'error', code: 'interrupted', message: 'The connection dropped before the answer finished. Send that again.' };
}
