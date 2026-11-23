/**
 * POST /api/stripe/webhook
 *
 * Stripe webhook handler — verifies the signature and keeps each profile's
 * plan in step with Stripe.
 *
 * Every subscription or invoice event is treated as "something changed for
 * this customer": the handler then asks Stripe for the customer's current
 * subscriptions and writes that. It does not trust the event payload for
 * state, because payloads change shape with the endpoint's API version and
 * a customer can hold more than one subscription.
 *
 * Required env vars:
 *   STRIPE_SECRET_KEY
 *   STRIPE_WEBHOOK_SECRET   (Stripe Dashboard → Webhooks → signing secret)
 *   SUPABASE_URL / VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Handled events (the first four are what the endpoint sends today):
 *   checkout.session.completed
 *   customer.subscription.updated
 *   customer.subscription.deleted
 *   invoice.paid
 *   customer.subscription.created
 *   invoice.payment_failed
 */

import Stripe from 'stripe';
import { getSupabaseAdmin } from '../_lib/supabaseAdmin.js';
import { captureEvent } from '../_lib/posthogServer.js';
import { resolveCustomerPlan, updateProfile } from '../_lib/stripeBilling.js';

/**
 * Record a billing milestone in PostHog. Analytics must never hold up or fail
 * a Stripe webhook, so this gives up after 1.5 seconds and never throws.
 */
async function recordBillingEvent(userId, event, properties = {}) {
  try {
    await Promise.race([
      captureEvent({ distinctId: userId, event, properties: { ...properties, source: 'stripe_webhook' } }),
      new Promise((resolve) => setTimeout(resolve, 1500)),
    ]);
  } catch { /* never affect the webhook */ }
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-06-20',
});

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

const SYNC_EVENTS = new Set([
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.paid',
  'invoice.payment_failed',
]);

// ── Helper: read raw body as Buffer (required for signature verification) ──
async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end',  () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const idOf = (v) => (typeof v === 'string' ? v : v?.id ?? null);

/** The Supabase user an event is about: metadata first, then the customer id on a profile. */
async function findUser(sb, obj, customerId) {
  const fromMetadata =
    obj?.metadata?.supabase_user_id ||
    obj?.subscription_details?.metadata?.supabase_user_id ||
    obj?.parent?.subscription_details?.metadata?.supabase_user_id ||
    null;
  if (fromMetadata) return { userId: fromMetadata };
  if (!customerId) return { userId: null };
  const { data, error } = await sb.from('profiles').select('id').eq('stripe_customer_id', customerId).maybeSingle();
  if (error) console.error('[webhook] profile lookup error:', error.message);
  return { userId: data?.id ?? null };
}

/**
 * Bring one profile in line with Stripe. Exported for tests.
 * @returns {Promise<{ handled: boolean, userId?: string, isPro?: boolean, wasPro?: boolean }>}
 */
export async function syncFromEvent(event, { stripeClient = stripe, sb = getSupabaseAdmin(), record = recordBillingEvent } = {}) {
  if (!SYNC_EVENTS.has(event.type)) return { handled: false };
  const obj = event.data.object;
  const customerId = idOf(obj.customer);
  if (!customerId) return { handled: false };

  const { userId } = await findUser(sb, obj, customerId);
  if (!userId) {
    console.warn(`[webhook] ${event.type}: no profile for customer ${customerId.slice(0, 8)}…`);
    return { handled: false };
  }

  const { data: before } = await sb.from('profiles').select('plan_tier').eq('id', userId).maybeSingle();
  const wasPro = before?.plan_tier === 'pro';

  const plan = await resolveCustomerPlan(stripeClient, customerId);
  const result = await updateProfile(sb, userId, { stripe_customer_id: customerId, ...plan.fields });
  if (!result.ok) throw new Error(`profile update failed: ${result.error}`);
  if (result.dropped.length) console.warn('[webhook] profiles is missing columns:', result.dropped.join(', '));
  if (plan.liveCount > 1) console.warn(`[webhook] customer ${customerId.slice(0, 8)}… has ${plan.liveCount} live subscriptions`);

  if (plan.isPro && !wasPro) await record(userId, 'subscription_started', { plan: 'pro', status: plan.subscription.status });
  if (!plan.isPro && wasPro) await record(userId, 'subscription_cancelled', { plan: 'pro' });

  console.log(`[webhook] ${event.type}: user ${userId.slice(0, 8)}… is now ${plan.isPro ? 'pro' : 'free'}`);
  return { handled: true, userId, isPro: plan.isPro, wasPro };
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

  console.log(`[webhook] Processing event: ${event.type} (${event.id})`);

  try {
    await syncFromEvent(event);
    return res.status(200).json({ received: true });
  } catch (err) {
    console.error(`[webhook] Error handling ${event.type}:`, err.message);
    // Return 500 so Stripe will retry
    return res.status(500).json({ error: 'Webhook handler error' });
  }
}

// Vercel needs raw body for signature verification — disable body parsing
export const config = { api: { bodyParser: false } };
