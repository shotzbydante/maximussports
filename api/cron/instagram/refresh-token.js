/**
 * GET /api/cron/instagram/refresh-token
 *
 * Weekly upkeep for the Instagram access token (see api/_lib/instagramAuth.js).
 * A token refreshed every week can never reach its 60-day expiry. If the
 * refresh fails, the admin is emailed, because a dead token otherwise fails
 * silently: publishing just stops.
 *
 * Auth: Vercel Cron (CRON_SECRET) or a signed-in admin.
 */

import { requireAdminOrCron } from '../../_lib/requireAuth.js';
import { refreshInstagramToken } from '../../_lib/instagramAuth.js';
import { sendEmail } from '../../_lib/sendEmail.js';
import { ADMIN_EMAIL } from '../../_lib/admin.js';

async function alertAdmin(result) {
  try {
    const { message, action } = result.error || {};
    await sendEmail({
      to: ADMIN_EMAIL,
      subject: 'Maximus Sports: Instagram posting is disconnected',
      text: [
        'The weekly Instagram token refresh failed, so posting from Content Studio and the autopost job will not work until this is fixed.',
        '',
        `What Instagram said: ${message || 'no detail'}`,
        `What to do: ${action || 'Check INSTAGRAM_ACCESS_TOKEN in Vercel.'}`,
      ].join('\n'),
      html: `<p>The weekly Instagram token refresh failed, so posting from Content Studio and the autopost job will not work until this is fixed.</p><p><b>What Instagram said:</b> ${String(message || 'no detail').replace(/</g, '&lt;')}</p><p><b>What to do:</b> ${String(action || 'Check INSTAGRAM_ACCESS_TOKEN in Vercel.').replace(/</g, '&lt;')}</p>`,
    });
    return true;
  } catch (err) {
    console.warn('[instagram-refresh] alert email failed:', err?.message);
    return false;
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'GET only' });
  if (!(await requireAdminOrCron(req, res))) return;

  const result = await refreshInstagramToken();
  if (result.ok) {
    console.log(`[instagram-refresh] ok: expires ${result.expiresAt} (${result.daysLeft}d), stored=${result.stored}`);
    return res.status(200).json(result);
  }

  console.error(`[instagram-refresh] failed at ${result.stage}: ${result.error?.message}`);
  // A network blip is retried next week with seven weeks of headroom; only a rejected token needs a human.
  const alerted = result.stage === 'network' ? false : await alertAdmin(result);
  return res.status(502).json({ ...result, alerted });
}
