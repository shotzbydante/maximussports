/**
 * POST /api/billing/sync
 *
 * Fallback subscription sync for cases where the Stripe webhook was delayed
 * or missed entirely. Validates the caller's Supabase JWT, looks up their
 * Stripe subscription, and updates the profiles row if active.
 *
 * Lookup strategy (in order):
 *   1. profiles.stripe_subscription_id  → retrieve subscription directly
 *   2. profiles.stripe_customer_id      → list active/trialing subscriptions
 *   3. caller.email (from JWT)          → search Stripe customers by email
 *      (safe: we never accept email from the request body)
 *
 * Always returns:
 *   { ok, isPro, synced, already, plan_tier, subscription_status }
 *
 * Hard rules:
 *   • Only upgrades to Pro (never downgrades).
 *   • Does NOT replace or modify the primary webhook flow.
 *   • Rate-limiting is enforced client-side (called at most once per Settings visit).
 *
 * Required env vars (same as stripe/webhook.js):
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

function ok200(res, payload) {
  return res.status(200).json({ ok: true, isPro: payload.plan_tier === 'pro', ...payload });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  // ── Authenticate caller ───────────────────────────────────────────────────
  const authHeader = req.headers.authorization ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) {
    return res.status(401).json({ ok: false, error: 'Missing authorization token' });
  }

  let caller;
  try {
    caller = await verifyUserToken(token);
  } catch {
    return res.status(503).json({ ok: false, error: 'Auth service unavailable' });
  }

  if (!caller?.id) {
    return res.status(401).json({ ok: false, error: 'Invalid or expired token' });
  }

  const userId    = caller.id;
  const userEmail = caller.email ?? null;

  // ── Fetch current profile (service role — bypasses RLS) ──────────────────
  let sb;
  try {
    sb = getSupabaseAdmin();
  } catch {
    return res.status(503).json({ ok: false, error: 'Database service unavailable' });
  }

  const { data: profile, error: profileErr } = await sb
    .from('profiles')
    .select('plan_tier, subscription_status, stripe_customer_id, stripe_subscription_id')
    .eq('id', userId)
    .maybeSingle();

  if (profileErr) {
    console.error('[billing/sync] profile fetch error:', profileErr.message);
    return res.status(500).json({ ok: false, error: 'Could not fetch profile' });
  }

  // Already Pro — nothing to do.
  const alreadyPro =
    profile?.plan_tier === 'pro' &&
    (profile?.subscription_status === 'active' || profile?.subscription_status === 'trialing');

  if (alreadyPro) {
    return ok200(res, {
      synced:              false,
      already:             true,
      plan_tier:           'pro',
      subscription_status: profile.subscription_status,
    });
  }

  if (!stripe) {
    return res.status(503).json({ ok: false, error: 'Stripe not configured' });
  }

  const customerId     = profile?.stripe_customer_id ?? null;
  const subscriptionId = profile?.stripe_subscription_id ?? null;

  let activeSub      = null;
  let resolvedCustId = customerId;

  // ── 1) Direct subscription lookup ────────────────────────────────────────
  if (subscriptionId) {
    try {
      const sub = await stripe.subscriptions.retrieve(subscriptionId);
      if (sub.status === 'active' || sub.status === 'trialing') {
        activeSub = sub;
        resolvedCustId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id ?? resolvedCustId;
      }
    } catch (err) {
      console.warn('[billing/sync] subscription retrieve failed:', err.message);
    }
  }

  // ── 2) List by customer ID ────────────────────────────────────────────────
  if (!activeSub && customerId) {
    for (const status of ['active', 'trialing']) {
      try {
        const list = await stripe.subscriptions.list({ customer: customerId, status, limit: 3 });
        if (list.data.length > 0) {
          activeSub = list.data[0];
          break;
        }
      } catch (err) {
        console.warn(`[billing/sync] subscription list (${status}) failed:`, err.message);
      }
    }
  }

  // ── 3) Email-based customer lookup (safe: uses JWT email, not request body) ──
  if (!activeSub && userEmail) {
    try {
      // stripe.customers.list supports filtering by exact email
      const customers = await stripe.customers.list({ email: userEmail, limit: 5 });

      // Sort by most recently created (most likely to have the active sub).
      const sorted = [...customers.data].sort((a, b) => b.created - a.created);

      for (const customer of sorted) {
        for (const status of ['active', 'trialing']) {
          try {
            const list = await stripe.subscriptions.list({
              customer: customer.id,
              status,
              limit: 3,
            });
            if (list.data.length > 0) {
              activeSub      = list.data[0];
              resolvedCustId = customer.id;
              console.log('[billing/sync] found sub via email lookup, customer:', customer.id);
              break;
            }
          } catch (innerErr) {
            console.warn('[billing/sync] sub list for email customer failed:', innerErr.message);
          }
        }
        if (activeSub) break;
      }
    } catch (err) {
      console.warn('[billing/sync] email customer lookup failed:', err.message);
    }
  }

  // ── No active subscription found ─────────────────────────────────────────
  if (!activeSub) {
    console.log('[billing/sync] no active subscription found for user', userId, 'email:', userEmail);
    return ok200(res, {
      synced:              false,
      already:             false,
      plan_tier:           profile?.plan_tier ?? 'free',
      subscription_status: profile?.subscription_status ?? null,
    });
  }

  // ── Active subscription found — update profiles ───────────────────────────
  const subCustId = typeof activeSub.customer === 'string'
    ? activeSub.customer
    : activeSub.customer?.id ?? resolvedCustId;

  const fields = {
    plan_tier:              'pro',
    subscription_status:    activeSub.status,
    stripe_customer_id:     subCustId,
    stripe_subscription_id: activeSub.id,
    current_period_end:     activeSub.current_period_end
      ? new Date(activeSub.current_period_end * 1000).toISOString()
      : null,
    cancel_at_period_end:   activeSub.cancel_at_period_end ?? false,
    updated_at:             new Date().toISOString(),
  };

  const { error: updateErr } = await sb
    .from('profiles')
    .upsert({ id: userId, ...fields }, { onConflict: 'id' });

  if (updateErr) {
    console.error('[billing/sync] profile update error:', updateErr.message);
    return res.status(500).json({ ok: false, error: 'Could not update subscription state' });
  }

  console.log('[billing/sync] synced Pro for user', userId, 'sub', activeSub.id);

  return ok200(res, {
    synced:              true,
    already:             false,
    plan_tier:           'pro',
    subscription_status: activeSub.status,
  });
}
