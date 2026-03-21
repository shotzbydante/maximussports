/**
 * POST /api/stripe/webhook
 *
 * Stripe webhook handler — verifies signature and updates Supabase
 * profile rows to keep subscription state accurate.
 *
 * Required env vars:
 *   STRIPE_SECRET_KEY
 *   STRIPE_WEBHOOK_SECRET   (from Stripe Dashboard → Webhooks → signing secret)
 *   SUPABASE_URL / VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Handled events:
 *   checkout.session.completed
 *   customer.subscription.created
 *   customer.subscription.updated
 *   customer.subscription.deleted
 *   invoice.paid
 *   invoice.payment_failed
 */

import Stripe from 'stripe';
import { getSupabaseAdmin } from '../_lib/supabaseAdmin.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-06-20',
});

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

// ── Helper: read raw body as Buffer (required for signature verification) ──
async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end',  () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// ── Helper: update profile fields by user id ──────────────────────────────
async function updateProfile(userId, fields) {
  if (!userId) return;
  const sb = getSupabaseAdmin();
  const payload = { ...fields, updated_at: new Date().toISOString() };
  const { error } = await sb
    .from('profiles')
    .update(payload)
    .eq('id', userId);
  if (error) {
    if (error.message?.includes('cancel_at_period_end')) {
      console.warn('[webhook] cancel_at_period_end column missing, retrying without it');
      delete payload.cancel_at_period_end;
      const { error: retryErr } = await sb
        .from('profiles')
        .update(payload)
        .eq('id', userId);
      if (retryErr) console.error('[webhook] updateProfile retry error:', retryErr.message);
    } else {
      console.error('[webhook] updateProfile error:', error.message);
    }
  }
}

// ── Helper: find profile by stripe customer id ────────────────────────────
async function getProfileByCustomer(customerId) {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from('profiles')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();
  if (error) console.error('[webhook] getProfileByCustomer error:', error.message);
  return data?.id ?? null;
}

// ── Helper: extract supabase user id from various event shapes ────────────
function extractUserId(event) {
  const obj = event.data.object;
  // Try metadata first (set at checkout/subscription creation)
  return (
    obj?.metadata?.supabase_user_id ||
    obj?.subscription_data?.metadata?.supabase_user_id ||
    null
  );
}

// ── Map Stripe subscription to profile fields ─────────────────────────────
function subscriptionToFields(sub, paymentMethod = null) {
  const isActive = sub.status === 'active' || sub.status === 'trialing';
  const fields = {
    stripe_subscription_id: sub.id,
    subscription_status:    sub.status,
    plan_tier:              isActive ? 'pro' : 'free',
    current_period_end:     sub.current_period_end
      ? new Date(sub.current_period_end * 1000).toISOString()
      : null,
    cancel_at_period_end:   sub.cancel_at_period_end ?? false,
  };
  if (paymentMethod) {
    fields.payment_method_last4 = paymentMethod.last4 ?? null;
    fields.payment_method_brand = paymentMethod.brand ?? null;
  }
  return fields;
}

