/**
 * The signed-out half of signing up: ask for the confirmation email, then
 * confirm the address with either the emailed link or the emailed code.
 *
 * The code exists for in-app browsers. Someone who taps through from
 * Instagram or Facebook is in that app's own browser; the link in the email
 * opens in Safari or Chrome, which knows nothing about the page they started
 * on. Typing the code finishes the sign-up where it began.
 *
 * Nothing here touches React, so it can be tested on its own.
 */

/** The server sends at most one email per address per minute. */
export const RESEND_COOLDOWN_SECONDS = 60;

/** A request that has not answered by now is treated as failed. */
export const SEND_TIMEOUT_MS = 20000;

/** Where a guest is sent after signing up when the link they came through did not say. */
export const DEFAULT_AFTER_SIGNUP = '/nfl/insights';

/** A same-site path, or null. Blocks other hosts and schemes. */
export function safeNext(raw) {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length >= 512) return null;
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return null;
  if (/^[a-z]+:/i.test(raw)) return null;
  return raw;
}

/** The ?next= of the sign-up page, if it is one we will follow. */
export function nextFromSearch(search) {
  try {
    return safeNext(new URLSearchParams(search || '').get('next'));
  } catch {
    return null;
  }
}

/** The page that finishes a sign-in and routes a new account into setup. */
export function callbackPath(next) {
  const n = safeNext(next);
  return n ? `/auth/callback?next=${encodeURIComponent(n)}` : '/auth/callback';
}

/** Digits only, capped at the longest code Supabase issues. */
export function cleanCode(raw) {
  return String(raw ?? '').replace(/\D/g, '').slice(0, 10);
}

export function isCompleteCode(code) {
  return /^\d{6,10}$/.test(code);
}

/**
 * Ask the server to email the link and code.
 * Resolves to { ok } and never throws: `reason` is 'timeout', 'network' or 'server'.
 */
export async function requestSignupEmail({ email, next, fetchImpl = fetch, timeoutMs = SEND_TIMEOUT_MS }) {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const res = await fetchImpl('/api/auth/send-confirm-signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, next: safeNext(next) }),
      signal: controller?.signal,
    });
    await res.json().catch(() => ({}));
    return res.ok ? { ok: true } : { ok: false, reason: 'server' };
  } catch (err) {
    return { ok: false, reason: err?.name === 'AbortError' ? 'timeout' : 'network' };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** What to tell someone whose code did not work. */
export function codeErrorMessage(reason) {
  if (reason === 'expired') return 'That code has expired or was already used. Tap “Resend email” for a new one.';
  if (reason === 'invalid') return 'That code does not match. Check the newest email from us and try again.';
  if (reason === 'network') return 'Could not reach the server. Check your connection and try again.';
  return 'Could not confirm that code. Try again, or tap the button in the email.';
}

/**
 * Confirm the address with the emailed code. On success the Supabase client
 * holds the session, exactly as if the emailed link had been opened here.
 * Resolves to { ok } and never throws.
 */
export async function verifySignupCode({ supabase, email, code }) {
  const token = cleanCode(code);
  if (!supabase) return { ok: false, reason: 'unavailable' };
  if (!isCompleteCode(token)) return { ok: false, reason: 'invalid' };
  try {
    const { data, error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
    if (error || !data?.session) {
      const msg = String(error?.message || '').toLowerCase();
      const code_ = String(error?.code || '').toLowerCase();
      if (code_ === 'otp_expired' || msg.includes('expired')) return { ok: false, reason: 'expired' };
      if (msg.includes('invalid') || msg.includes('not found')) return { ok: false, reason: 'invalid' };
      if (msg.includes('fetch') || msg.includes('network')) return { ok: false, reason: 'network' };
      return { ok: false, reason: 'other' };
    }
    return { ok: true, user: data.user ?? data.session.user };
  } catch {
    return { ok: false, reason: 'network' };
  }
}
