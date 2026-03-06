/**
 * POST /api/billing/sync
 *
 * Fallback subscription sync for cases where the Stripe webhook was delayed
 * or missed. Validates the caller's Supabase JWT, looks up their Stripe
 * subscription, and updates the profiles row if active.
 *
 * Columns written to profiles (only columns confirmed to exist):
 *   plan_tier, subscription_status, stripe_customer_id, stripe_subscription_id,
 *   updated_at
 *
 * NEVER writes: cancel_at_period_end, current_period_end,
 *               payment_method_last4, payment_method_brand, email
 * These columns may not exist in all deployments.
 *
 * Lookup strategy (in order, most → least reliable):
 *   0. session_id in request body → retrieve Checkout Session from Stripe
 *      (only valid for the authenticated user's email / supabase_user_id)
 *   1. profiles.stripe_subscription_id  → retrieve subscription directly
 *   2. profiles.stripe_customer_id      → list active/trialing subscriptions
 *   3. caller.email (from JWT, never request body) → search Stripe customers
 *
 * Always returns: { ok, isPro, synced, already, plan_tier, subscription_status }
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

const _debug =
  typeof process !== 'undefined' &&
  process.env.NODE_ENV !== 'production';

function dbg(...args) {
  if (_debug) console.log('[billing/sync]', ...args);
}

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

  // session_id is safe to accept from the body — we validate ownership below.
  const sessionId = req.body?.session_id ?? null;

  const debugRequested =
    req.headers['x-debug-plan'] === '1' ||
    (req.url && req.url.includes('debugPlan=1'));

  function log(...args) {
    if (debugRequested || _debug) console.log('[billing/sync]', ...args);
  }

  log('invoked for user', userId.slice(0, 8), 'sessionId:', sessionId ? 'present' : 'none');

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

  log('profile:', { plan_tier: profile?.plan_tier, subscription_status: profile?.subscription_status, has_cid: !!profile?.stripe_customer_id });

  // Already Pro — nothing to do.
  const alreadyPro =
    profile?.plan_tier === 'pro' &&
    (profile?.subscription_status === 'active' || profile?.subscription_status === 'trialing');

  if (alreadyPro) {
    log('already pro — skipping Stripe lookup');
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
  let lookupPath     = 'none';

  // ── Path 0: Stripe Checkout session_id (most reliable on upgrade return) ──
  if (sessionId && !activeSub) {
    try {
      const checkoutSession = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ['subscription'],
      });

      // Validate ownership: session must match this user's ID or email.
      const sessionUserId  = checkoutSession.metadata?.supabase_user_id;
      const sessionEmail   = checkoutSession.customer_details?.email?.toLowerCase();
      const callerEmailLc  = userEmail?.toLowerCase();

      const ownershipOk =
        sessionUserId === userId ||
        (callerEmailLc && sessionEmail === callerEmailLc);

      if (ownershipOk) {
        const sub = checkoutSession.subscription;
        if (sub && typeof sub === 'object') {
          if (sub.status === 'active' || sub.status === 'trialing') {
            activeSub = sub;
            resolvedCustId =
              typeof checkoutSession.customer === 'string'
                ? checkoutSession.customer
                : checkoutSession.customer?.id ?? resolvedCustId;
            lookupPath = 'session_id';
            log('path 0 (session_id): found active sub', sub.id);
          } else {
            log('path 0 (session_id): sub status is', sub.status, '— not active');
          }
        } else if (typeof sub === 'string') {
          // Subscription not expanded — retrieve it
          const fetchedSub = await stripe.subscriptions.retrieve(sub);
          if (fetchedSub.status === 'active' || fetchedSub.status === 'trialing') {
            activeSub = fetchedSub;
            resolvedCustId =
              typeof checkoutSession.customer === 'string'
                ? checkoutSession.customer
                : checkoutSession.customer?.id ?? resolvedCustId;
            lookupPath = 'session_id';
            log('path 0 (session_id+retrieve): found active sub', fetchedSub.id);
          }
        }
      } else {
        log('path 0: session ownership mismatch — skipping');
      }
    } catch (err) {
      log('path 0 error:', err.message);
    }
  }

  // ── Path 1: Direct subscription lookup by stored ID ───────────────────────
  if (!activeSub && subscriptionId) {
    try {
      const sub = await stripe.subscriptions.retrieve(subscriptionId);
      if (sub.status === 'active' || sub.status === 'trialing') {
        activeSub = sub;
        resolvedCustId =
          typeof sub.customer === 'string' ? sub.customer : sub.customer?.id ?? resolvedCustId;
        lookupPath = 'subscription_id';
        log('path 1 (subscription_id): found active sub');
      }
    } catch (err) {
      log('path 1 error:', err.message);
    }
  }

  // ── Path 2: List subscriptions by Stripe customer ID ─────────────────────
  if (!activeSub && customerId) {
    for (const status of ['active', 'trialing']) {
      try {
        const list = await stripe.subscriptions.list({ customer: customerId, status, limit: 3 });
        if (list.data.length > 0) {
          activeSub  = list.data[0];
          lookupPath = 'customer_id';
          log('path 2 (customer_id):', status, 'sub found');
          break;
        }
      } catch (err) {
        log('path 2 error:', err.message);
      }
    }
  }

  // ── Path 3: Email-based customer lookup (JWT email, never from body) ──────
  if (!activeSub && userEmail) {
    try {
      const customers = await stripe.customers.list({ email: userEmail, limit: 5 });
      const sorted    = [...customers.data].sort((a, b) => b.created - a.created);

      outer: for (const customer of sorted) {
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
              lookupPath     = 'email';
              log('path 3 (email): found sub under customer', customer.id.slice(0, 8));
              break outer;
            }
          } catch (err) {
            log('path 3 sub list error:', err.message);
          }
        }
      }
    } catch (err) {
      log('path 3 customer list error:', err.message);
    }
  }

  log('lookup path taken:', lookupPath, '| active sub found:', !!activeSub);

  // ── No active subscription found ─────────────────────────────────────────
  if (!activeSub) {
    console.log('[billing/sync] no active subscription for user', userId.slice(0, 8), 'path:', lookupPath);
    return ok200(res, {
      synced:              false,
      already:             false,
      plan_tier:           profile?.plan_tier ?? 'free',
      subscription_status: profile?.subscription_status ?? null,
    });
  }

  // ── Active subscription found — update profiles ───────────────────────────
  // IMPORTANT: only write columns that are confirmed to exist.
  // Do NOT include: cancel_at_period_end, current_period_end,
  //                 payment_method_last4, payment_method_brand, email
  const subCustId =
    typeof activeSub.customer === 'string'
      ? activeSub.customer
      : activeSub.customer?.id ?? resolvedCustId;

  const updateFields = {
    plan_tier:              'pro',
    subscription_status:    activeSub.status,
    updated_at:             new Date().toISOString(),
  };

  // Only write stripe IDs if we have them (columns exist per existing checkout code).
  if (subCustId)    updateFields.stripe_customer_id     = subCustId;
  if (activeSub.id) updateFields.stripe_subscription_id = activeSub.id;

  log('writing fields:', Object.keys(updateFields));

  const { error: updateErr } = await sb
    .from('profiles')
    .upsert({ id: userId, ...updateFields }, { onConflict: 'id' });

  if (updateErr) {
    console.error('[billing/sync] profile update error:', updateErr.message);
    return res.status(500).json({ ok: false, error: 'Could not update subscription state' });
  }

  console.log('[billing/sync] synced Pro for user', userId.slice(0, 8), 'sub', activeSub.id, 'path', lookupPath);

  return ok200(res, {
    synced:              true,
    already:             false,
    plan_tier:           'pro',
    subscription_status: activeSub.status,
  });
}
