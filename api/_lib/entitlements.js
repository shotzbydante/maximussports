/**
 * Plan entitlements — single source of truth for feature limits.
 *
 * This is the SERVER-SIDE authoritative copy.
 * The frontend mirrors a subset in src/lib/entitlements.js for UI use only.
 * Never trust client-supplied plan state — always check server-side.
 */

export const PLAN_TIERS = /** @type {const} */ ({ FREE: 'free', PRO: 'pro' });

/**
 * Feature limits per plan tier.
 * Use Infinity for "unlimited" numeric caps.
 */
export const PLAN_LIMITS = {
  free: {
    maxPinnedTeams:       3,
    maxEmailTeams:        3,
    oddsInsightsLimit:    5,   // surface at most 5 insights/picks
    pickemsLimit:         3,   // surface at most 3 pick'em picks
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

/**
 * Return the entitlements object for a given plan tier.
 * Defaults to 'free' for any unknown/missing value.
 *
 * @param {string|null|undefined} planTier
 * @returns {typeof PLAN_LIMITS['free']}
 */
export function getEntitlements(planTier) {
  return PLAN_LIMITS[planTier] ?? PLAN_LIMITS.free;
}

/**
 * Returns true if the given plan tier has Pro access.
 * A subscription must also have an active status — callers should
 * check `isSubscriptionActive()` separately when needed.
 *
 * @param {string|null|undefined} planTier
 */
export function isPro(planTier) {
  return planTier === PLAN_TIERS.PRO;
}

/**
 * Returns true if a subscription status string means the user
 * currently has an active, billable subscription.
 * Both 'active' and 'trialing' grant Pro access.
 *
 * @param {string|null|undefined} status
 */
export function isSubscriptionActive(status) {
  return status === 'active' || status === 'trialing';
}

/**
 * Derive the effective plan tier from profile subscription fields.
 * Pro access requires BOTH plan_tier='pro' AND an active/trialing status.
 * If either is missing/inactive, the user is treated as free.
 *
 * @param {{ plan_tier?: string, subscription_status?: string }} profile
 * @returns {'free'|'pro'}
 */
export function effectivePlanTier(profile) {
  if (
    profile?.plan_tier === PLAN_TIERS.PRO &&
    isSubscriptionActive(profile?.subscription_status)
  ) {
    return PLAN_TIERS.PRO;
  }
  return PLAN_TIERS.FREE;
}

/**
 * Convenience: get entitlements from a raw profile row.
 * Safe to call with null/undefined profile (returns free entitlements).
 *
 * @param {{ plan_tier?: string, subscription_status?: string }|null} profile
 */
export function getProfileEntitlements(profile) {
  return getEntitlements(effectivePlanTier(profile));
}
