/**
 * POST /api/stripe/create-checkout-session
 *
 * Creates a Stripe Checkout Session for the Pro monthly subscription.
 * Authenticated users only. Creates or reuses a Stripe customer.
 * Returns { url } — the hosted Stripe checkout URL.
 *
 * Required env vars:
 *   STRIPE_SECRET_KEY
 *   STRIPE_PRICE_PRO_MONTHLY
 *   VITE_SUPABASE_URL / SUPABASE_URL
 *   SUPABASE_ANON_KEY / VITE_SUPABASE_ANON_KEY
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import Stripe from 'stripe';
import { verifyUserToken, getSupabaseAdmin } from '../_lib/supabaseAdmin.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-06-20',
});

const PRICE_ID = process.env.STRIPE_PRICE_PRO_MONTHLY;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── Auth ─────────────────────────────────────────────────────────────────
  const token = req.headers.authorization?.slice(7);
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const user = await verifyUserToken(token).catch(() => null);
  if (!user) return res.status(401).json({ error: 'Invalid token' });

  if (!PRICE_ID) {
    console.error('[checkout] STRIPE_PRICE_PRO_MONTHLY not set');
    return res.status(500).json({ error: 'Billing not configured' });
  }

  try {
    const sb = getSupabaseAdmin();

    // ── Load profile to get/set stripe_customer_id ─────────────────────────
    const { data: profile, error: profileErr } = await sb
      .from('profiles')
      .select('stripe_customer_id, plan_tier, subscription_status')
      .eq('id', user.id)
      .maybeSingle();

    if (profileErr) throw profileErr;

    // If user already has active Pro, don't create a new checkout
    if (
      profile?.plan_tier === 'pro' &&
      (profile?.subscription_status === 'active' || profile?.subscription_status === 'trialing')
    ) {
      return res.status(409).json({ error: 'Already subscribed to Pro' });
    }

    // ── Get or create Stripe customer ─────────────────────────────────────
    let stripeCustomerId = profile?.stripe_customer_id;

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { supabase_user_id: user.id },
      });
      stripeCustomerId = customer.id;

      // Persist customer ID immediately so we can reconcile on webhook
      await sb
        .from('profiles')
        .update({ stripe_customer_id: stripeCustomerId, updated_at: new Date().toISOString() })
        .eq('id', user.id);
    }

    // ── Build return URLs ─────────────────────────────────────────────────
    const origin = req.headers.origin ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://maximussports.ai');

    const successUrl = `${origin}/settings?upgrade=success&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl  = `${origin}/settings?upgrade=cancel`;

    // ── Create checkout session ───────────────────────────────────────────
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: stripeCustomerId,
      line_items: [{ price: PRICE_ID, quantity: 1 }],
      success_url: successUrl,
      cancel_url:  cancelUrl,
      allow_promotion_codes: true,
      subscription_data: {
        metadata: { supabase_user_id: user.id },
      },
      metadata: { supabase_user_id: user.id },
      customer_update: { email: 'auto' },
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('[checkout] Error creating checkout session:', err.message);
    return res.status(500).json({ error: 'Failed to create checkout session' });
  }
}
