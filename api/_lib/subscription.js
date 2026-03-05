/**
 * Server-side subscription state helper.
 *
 * Used by API endpoints to quickly retrieve and validate a user's
 * current subscription/entitlement state from Supabase.
 */

import { getSupabaseAdmin } from './supabaseAdmin.js';
import { effectivePlanTier, getEntitlements } from './entitlements.js';

/**
 * Fetch the subscription-relevant fields for a user from the profiles table.
 * Returns null if the profile doesn't exist.
 *
 * @param {string} userId - Supabase auth.uid()
 * @returns {Promise<object|null>}
 */
export async function getSubscriptionState(userId) {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from('profiles')
    .select(
      'plan_tier, stripe_customer_id, stripe_subscription_id, subscription_status, ' +
      'current_period_end, cancel_at_period_end, payment_method_last4, payment_method_brand'
    )
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/**
 * Returns the effective plan tier + entitlements for a user.
 * Defaults to 'free' if the profile doesn't exist.
 *
 * @param {string} userId
 * @returns {Promise<{ tier: string, entitlements: object, profile: object|null }>}
 */
export async function getUserEntitlements(userId) {
  const profile = await getSubscriptionState(userId);
  const tier = effectivePlanTier(profile);
  const entitlements = getEntitlements(tier);
  return { tier, entitlements, profile };
}

/**
 * Update subscription-related fields on a profile row (service role, bypasses RLS).
 * Only updates provided fields — safe for partial updates from webhook events.
 *
 * @param {string} userId
 * @param {object} fields
 */
export async function updateSubscriptionFields(userId, fields) {
  const sb = getSupabaseAdmin();
  const { error } = await sb
    .from('profiles')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', userId);
  if (error) throw error;
}

/**
 * Find a user profile by their Stripe customer ID.
 * Used in webhook handlers where we have the customer ID but need the user.
 *
 * @param {string} stripeCustomerId
 * @returns {Promise<object|null>}
 */
export async function getProfileByStripeCustomerId(stripeCustomerId) {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from('profiles')
    .select('id, plan_tier, subscription_status')
    .eq('stripe_customer_id', stripeCustomerId)
    .maybeSingle();
  if (error) throw error;
  return data;
}
