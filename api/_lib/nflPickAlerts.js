/**
 * Pick alerts: email Pro accounts the moment a recommended NFL pick is locked.
 *
 * Runs on every /api/cron/nfl/build-picks call (every ten minutes), whether
 * or not that call built a board, because a pick can also be locked by a
 * build that a page view started.
 *
 * Each pick is alerted at most once. The picks are claimed first
 * (`picks.alerted_at` is set where it was null, and only the rows that
 * update are sent), so two overlapping runs cannot both send. If the send
 * then fails the alert is lost, not repeated: a late duplicate about a
 * price is worse than a missed email, and the pick is on the site.
 *
 * Who gets one: a Pro account with an active subscription whose
 * `nfl_pick_alerts` preference is not switched off.
 */

import { getSupabaseAdmin } from './supabaseAdmin.js';
import { sendEmailThrottled } from './sendEmail.js';
import { effectivePlanTier } from './entitlements.js';
import { resolvePreferences } from './emailDefaults.js';
import { renderHTML, renderText, getSubject, alertPicks } from '../../src/emails/templates/nflPickAlert.js';

/** A pick locked longer ago than this is old news, not an alert. */
export const ALERT_WINDOW_MIN = 180;
export const ALERT_TYPE = 'nfl_pick_alert';

const isMissingColumn = (error) => error?.code === '42703' || /alerted_at/.test(error?.message || '');

/** Pro, paid up, and has not switched pick alerts off. */
export function wantsPickAlerts(profile) {
  if (effectivePlanTier(profile) !== 'pro') return false;
  return resolvePreferences(profile?.preferences).nfl_pick_alerts !== false;
}

/**
 * @returns {Promise<{ ok:boolean, picks:number, sent:number, failed:number, reason?:string }>}
 */
export async function sendNewPickAlerts({ now = new Date(), send = sendEmailThrottled, sb: sbArg } = {}) {
  const none = (extra = {}) => ({ ok: true, picks: 0, sent: 0, failed: 0, ...extra });
  let sb = sbArg;
  if (!sb) { try { sb = getSupabaseAdmin(); } catch { return { ...none(), ok: false, reason: 'no_supabase' }; } }

  // Claim: recommended picks (they carry a payload; leans do not) locked recently, not yet alerted, not kicked off.
  const since = new Date(now.getTime() - ALERT_WINDOW_MIN * 60_000).toISOString();
  const { data: claimed, error } = await sb
    .from('picks')
    .update({ alerted_at: now.toISOString() })
    .eq('sport', 'nfl')
    .is('alerted_at', null)
    .not('payload', 'is', null)
    .neq('tier', 'tracking')
    .gte('locked_at', since)
    .gt('start_time', now.toISOString())
    .select('id, payload');
  if (error) {
    if (isMissingColumn(error)) return { ...none(), ok: false, reason: 'migration_missing' };
    return { ...none(), ok: false, reason: error.message };
  }
  const picks = (claimed || []).map((r) => r.payload).filter(Boolean);
  if (alertPicks(picks, { now: now.getTime() }).length === 0) return none();

  const { data: profiles, error: pErr } = await sb
    .from('profiles')
    .select('id, display_name, preferences, plan_tier, subscription_status')
    .eq('plan_tier', 'pro');
  if (pErr) return { ok: false, picks: picks.length, sent: 0, failed: 0, reason: pErr.message };
  const recipients = (profiles || []).filter(wantsPickAlerts);

  let sent = 0;
  let failed = 0;
  for (const profile of recipients) {
    try {
      const { data } = await sb.auth.admin.getUserById(profile.id);
      const email = data?.user?.email;
      if (!email) { failed += 1; continue; }
      const args = { picks, displayName: profile.display_name || '', userId: profile.id, now: now.getTime() };
      await send({ to: email, subject: getSubject(args), html: renderHTML(args), text: renderText(args) });
      sent += 1;
      await sb.from('email_send_log').insert({
        digest_type: ALERT_TYPE, user_id: profile.id, email, sent_at: new Date().toISOString(),
        run_mode: 'scheduled', metadata: { picks: (claimed || []).map((r) => r.id) },
      });
    } catch (e) {
      failed += 1;
      console.error(`[nflPickAlerts] send failed user=${profile.id}: ${e?.message || e}`);
    }
  }
  console.log(`[nflPickAlerts] picks=${picks.length} recipients=${recipients.length} sent=${sent} failed=${failed}`);
  return { ok: true, picks: picks.length, sent, failed };
}
