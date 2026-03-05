/**
 * POST /api/stripe/create-checkout-session
 *
 * Creates a Stripe Checkout Session for the Pro monthly subscription.
 * Authenticated users only. Creates or reuses a Stripe Customer.
 * Returns { url } — the hosted Stripe Checkout URL.
 *
 * Required env vars:
 *   STRIPE_SECRET_KEY
 *   STRIPE_PRICE_PRO_MONTHLY
 *   SUPABASE_URL  (or VITE_SUPABASE_URL)
 *   SUPABASE_SERVICE_ROLE_KEY
 *   SUPABASE_ANON_KEY  (or VITE_SUPABASE_ANON_KEY)  — for JWT verification
 *
 * Supabase schema requirement (profiles table):
 *   stripe_customer_id     text
 *   stripe_subscription_id text
 *   subscription_status    text  DEFAULT 'inactive'
 *   plan_tier              text  NOT NULL DEFAULT 'free'
 *   current_period_end     timestamptz
 *   cancel_at_period_end   boolean DEFAULT false
 *   payment_method_last4   text
 *   payment_method_brand   text
 *
 * If those columns are missing, run docs/subscription-migration.sql in the
 * Supabase Dashboard → SQL Editor.
 */

import Stripe from 'stripe';
import { verifyUserToken, getSupabaseAdmin } from '../_lib/supabaseAdmin.js';

// ── Env-var guardrails ────────────────────────────────────────────────────────
const STRIPE_SECRET_KEY   = process.env.STRIPE_SECRET_KEY;
const PRICE_ID            = process.env.STRIPE_PRICE_PRO_MONTHLY;
const SUPABASE_URL        = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY    = process.env.SUPABASE_SERVICE_ROLE_KEY;

function checkEnv() {
  const missing = [];
  if (!STRIPE_SECRET_KEY) missing.push('STRIPE_SECRET_KEY');
  if (!PRICE_ID)          missing.push('STRIPE_PRICE_PRO_MONTHLY');
  if (!SUPABASE_URL)      missing.push('SUPABASE_URL / VITE_SUPABASE_URL');
  if (!SERVICE_ROLE_KEY)  missing.push('SUPABASE_SERVICE_ROLE_KEY');
  return missing;
}

const stripe = new Stripe(STRIPE_SECRET_KEY || 'unconfigured', {
  apiVersion: '2024-06-20',
});

// ── Schema-missing error helper ───────────────────────────────────────────────
function isSchemaError(err) {
  if (!err) return false;
  const msg = String(err.message || err.details || err.hint || '').toLowerCase();
  return (
    msg.includes('column') ||
    msg.includes('does not exist') ||
    msg.includes('schema cache') ||
    err.code === 'PGRST116' ||
    err.code === 'PGRST204' ||
    err.code === '42703'
  );
}

const MIGRATION_HINT = `
Run this SQL in Supabase Dashboard → SQL Editor:

  ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS plan_tier              text        NOT NULL DEFAULT 'free',
    ADD COLUMN IF NOT EXISTS stripe_customer_id     text,
    ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
    ADD COLUMN IF NOT EXISTS subscription_status    text        DEFAULT 'inactive',
    ADD COLUMN IF NOT EXISTS current_period_end     timestamptz,
    ADD COLUMN IF NOT EXISTS cancel_at_period_end   boolean     DEFAULT false,
    ADD COLUMN IF NOT EXISTS payment_method_last4   text,
    ADD COLUMN IF NOT EXISTS payment_method_brand   text;

  CREATE INDEX IF NOT EXISTS idx_profiles_stripe_customer_id
    ON profiles (stripe_customer_id)
    WHERE stripe_customer_id IS NOT NULL;

Or apply docs/subscription-migration.sql from the repo.
`.trim();

