/**
 * usePlan — single source of truth for plan state in the UI.
 *
 * Fetches plan_tier, subscription_status, and stripe_customer_id from
 * Supabase profiles once per session (keyed by user.id). Returns:
 *   { planTier, isPro, isLoading, isSyncing }
 *
 * isSyncing is true when the profile row indicates a Stripe customer exists
 * but the subscription state is not yet reflected (missed webhook scenario).
 * UI should show a neutral "Syncing…" state rather than "FREE" in that case.
 *
 * invalidatePlanCache(userId)  — clears cache and forces re-fetch on all consumers.
 * markSyncing(userId)          — flags the user as "syncing" without clearing tier.
 *                                Use right after triggering Stripe checkout.
 *
 * Add ?debugPlan=1 to URL for detailed fetch logging (dev-friendly, silent in prod).
 */

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { getSupabase } from '../lib/supabaseClient';
import { effectivePlanTier } from '../lib/entitlements';

// ── Module-level state shared across all mounted usePlan consumers ────────────

/** userId → planTier ('free' | 'pro') */
const _cache = new Map();

/** userIds flagged as "syncing" (stripe_customer_id exists, sub not confirmed) */
const _syncing = new Set();

/** Broadcast listeners — called whenever invalidatePlanCache() fires. */
const _listeners = new Set();

/** Debug flag — read once at module load; requires page reload to toggle. */
const _debug =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).has('debugPlan');

function dbg(...args) {
  if (_debug) console.log('[usePlan]', ...args);
}

// ─────────────────────────────────────────────────────────────────────────────

export function usePlan() {
  const { user } = useAuth();

  // Initial tier: use cache if available, otherwise null (triggers isLoading).
  const [planTier, setPlanTier] = useState(() => {
    if (user?.id && _cache.has(user.id)) return _cache.get(user.id);
    return null; // null → isLoading until first fetch resolves
  });
  const [isLoading, setIsLoading] = useState(() => {
    // Start in loading state if user exists but we have no cached value.
    return !!(user?.id && !_cache.has(user.id));
  });
  const [isSyncing, setIsSyncing] = useState(() => {
    return !!(user?.id && _syncing.has(user.id));
  });

  // Stable broadcast key — increments when invalidatePlanCache fires.
  const [refreshKey, setRefreshKey] = useState(0);

  // Dedup guard — avoid duplicate in-flight fetches for the same (uid, refreshKey).
  const lastFetchRef = useRef({ uid: null, refreshKey: -1 });

  // Register/unregister broadcast listener.
  useEffect(() => {
    const notify = () => setRefreshKey((k) => k + 1);
    _listeners.add(notify);
    return () => _listeners.delete(notify);
  }, []);

  // Re-sync isSyncing from module-level set whenever user or refreshKey changes.
  useEffect(() => {
    setIsSyncing(!!(user?.id && _syncing.has(user.id)));
  }, [user?.id, refreshKey]);

  useEffect(() => {
    const uid = user?.id;

    if (!uid) {
      setPlanTier(null);
      setIsLoading(false);
      setIsSyncing(false);
      return;
    }

    // Use cache when available (and not a forced refresh).
    if (_cache.has(uid)) {
      const cached = _cache.get(uid);
      dbg('cache hit', uid, cached);
      setPlanTier(cached);
      setIsLoading(false);
      return;
    }

    // Skip duplicate in-flight fetches.
    if (
      lastFetchRef.current.uid === uid &&
      lastFetchRef.current.refreshKey === refreshKey
    ) {
      return;
    }
    lastFetchRef.current = { uid, refreshKey };

    const sb = getSupabase();
    if (!sb) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    dbg('fetching profile', uid, 'refreshKey=', refreshKey);

    sb.from('profiles')
      .select('plan_tier, subscription_status, stripe_customer_id')
      .eq('id', uid)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          dbg('fetch error', error.message);
          // Keep isLoading=false so the UI doesn't hang.
          setIsLoading(false);
          return;
        }

        dbg('profile data', data);

        if (!data) {
          // Profile row missing — user just signed up; treat as free until upsert lands.
          dbg('no profile row found for', uid);
          setPlanTier('free');
          _cache.set(uid, 'free');
          setIsLoading(false);
          return;
        }

        const tier = effectivePlanTier(data);
        _cache.set(uid, tier);
        setPlanTier(tier);
        setIsLoading(false);

        // Detect "syncing" scenario: Stripe customer exists but sub not confirmed.
        // This happens when webhook fires late or profile was never updated.
        const hasCid = !!data.stripe_customer_id;
        const subStatus = data.subscription_status;
        const isSubActive = subStatus === 'active' || subStatus === 'trialing';
        const syncNeeded =
          hasCid &&
          tier === 'free' &&
          (subStatus === null || subStatus === '' || subStatus === undefined || subStatus === 'inactive');

        if (syncNeeded) {
          dbg('syncing: has stripe_customer_id but no confirmed status', data);
          _syncing.add(uid);
        } else {
          _syncing.delete(uid);
        }
        setIsSyncing(_syncing.has(uid));

        dbg('resolved', { tier, hasCid, subStatus, isSubActive, syncNeeded });
      })
      .catch((err) => {
        dbg('fetch exception', err?.message);
        setIsLoading(false);
      });
  }, [user?.id, refreshKey]);

  // Effective tier: while loading/syncing, we show null (callers treat as unknown).
  // Once resolved, planTier is 'pro' or 'free'.
  const resolvedTier = isLoading ? null : (planTier ?? 'free');

  return {
    planTier:  resolvedTier,
    isPro:     resolvedTier === 'pro',
    isLoading,
    isSyncing,
  };
}

/**
 * Clear the plan cache for a user and broadcast to all mounted hooks so
 * they re-fetch from Supabase. Call after a confirmed plan upgrade/downgrade.
 */
export function invalidatePlanCache(userId) {
  if (userId) {
    _cache.delete(userId);
    _syncing.delete(userId);
  }
  _listeners.forEach((fn) => fn());
}

/**
 * Mark a user as "syncing" without invalidating the cache.
 * Call right after triggering Stripe Checkout so the UI shows SYNCING
 * instead of FREE while the webhook is in flight.
 */
export function markSyncing(userId) {
  if (userId) _syncing.add(userId);
  _listeners.forEach((fn) => fn());
}
