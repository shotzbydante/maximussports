/**
 * POST /api/billing/sync
 *
 * Fallback subscription sync for cases where the Stripe webhook was delayed
 * or missed. Validates the caller's Supabase JWT, looks up their Stripe
 * subscription via the stored stripe_customer_id, and updates the profiles
 * row if an active subscription is found.
 *
 * This is intentionally minimal and non-destructive:
 *  - It only upgrades plan_tier to 'pro' (never downgrades).
 *  - It does NOT replace the primary webhook flow.
 *  - It is rate-limited by client-side call sites (called at most once per
 *    Settings visit after a checkout attempt).
 *
 * Required env vars (same as existing stripe/webhook.js):
 *   STRIPE_SECRET_KEY
 *   SUPABASE_URL / VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   SUPABASE_ANON_KEY / VITE_SUPABASE_ANON_KEY
 */

import Stripe from 'stripe';
import { verifyUserToken, getSupabaseAdmin } from '../_lib/supabaseAdmin.js';

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' })
  : null;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── Authenticate caller ───────────────────────────────────────────────────
  const authHeader = req.headers.authorization ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) {
    return res.status(401).json({ error: 'Missing authorization token' });
  }

  let caller;
  try {
    caller = await verifyUserToken(token);
  } catch (err) {
    return res.status(503).json({ error: 'Auth service unavailable' });
  }

  if (!caller?.id) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  const userId = caller.id;

  // ── Fetch current profile ─────────────────────────────────────────────────
  let sb;
  try {
    sb = getSupabaseAdmin();
  } catch (err) {
    return res.status(503).json({ error: 'Database service unavailable' });
  }

  const { data: profile, error: profileErr } = await sb
    .from('profiles')
    .select('plan_tier, subscription_status, stripe_customer_id, stripe_subscription_id')
    .eq('id', userId)
    .maybeSingle();

  if (profileErr) {
    console.error('[billing/sync] profile fetch error:', profileErr.message);
    return res.status(500).json({ error: 'Could not fetch profile' });
  }

  // If already Pro, nothing to do.
  const alreadyPro =
    profile?.plan_tier === 'pro' &&
    (profile?.subscription_status === 'active' || profile?.subscription_status === 'trialing');

  if (alreadyPro) {
    return res.status(200).json({
      synced:  false,
      already: true,
      plan_tier: 'pro',
      subscription_status: profile.subscription_status,
    });
  }

  // ── Look up Stripe subscription ───────────────────────────────────────────
  if (!stripe) {
    return res.status(503).json({ error: 'Stripe not configured' });
  }

  const customerId = profile?.stripe_customer_id;
  const subscriptionId = profile?.stripe_subscription_id;

  let activeSub = null;

  // Try subscription ID first (most precise).
  if (subscriptionId) {
    try {
      const sub = await stripe.subscriptions.retrieve(subscriptionId);
      if (sub.status === 'active' || sub.status === 'trialing') {
        activeSub = sub;
      }
    } catch (err) {
      console.warn('[billing/sync] subscription retrieve failed:', err.message);
    }
  }

  // Fall back to listing subscriptions by customer ID.
  if (!activeSub && customerId) {
    try {
      const list = await stripe.subscriptions.list({
        customer: customerId,
        status:   'active',
        limit:    5,
      });
      activeSub = list.data[0] ?? null;

      // Also check trialing if no active found.
      if (!activeSub) {
        const trialingList = await stripe.subscriptions.list({
          customer: customerId,
          status:   'trialing',
          limit:    5,
        });
        activeSub = trialingList.data[0] ?? null;
      }
    } catch (err) {
      console.warn('[billing/sync] subscription list failed:', err.message);
    }
  }

  // If no active subscription found, return current state.
  if (!activeSub) {
    console.log('[billing/sync] no active subscription found for user', userId);
    return res.status(200).json({
      synced:  false,
      already: false,
      plan_tier: profile?.plan_tier ?? 'free',
      subscription_status: profile?.subscription_status ?? null,
    });
  }

  // ── Active subscription found — update profiles ───────────────────────────
  const fields = {
    plan_tier:              'pro',
    subscription_status:    activeSub.status,
    stripe_customer_id:     activeSub.customer ?? customerId,
    stripe_subscription_id: activeSub.id,
    current_period_end:     activeSub.current_period_end
      ? new Date(activeSub.current_period_end * 1000).toISOString()
      : null,
    cancel_at_period_end:   activeSub.cancel_at_period_end ?? false,
    updated_at:             new Date().toISOString(),
  };

  // Upsert in case the profile row was missing (ensures idempotency).
  const { error: updateErr } = await sb
    .from('profiles')
    .upsert({ id: userId, ...fields }, { onConflict: 'id' });

  if (updateErr) {
    console.error('[billing/sync] profile update error:', updateErr.message);
    return res.status(500).json({ error: 'Could not update subscription state' });
  }

  console.log('[billing/sync] synced Pro for user', userId, 'sub', activeSub.id);

  return res.status(200).json({
    synced:              true,
    already:             false,
    plan_tier:           'pro',
    subscription_status: activeSub.status,
  });
}
