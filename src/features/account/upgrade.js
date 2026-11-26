/**
 * Start Stripe Checkout for Pro from anywhere in the app.
 * Resolves to { ok } and never throws; on success the page is already
 * leaving for Stripe.
 */
import { getSupabase } from '../../lib/supabaseClient';
import { track, flush as flushAnalytics } from '../../analytics/index';
import { markSyncing } from '../../hooks/usePlan';

export const PRO_PRICE_TEXT = '$7.99 a month';

export async function startProCheckout({ placement, userId, fetchImpl = fetch, go = (url) => { window.location.href = url; } } = {}) {
  track('upgrade_clicked', { plan_tier: 'free', placement });
  try {
    const sb = getSupabase();
    if (!sb) throw new Error('Not configured');
    const { data: { session } } = await sb.auth.getSession();
    const token = session?.access_token;
    if (!token) throw new Error('Please sign in again.');
    const res = await fetchImpl('/api/stripe/create-checkout-session', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.url) throw new Error(json.error || 'Could not start checkout.');
    if (userId) markSyncing(userId);
    track('checkout_started', { plan: 'pro', placement });
    flushAnalytics();
    go(json.url);
    return { ok: true };
  } catch (err) {
    track('checkout_start_failed', { placement, message: String(err?.message || '').slice(0, 120) });
    return { ok: false, message: err?.message || 'Could not start checkout. Please try again.' };
  }
}
