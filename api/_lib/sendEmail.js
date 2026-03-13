/**
 * Email sender using the Resend API with rate-limit-safe throttling
 * and automatic retry for transient failures (429, 5xx).
 *
 * Resend rate limit: 2 requests/second on the current plan.
 *
 * Exports:
 *   sendEmail(opts)            — single send, with retry for 429/5xx
 *   sendEmailThrottled(opts)   — single send with pacing delay + retry
 *   SEND_INTERVAL_MS           — minimum ms between sends (configurable)
 */

const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1200;

/** Minimum ms between consecutive sends. 600ms ≈ 1.67/sec, safely under 2/sec. */
export const SEND_INTERVAL_MS = 600;

let _lastSendTime = 0;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Send a single email via Resend with automatic retry on 429 / 5xx.
 *
 * @param {object} opts
 * @param {string|string[]} opts.to
 * @param {string}          opts.subject
 * @param {string}          opts.html
 * @param {string}          [opts.text]
 * @returns {Promise<{ id: string }>}
 */
export async function sendEmail({ to, subject, html, text }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from   = process.env.RESEND_FROM || 'winning@maximussports.ai';

  if (!apiKey) throw new Error('[sendEmail] RESEND_API_KEY is not set.');

  const payload = {
    from: `Maximus Sports <${from}>`,
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
    ...(text ? { text } : {}),
  };

  const recipients = Array.isArray(to) ? to : [to];

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      const result = await res.json();
      if (attempt > 1) {
        console.log(`[sendEmail] OK (attempt ${attempt}) to=${recipients.join(',')} id=${result?.id ?? '(none)'}`);
      } else {
        console.log(`[sendEmail] OK to=${recipients.join(',')} id=${result?.id ?? '(none)'}`);
      }
      return result;
    }

    const status = res.status;
    const body = await res.text().catch(() => '');
    const isRetryable = status === 429 || (status >= 500 && status < 600);

    if (!isRetryable || attempt === MAX_RETRIES) {
      console.error(`[sendEmail] FAILED to=${recipients.join(',')} status=${status} attempt=${attempt}/${MAX_RETRIES} body=${body}`);
      throw new Error(`[sendEmail] Resend API error ${status}: ${body}`);
    }

    // Determine backoff: respect Retry-After header if present, else exponential
    let backoffMs = INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1);
    const retryAfter = res.headers?.get?.('retry-after');
    if (retryAfter) {
      const parsed = Number(retryAfter);
      if (!isNaN(parsed) && parsed > 0) {
        backoffMs = Math.max(parsed * 1000, backoffMs);
      }
    }

    console.warn(`[sendEmail] ${status} to=${recipients.join(',')} — retry ${attempt}/${MAX_RETRIES} in ${backoffMs}ms`);
    await sleep(backoffMs);
  }
}

/**
 * Rate-limited send: enforces minimum spacing between consecutive calls,
 * then delegates to sendEmail (which handles retry internally).
 *
 * Safe for use in a sequential for-loop without additional delays.
 */
export async function sendEmailThrottled(opts) {
  const now = Date.now();
  const elapsed = now - _lastSendTime;
  if (elapsed < SEND_INTERVAL_MS) {
    await sleep(SEND_INTERVAL_MS - elapsed);
  }
  _lastSendTime = Date.now();
  return sendEmail(opts);
}
