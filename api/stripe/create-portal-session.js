/**
 * POST /api/stripe/create-portal-session
 *
 * Creates a Stripe Customer Portal session for billing management
 * (cancel subscription, update payment method, view invoices).
 * Authenticated Pro users only.
 * Returns { url } — the Stripe-hosted portal URL.
 *
 * Required env vars:
 *   STRIPE_SECRET_KEY
 *   VITE_SUPABASE_URL / SUPABASE_URL
 *   SUPABASE_ANON_KEY / VITE_SUPABASE_ANON_KEY
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import Stripe from 'stripe';
import { verifyUserToken, getSupabaseAdmin } from '../_lib/supabaseAdmin.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-06-20',
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── Auth ─────────────────────────────────────────────────────────────────
  const token = req.headers.authorization?.slice(7);
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const user = await verifyUserToken(token).catch(() => null);
  if (!user) return res.status(401).json({ error: 'Invalid token' });

  try {
    const sb = getSupabaseAdmin();

    const { data: profile, error: profileErr } = await sb
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .maybeSingle();

    if (profileErr) throw profileErr;

    if (!profile?.stripe_customer_id) {
      return res.status(400).json({ error: 'No billing account found. Please upgrade first.' });
    }

    const origin = req.headers.origin ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://maximussports.ai');

    const returnUrl = `${origin}/settings?billing=portal_return`;

    const portalSession = await stripe.billingPortal.sessions.create({
      customer:   profile.stripe_customer_id,
      return_url: returnUrl,
    });

    return res.status(200).json({ url: portalSession.url });
  } catch (err) {
    console.error('[portal] Error creating portal session:', err.message);
    return res.status(500).json({ error: 'Failed to open billing portal' });
  }
}
