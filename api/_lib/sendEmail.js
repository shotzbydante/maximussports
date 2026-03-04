/**
 * Email sender using the Resend API.
 * From address: Maximus Sports <winning@maximussports.ai>
 *
 * @param {object} opts
 * @param {string|string[]} opts.to      — recipient email(s)
 * @param {string}          opts.subject — email subject
 * @param {string}          opts.html    — HTML body
 * @param {string}          [opts.text]  — plain-text fallback
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

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`[sendEmail] Resend API error ${res.status}: ${body}`);
  }

  return res.json();
}