// ── Main handler ─────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!WEBHOOK_SECRET) {
    console.error('[webhook] STRIPE_WEBHOOK_SECRET not set');
    return res.status(500).json({ error: 'Webhook not configured' });
  }

  // ── Verify Stripe signature ───────────────────────────────────────────
  let event;
  try {
    const rawBody = await getRawBody(req);
    const sig = req.headers['stripe-signature'];
    event = stripe.webhooks.constructEvent(rawBody, sig, WEBHOOK_SECRET);
  } catch (err) {
    console.error('[webhook] Signature verification failed:', err.message);
    return res.status(400).json({ error: `Webhook signature failed: ${err.message}` });
  }

  const obj = event.data.object;
  console.log(`[webhook] Processing event: ${event.type} (${event.id})`);

  try {
    switch (event.type) {

      // ── checkout.session.completed ───────────────────────────────────
      // User successfully completed the checkout flow.
      // Subscription may still be pending fulfillment — wait for
      // customer.subscription.created/updated for canonical state.
      case 'checkout.session.completed': {
        const userId = obj.metadata?.supabase_user_id;
        const customerId = obj.customer;

        if (userId && customerId) {
          // Ensure the customer ID is persisted
          await updateProfile(userId, { stripe_customer_id: customerId });
        }
        break;
      }

      // ── customer.subscription.created ────────────────────────────────
      case 'customer.subscription.created': {
        let userId = extractUserId(event);
        if (!userId && obj.customer) {
          userId = await getProfileByCustomer(obj.customer);
        }
        if (!userId) break;

        let pmData = null;
        if (obj.default_payment_method && typeof obj.default_payment_method === 'object') {
          pmData = obj.default_payment_method?.card;
        }

        await updateProfile(userId, {
          stripe_customer_id: obj.customer,
          ...subscriptionToFields(obj, pmData),
        });
        break;
      }

      // ── customer.subscription.updated ────────────────────────────────
      case 'customer.subscription.updated': {
        let userId = extractUserId(event);
        if (!userId && obj.customer) {
          userId = await getProfileByCustomer(obj.customer);
        }
        if (!userId) break;

        // Fetch latest default payment method details if available
        let pmData = null;
        if (obj.default_payment_method) {
          try {
            const pmId = typeof obj.default_payment_method === 'string'
              ? obj.default_payment_method
              : obj.default_payment_method.id;
            const pm = await stripe.paymentMethods.retrieve(pmId);
            pmData = pm.card ?? null;
          } catch { /* non-fatal */ }
        }

        await updateProfile(userId, subscriptionToFields(obj, pmData));
        break;
      }

      // ── customer.subscription.deleted ────────────────────────────────
      // Subscription has fully ended (not just cancel_at_period_end set).
      case 'customer.subscription.deleted': {
        let userId = extractUserId(event);
        if (!userId && obj.customer) {
          userId = await getProfileByCustomer(obj.customer);
        }
        if (!userId) break;

        await updateProfile(userId, {
          plan_tier:              'free',
          subscription_status:   'canceled',
          stripe_subscription_id: obj.id,
          current_period_end:    null,
          cancel_at_period_end:  false,
          payment_method_last4:  null,
          payment_method_brand:  null,
        });
        break;
      }

      // ── invoice.paid ─────────────────────────────────────────────────
      // Successful renewal — refresh status and period end.
      case 'invoice.paid': {
        const subId = obj.subscription;
        if (!subId) break;

        let userId = null;
        if (obj.customer) userId = await getProfileByCustomer(obj.customer);
        if (!userId) break;

        // Fetch the subscription to get latest state
        try {
          const sub = await stripe.subscriptions.retrieve(subId);
          await updateProfile(userId, subscriptionToFields(sub));
        } catch (err) {
          console.error('[webhook] invoice.paid: failed to retrieve subscription', err.message);
        }
        break;
      }

      // ── invoice.payment_failed ────────────────────────────────────────
      // Mark subscription as past_due but DO NOT immediately revoke access.
      // Stripe will retry; we update status so UI can surface a warning.
      case 'invoice.payment_failed': {
        const subId = obj.subscription;
        if (!subId) break;

        let userId = null;
        if (obj.customer) userId = await getProfileByCustomer(obj.customer);
        if (!userId) break;

        await updateProfile(userId, { subscription_status: 'past_due' });
        break;
      }

      default:
        // Unhandled event — return 200 to acknowledge receipt
        break;
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error(`[webhook] Error handling ${event.type}:`, err.message);
    // Return 500 so Stripe will retry
    return res.status(500).json({ error: 'Webhook handler error' });
  }
}

// Vercel needs raw body for signature verification — disable body parsing
export const config = { api: { bodyParser: false } };
