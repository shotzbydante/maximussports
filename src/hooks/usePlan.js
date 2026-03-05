/**
 * usePlan — lightweight plan-state hook.
 *
 * Fetches the current user's plan tier from Supabase profiles once per session
 * (keyed by user.id). Returns { planTier, isPro, isLoading }.
 *
 * Safe no-op when Supabase is not configured or user is not signed in.
 *
 * Supports forced refresh via invalidatePlanCache(userId): clears the module-
 * level cache AND broadcasts to all mounted usePlan instances so they re-fetch.
 * This ensures TopNav (and any other consumer) reflects plan changes without a
 * hard page reload.
 */

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { getSupabase } from '../lib/supabaseClient';
import { effectivePlanTier } from '../lib/entitlements';

// Module-level cache so multiple consumers share one fetch per session.
const _cache = new Map(); // userId → planTier

// Broadcast listeners — called whenever invalidatePlanCache() fires.
const _listeners = new Set();

export function usePlan() {
  const { user } = useAuth();
  const [planTier, setPlanTier] = useState(() => {
    if (user?.id && _cache.has(user.id)) return _cache.get(user.id);
    return 'free';
  });
  const [isLoading, setIsLoading] = useState(false);

  // Tracks the last (uid, refreshKey) pair we actually kicked off a fetch for,
  // so we skip duplicate in-flight requests for the same user but always
  // re-fetch when refreshKey has advanced (after a forced invalidation).
  const lastFetchRef = useRef({ uid: null, refreshKey: -1 });

  // refreshKey increments when invalidatePlanCache broadcasts, causing the
  // effect below to re-run even though user?.id hasn't changed.
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const notify = () => setRefreshKey((k) => k + 1);
    _listeners.add(notify);
    return () => _listeners.delete(notify);
  }, []);

  useEffect(() => {
    const uid = user?.id;
    if (!uid) {
      setPlanTier('free');
      return;
    }

    // Use cached value immediately when available (and this is not a forced refresh).
    if (_cache.has(uid)) {
      setPlanTier(_cache.get(uid));
      return;
    }

    // Skip duplicate in-flight fetches for the same uid + refreshKey combo.
    if (
      lastFetchRef.current.uid === uid &&
      lastFetchRef.current.refreshKey === refreshKey
    ) {
      return;
    }
    lastFetchRef.current = { uid, refreshKey };

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
  }, [user?.id, refreshKey]);

  return { planTier, isPro: planTier === 'pro', isLoading };
}

/**
 * Invalidate the module-level cache for a user and broadcast to all mounted
 * usePlan hooks so they re-fetch from Supabase on their next render cycle.
 * Call this after a confirmed plan upgrade or downgrade.
 */
export function invalidatePlanCache(userId) {
  if (userId) _cache.delete(userId);
  _listeners.forEach((fn) => fn());
}
