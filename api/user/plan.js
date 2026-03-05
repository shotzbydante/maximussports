/**
 * GET /api/user/plan
 *
 * Returns the authenticated user's current subscription state and entitlements.
 * Used by the frontend to verify plan after Stripe redirects, or for any
 * server-authoritative plan check.
 *
 * Required env vars:
 *   SUPABASE_URL / VITE_SUPABASE_URL
 *   SUPABASE_ANON_KEY / VITE_SUPABASE_ANON_KEY
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { verifyUserToken } from '../_lib/supabaseAdmin.js';
import { getUserEntitlements } from '../_lib/subscription.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = req.headers.authorization?.slice(7);
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const user = await verifyUserToken(token).catch(() => null);
  if (!user) return res.status(401).json({ error: 'Invalid token' });

  try {
    const { tier, entitlements, profile } = await getUserEntitlements(user.id);

    // Return safe subset — never return raw Stripe keys or secrets
    return res.status(200).json({
      planTier:            tier,
      subscriptionStatus:  profile?.subscription_status ?? 'inactive',
      currentPeriodEnd:    profile?.current_period_end ?? null,
      cancelAtPeriodEnd:   profile?.cancel_at_period_end ?? false,
      paymentMethodLast4:  profile?.payment_method_last4 ?? null,
      paymentMethodBrand:  profile?.payment_method_brand ?? null,
      entitlements: {
        maxPinnedTeams:       entitlements.maxPinnedTeams === Infinity ? null : entitlements.maxPinnedTeams,
        maxEmailTeams:        entitlements.maxEmailTeams  === Infinity ? null : entitlements.maxEmailTeams,
        advancedIntelEnabled: entitlements.advancedIntelEnabled,
        premiumEmailsEnabled: entitlements.premiumEmailsEnabled,
        premiumDepth:         entitlements.premiumDepth,
      },
    });
  } catch (err) {
    console.error('[user/plan] Error:', err.message);
    return res.status(500).json({ error: 'Could not retrieve plan information' });
  }
}
