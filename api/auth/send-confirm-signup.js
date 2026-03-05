/* global process */
/**
 * POST /api/auth/send-confirm-signup
 *
 * Generates a Supabase magic-link for the given email (via the Admin API so
 * we control the email) and sends a branded Maximus confirmation email via Resend.
 *
 * Security design:
 *  - Always returns { ok: true } — no user enumeration (same response for valid/invalid/existing email)
 *  - redirectTo is server-side fixed — no user-supplied redirect targets
 *  - In-memory throttle (per email, 60 s) prevents accidental rapid re-sends
 *  - Errors are logged server-side only; generic response to client
 *
 * Input:  POST { email: string }
 * Output: { ok: true } always (200)
 */

import { getSupabaseAdmin } from '../_lib/supabaseAdmin.js';
import { sendEmail }        from '../_lib/sendEmail.js';
import { renderHTML, renderText, getSubject } from '../../src/emails/templates/confirmSignup.js';

// ── In-memory throttle (best-effort — resets on Vercel cold starts) ──────────
// Prevents accidental double-sends within a 60 s window.
// For production-grade rate-limiting, swap with Vercel KV / Upstash.
const _throttle = new Map(); // Map<normalizedEmail, timestampMs>
const THROTTLE_MS = 60 * 1000; // 60 seconds

function isThrottled(email) {
  const last = _throttle.get(email);
  return last !== undefined && Date.now() - last < THROTTLE_MS;
}

function setThrottled(email) {
  _throttle.set(email, Date.now());
  // Prune stale entries to prevent unbounded memory growth on long-lived instances
  if (_throttle.size > 500) {
    const cutoff = Date.now() - THROTTLE_MS * 2;
    for (const [k, v] of _throttle) {
      if (v < cutoff) _throttle.delete(k);
    }
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email } = req.body || {};

  // Basic normalisation and sanity check
  const normalised = typeof email === 'string' ? email.trim().toLowerCase() : '';
  const isValidEmail = normalised.length > 0 &&
    normalised.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalised);

  // Always return ok=true to avoid revealing whether an email is registered
  if (!isValidEmail) {
    return res.status(200).json({ ok: true });
  }

  // Throttle — silent
  if (isThrottled(normalised)) {
    return res.status(200).json({ ok: true });
  }
  setThrottled(normalised);

  try {
    const sb = getSupabaseAdmin();

    // Fixed redirect — never accept from client to prevent open redirect
    const APP_URL   = process.env.APP_URL || process.env.VITE_APP_URL || 'https://maximussports.ai';
    const redirectTo = `${APP_URL}/settings`;

    // Generate a magic link using the Admin API (does NOT send Supabase's default email)
    const { data, error } = await sb.auth.admin.generateLink({
      type: 'magiclink',
      email: normalised,
      options: { redirectTo },
    });

    if (error || !data?.properties?.action_link) {
      console.error('[send-confirm-signup] generateLink failed:', error?.message ?? 'missing action_link');
      return res.status(200).json({ ok: true });
    }

    const confirmUrl = data.properties.action_link;

    // Render branded email
    const html    = renderHTML({ confirmUrl });
    const text    = renderText({ confirmUrl });
    const subject = getSubject();

    await sendEmail({ to: normalised, subject, html, text });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[send-confirm-signup] error:', err?.message ?? err);
    return res.status(200).json({ ok: true }); // Always ok — no enumeration
  }
}
