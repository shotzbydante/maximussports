/**
 * usePlan — lightweight plan-state hook.
 *
 * Fetches the current user's plan tier from Supabase profiles once per session
 * (keyed by user.id). Returns { planTier, isPro, isLoading }.
 *
 * Safe no-op when Supabase is not configured or user is not signed in.
 */

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { getSupabase } from '../lib/supabaseClient';
import { effectivePlanTier } from '../lib/entitlements';

// Module-level cache so multiple consumers share one fetch per session.
const _cache = new Map(); // userId → planTier

export function usePlan() {
  const { user } = useAuth();
  const [planTier, setPlanTier] = useState(() => {
    if (user?.id && _cache.has(user.id)) return _cache.get(user.id);
    return 'free';
  });
  const [isLoading, setIsLoading] = useState(false);
  const lastFetchedId = useRef(null);

  useEffect(() => {
    const uid = user?.id;
    if (!uid) {
      setPlanTier('free');
      return;
    }
    // Use cached value immediately without re-fetching during same session.
    if (_cache.has(uid)) {
      setPlanTier(_cache.get(uid));
      return;
    }
    // Avoid duplicate in-flight fetches for the same user.
    if (lastFetchedId.current === uid) return;
    lastFetchedId.current = uid;

    const sb = getSupabase();
    if (!sb) return;
    setIsLoading(true);
    sb.from('profiles')
      .select('plan_tier, subscription_status')
      .eq('id', uid)
      .single()
      .then(({ data }) => {
        const tier = effectivePlanTier(data);
        _cache.set(uid, tier);
        setPlanTier(tier);
        setIsLoading(false);
      })
      .catch(() => {
        setIsLoading(false);
      });
  }, [user?.id]);

  return { planTier, isPro: planTier === 'pro', isLoading };
}

/** Invalidate the module-level cache for a user (call after plan upgrade/downgrade). */
export function invalidatePlanCache(userId) {
  if (userId) _cache.delete(userId);
}
