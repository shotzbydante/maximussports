/**
 * Frontend entitlements mirror.
 *
 * This file mirrors the server-side api/_lib/entitlements.js for use in
 * UI components (showing limits, upgrade prompts, comparison table).
 *
 * IMPORTANT: Never trust this for access control. All enforcement happens
 * server-side. This is purely for UX — showing limits and upgrade prompts.
 */

export const PLAN_TIERS = { FREE: 'free', PRO: 'pro' };

export const PLAN_LIMITS = {
  free: {
    maxPinnedTeams:       3,
    maxEmailTeams:        3,
    oddsInsightsLimit:    5,
    pickemsLimit:         3,
    advancedIntelEnabled: false,
    premiumEmailsEnabled: false,
    premiumDepth:         'limited',
  },
  pro: {
    maxPinnedTeams:       Infinity,
    maxEmailTeams:        Infinity,
    oddsInsightsLimit:    Infinity,
    pickemsLimit:         Infinity,
    advancedIntelEnabled: true,
    premiumEmailsEnabled: true,
    premiumDepth:         'full',
  },
};

/** @param {string|null|undefined} planTier */
export function getEntitlements(planTier) {
  return PLAN_LIMITS[planTier] ?? PLAN_LIMITS.free;
}

/** @param {string|null|undefined} planTier */
export function isPro(planTier) {
  return planTier === 'pro';
}

/** @param {string|null|undefined} status */
export function isSubscriptionActive(status) {
  return status === 'active' || status === 'trialing';
}

/**
 * Returns the effective tier a user has access to.
 * Pro access requires BOTH plan_tier='pro' AND an active/trialing subscription.
 *
 * @param {{ plan_tier?: string, subscription_status?: string }|null} profile
 * @returns {'free'|'pro'}
 */
export function effectivePlanTier(profile) {
  if (
    profile?.plan_tier === 'pro' &&
    isSubscriptionActive(profile?.subscription_status)
  ) {
    return 'pro';
  }
  return 'free';
}

/** Pricing constants for display */
export const PRO_PRICE_MONTHLY = '$7.99';
export const PRO_PRICE_LABEL   = '$7.99/month';
