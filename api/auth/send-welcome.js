/**
 * POST /api/auth/send-welcome
 *
 * Sends a branded welcome email to the authenticated user after onboarding.
 * Called client-side when a new user completes the onboarding wizard.
 *
 * Dedup: checks email_send_log for an existing 'welcome' entry for the user.
 * Always returns { ok: true } — non-critical, best-effort send.
 *
 * Auth: requires a valid Supabase JWT.
 */

import { verifyUserToken, getSupabaseAdmin } from '../_lib/supabaseAdmin.js';
import { sendEmail } from '../_lib/sendEmail.js';
import { renderHTML, renderText, getSubject } from '../../src/emails/templates/confirmSignup.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  if (!token) {
    return res.status(200).json({ ok: true });
  }

  let user;
  try {
    user = await verifyUserToken(token);
  } catch {
    return res.status(200).json({ ok: true });
  }

  if (!user?.email) {
    return res.status(200).json({ ok: true });
  }

  try {
    const sb = getSupabaseAdmin();

    // Dedup — only one welcome email per user, ever
    const { data: existing } = await sb
      .from('email_send_log')
      .select('id')
      .eq('user_id', user.id)
      .eq('type', 'welcome')
      .limit(1);

    if (existing && existing.length > 0) {
      console.log(`[send-welcome] Skipped ${user.email} — already sent`);
      return res.status(200).json({ ok: true, skipped: 'already_sent' });
    }

    const html    = renderHTML({ isWelcome: true });
    const text    = renderText({ isWelcome: true });
    const subject = getSubject({ isWelcome: true });

    await sendEmail({ to: user.email, subject, html, text });

    // Log the send for dedup
    await sb.from('email_send_log').insert({
      user_id:  user.id,
      email:    user.email,
      type:     'welcome',
      date_key: `welcome_${user.id}`,
      sent_at:  new Date().toISOString(),
    }).catch(err => {
      console.warn('[send-welcome] Failed to log send:', err?.message);
    });

    console.log(`[send-welcome] Sent welcome email to ${user.email}`);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[send-welcome] error:', err?.message ?? err);
    return res.status(200).json({ ok: true });
  }
}