// ── Handler ───────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── Guard: required env vars ────────────────────────────────────────────────
  const missingVars = checkEnv();
  if (missingVars.length) {
    console.error('[checkout] Missing env vars:', missingVars.join(', '));
    return res.status(500).json({
      error: 'Billing not configured on the server.',
      missing: missingVars,
    });
  }

  // ── Auth ────────────────────────────────────────────────────────────────────
  const token = req.headers.authorization?.slice(7);
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const user = await verifyUserToken(token).catch(() => null);
  if (!user) return res.status(401).json({ error: 'Invalid or expired token' });

  // Never log the token or user email in full
  console.log(`[checkout] Request from user: ${user.id.slice(0, 8)}...`);

  try {
    const sb = getSupabaseAdmin();

    // ── Load profile ──────────────────────────────────────────────────────────
    const { data: profile, error: profileErr } = await sb
      .from('profiles')
      .select('stripe_customer_id, plan_tier, subscription_status')
      .eq('id', user.id)
      .maybeSingle();

    if (profileErr) {
      if (isSchemaError(profileErr)) {
        console.error('[checkout] Supabase schema missing subscription columns.\n' + MIGRATION_HINT);
        return res.status(500).json({
          error: 'Subscription schema not yet applied. See server logs for the required SQL migration.',
        });
      }
      throw profileErr;
    }

    // ── Guard: already subscribed ─────────────────────────────────────────────
    if (
      profile?.plan_tier === 'pro' &&
      (profile?.subscription_status === 'active' || profile?.subscription_status === 'trialing')
    ) {
      console.log('[checkout] User already has active Pro subscription.');
      return res.status(409).json({ error: 'Already subscribed to Pro' });
    }

    // ── Build return URLs ─────────────────────────────────────────────────────
    const origin =
      req.headers.origin ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://maximussports.ai');

    const successUrl = `${origin}/settings?upgrade=success&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl  = `${origin}/settings?upgrade=cancel`;

    // ── Branch A: existing Stripe customer ────────────────────────────────────
    // Pass `customer` param. Do NOT pass `customer_email` or `customer_update.email`
    // (customer_update only accepts address / name / shipping).
    const existingCustomerId = profile?.stripe_customer_id || null;

    let session;

    if (existingCustomerId) {
      console.log(`[checkout] Using existing Stripe customer: ${existingCustomerId.slice(0, 8)}...`);

      session = await stripe.checkout.sessions.create({
        mode:        'subscription',
        customer:    existingCustomerId,
        line_items:  [{ price: PRICE_ID, quantity: 1 }],
        success_url: successUrl,
        cancel_url:  cancelUrl,
        allow_promotion_codes: true,
        subscription_data: {
          metadata: { supabase_user_id: user.id },
        },
        metadata: { supabase_user_id: user.id },
        // customer_update: ONLY address / name / shipping are valid here.
        // email is NOT supported — do NOT include it.
        customer_update: { name: 'auto', address: 'auto' },
      });

      console.log(`[checkout] Session created: ${session.id} (existing customer)`);

    // ── Branch B: no Stripe customer yet ─────────────────────────────────────
    // Use `customer_email` to pre-fill Checkout and let Stripe create + attach
    // the Customer automatically. We persist the resulting customer id afterwards.
    } else {
      console.log('[checkout] No existing customer — using customer_email branch.');

      session = await stripe.checkout.sessions.create({
        mode:           'subscription',
        customer_email: user.email,       // pre-fills email on Checkout page
        line_items:     [{ price: PRICE_ID, quantity: 1 }],
        success_url:    successUrl,
        cancel_url:     cancelUrl,
        allow_promotion_codes: true,
        subscription_data: {
          metadata: { supabase_user_id: user.id },
        },
        metadata: { supabase_user_id: user.id },
        // No customer_update here — there is no pre-existing customer.
      });

      console.log(`[checkout] Session created: ${session.id} (new customer_email flow)`);

      // Stripe creates the Customer when the session completes (not now).
      // The webhook (checkout.session.completed) will receive session.customer
      // and persist it to profiles.stripe_customer_id.
      // If we can read it here already (unlikely in customer_email mode), store it.
      if (session.customer) {
        const newCustId = typeof session.customer === 'string'
          ? session.customer
          : session.customer.id;

        console.log(`[checkout] Early customer id available: ${newCustId.slice(0, 8)}...`);

        await sb
          .from('profiles')
          .update({
            stripe_customer_id: newCustId,
            updated_at:         new Date().toISOString(),
          })
          .eq('id', user.id);
      }
    }

    return res.status(200).json({ url: session.url });

  } catch (err) {
    // Log message only — never the full Stripe error object which may contain key fragments
    console.error('[checkout] Stripe/Supabase error:', err.message);
    return res.status(500).json({ error: 'Failed to create checkout session. Please try again.' });
  }
}
