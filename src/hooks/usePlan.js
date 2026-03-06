/**
 * usePlan — single source of truth for plan state in the UI.
 *
 * Returns: { planTier, isPro, isLoading, isSyncing }
 *
 * planTier is:
 *   'pro'  — confirmed active subscription
 *   'free' — confirmed free (no active sub, no evidence of pending upgrade)
 *   null   — unknown / syncing (treat as "don't show FREE yet")
 *
 * isSyncing is true when we have any evidence that the user might be Pro but
 * the profiles row hasn't confirmed it yet:
 *   • markSyncing(userId) was called (user triggered checkout)
 *   • URL contains ?upgrade=success or ?billing=success on page load
 *   • profiles row has stripe_customer_id or stripe_subscription_id but plan_tier='free'
 *     (with a non-terminal subscription_status — i.e. not 'canceled'/'past_due'/'unpaid')
 *
 * When isSyncing is true:
 *   • planTier returns null (never 'free') — callers must treat as unknown
 *   • A background /api/billing/sync call is fired automatically (once per session per user)
 *   • TopNav shows ··· indefinitely until resolved
 *
 * FREE is shown only when ALL of the following are true:
 *   • profile row exists
 *   • plan_tier !== 'pro'
 *   • no stripe evidence pointing at a pending Pro state
 *   • markSyncing was NOT called for this user this session
 *
 * Exports:
 *   invalidatePlanCache(userId)  — clear cache + broadcast re-fetch
 *   markSyncing(userId)          — flag user as syncing (call before Stripe redirect)
 *
 * Debug: add ?debugPlan=1 to URL for detailed logging (no-op in prod without flag).
 */

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { getSupabase } from '../lib/supabaseClient';
import { effectivePlanTier } from '../lib/entitlements';

// ── Module-level shared state ────────────────────────────────────────────────

/** userId → 'pro' | 'free' */
const _cache = new Map();

/**
 * Users with evidence they might be Pro but not yet confirmed.
 * Never cleared by timeout — only cleared when confirmed Pro or confirmed no active sub.
 */
const _syncing = new Set();

/** Guard: prevent duplicate concurrent /api/billing/sync calls per user. */
const _syncInProgress = new Set();

/**
 * Users where billing/sync has already confirmed no active subscription this
 * session. Prevents an infinite loop: stripe_customer_id exists → syncNeeded
 * → auto-sync → "no sub" → clear syncing → refetch → syncNeeded again.
 * Cleared by invalidatePlanCache (e.g., after a successful upgrade).
 */
const _noActiveSub = new Set();

/** Broadcast listeners — notified on cache invalidation or syncing change. */
const _listeners = new Set();

/** Debug flag — read once at module load. Requires page reload to change. */
const _debug =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).has('debugPlan');

function dbg(...args) {
  if (_debug) console.log('[usePlan]', ...args);
}

/**
 * Check URL at module load time for upgrade-success evidence.
 * This survives the page reload that happens after Stripe checkout.
 * We don't have the user ID yet, so we store a flag and apply it
 * when the first user ID resolves inside the hook.
 */
let _upgradeRedirectPending = false;
if (typeof window !== 'undefined') {
  const _p = new URLSearchParams(window.location.search);
  if (_p.get('upgrade') === 'success' || _p.get('billing') === 'success') {
    _upgradeRedirectPending = true;
    dbg('upgrade redirect detected in URL — will mark first user as syncing');
  }
}

// ── Subscription status constants ────────────────────────────────────────────

/** Statuses that definitively indicate no active subscription — do NOT sync. */
const TERMINAL_STATUSES = new Set(['canceled', 'past_due', 'unpaid', 'incomplete_expired']);

// ─────────────────────────────────────────────────────────────────────────────

export function usePlan() {
  const { user, session } = useAuth();

  const [planTier, setPlanTier] = useState(() => {
    if (user?.id && _cache.has(user.id)) return _cache.get(user.id);
    return null;
  });
  const [isLoading, setIsLoading] = useState(() => {
    return !!(user?.id && !_cache.has(user.id));
  });
  const [isSyncing, setIsSyncing] = useState(() => {
    return !!(user?.id && _syncing.has(user.id));
  });

  const [refreshKey, setRefreshKey] = useState(0);
  const lastFetchRef = useRef({ uid: null, refreshKey: -1 });
  // Track whether we've applied the upgrade-redirect flag for this user instance.
  const upgradeAppliedRef = useRef(false);

  // Register broadcast listener.
  useEffect(() => {
    const notify = () => setRefreshKey((k) => k + 1);
    _listeners.add(notify);
    return () => _listeners.delete(notify);
  }, []);

  // Sync isSyncing state from module-level Set.
  useEffect(() => {
    setIsSyncing(!!(user?.id && _syncing.has(user.id)));
  }, [user?.id, refreshKey]);

  // Apply upgrade-redirect evidence when user first resolves.
  useEffect(() => {
    const uid = user?.id;
    if (!uid || upgradeAppliedRef.current) return;
    if (_upgradeRedirectPending) {
      upgradeAppliedRef.current = true;
      _upgradeRedirectPending = false; // consume once
      if (!_syncing.has(uid)) {
        _syncing.add(uid);
        dbg('applied upgrade-redirect evidence to', uid);
        _listeners.forEach((fn) => fn());
      }
    }
  }, [user?.id]);

  // ── Profile fetch ────────────────────────────────────────────────────────
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

    // Dedup: skip if we already initiated a fetch for this (uid, refreshKey).
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
    dbg('fetching profile', uid, 'email:', user?.email, 'refreshKey:', refreshKey);

    sb.from('profiles')
      .select('plan_tier, subscription_status, stripe_customer_id, stripe_subscription_id')
      .eq('id', uid)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          dbg('fetch error:', error.message, error.code);
          setIsLoading(false);
          // Don't cache on error — allow retry.
          return;
        }

        dbg('profile data:', data);

        if (!data) {
          // Profile row missing entirely.
          dbg('no profile row for', uid);
          if (_syncing.has(uid)) {
            // We have upgrade evidence — stay in syncing state, don't cache 'free'.
            setIsLoading(false);
            // isSyncing already true — auto-sync effect will fire.
          } else {
            // Genuinely new user, no evidence of subscription.
            setPlanTier('free');
            _cache.set(uid, 'free');
            setIsLoading(false);
          }
          return;
        }

        // Profile row found.
        const tier = effectivePlanTier(data);
        const subStatus = data.subscription_status ?? '';
        const hasCid = !!data.stripe_customer_id;
        const hasSid = !!data.stripe_subscription_id;
        const isTerminal = TERMINAL_STATUSES.has(subStatus);

        // Detect sync-needed: has Stripe evidence but plan shows free.
        // Don't sync if subscription is in a known terminal/negative state,
        // or if billing/sync already returned "no active sub" this session.
        const syncNeeded =
          tier === 'free' &&
          (hasCid || hasSid) &&
          !isTerminal &&
          !_noActiveSub.has(uid);

        dbg('resolved:', { tier, subStatus, hasCid, hasSid, isTerminal, syncNeeded, wasMarked: _syncing.has(uid) });

        if (syncNeeded) {
          _syncing.add(uid);
          // Don't cache 'free' — plan state is uncertain until sync resolves.
        } else if (!_syncing.has(uid)) {
          // Only cache if not already marked as syncing by external call.
          _cache.set(uid, tier);
          setPlanTier(tier);
        } else {
          // Was marked syncing (e.g., markSyncing called) — don't overwrite with stale 'free'.
          // The auto-sync effect below will clear this when resolved.
          dbg('marked syncing externally — not caching free');
        }

        // Clear syncing if now confirmed Pro.
        if (tier === 'pro') {
          _syncing.delete(uid);
          _cache.set(uid, 'pro');
          setPlanTier('pro');
        }

        setIsLoading(false);
        setIsSyncing(_syncing.has(uid));
      })
      .catch((err) => {
        dbg('fetch exception:', err?.message);
        setIsLoading(false);
        // Do not cache on exception — allow retry on next invalidation.
      });
  }, [user?.id, refreshKey]);

  // ── Auto-sync background trigger ─────────────────────────────────────────
  // When isSyncing is detected, fire one /api/billing/sync call per user per session.
  // This resolves the "profile has stripe_customer_id but webhook missed" case
  // without requiring the user to visit Settings manually.
  useEffect(() => {
    const uid = user?.id;
    const token = session?.access_token;
    if (!uid || !isSyncing || !token) return;
    if (_syncInProgress.has(uid)) return;

    _syncInProgress.add(uid);
    dbg('auto-triggering billing sync for', uid);

    fetch('/api/billing/sync', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        _syncInProgress.delete(uid);
        dbg('auto-sync result:', data);
        if (data?.isPro || data?.plan_tier === 'pro') {
          // Confirmed Pro — invalidate so next render fetches fresh 'pro' row.
          invalidatePlanCache(uid);
        } else {
          // No active subscription found — mark as confirmed-free so subsequent
          // fetches don't trigger syncNeeded again (prevents infinite loop).
          _noActiveSub.add(uid);
          _syncing.delete(uid);
          _listeners.forEach((fn) => fn());
          dbg('auto-sync: no active sub — confirmed free for', uid);
        }
      })
      .catch((err) => {
        _syncInProgress.delete(uid);
        dbg('auto-sync error:', err?.message);
        // Keep _syncing on network error — may be transient.
        // Next mount or invalidation will retry.
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSyncing, user?.id]);

  // ── Return value ─────────────────────────────────────────────────────────
  // planTier is null when loading or syncing (uncertain) — callers must not
  // show FREE unless this is explicitly 'free'.
  const resolvedTier = isLoading || isSyncing ? null : (planTier ?? 'free');

  return {
    planTier:  resolvedTier,
    isPro:     resolvedTier === 'pro',
    isLoading,
    isSyncing,
  };
}

/**
 * Clear the plan cache for a user and broadcast to all mounted hooks.
 * Call after a confirmed plan upgrade or downgrade.
 */
export function invalidatePlanCache(userId) {
  if (userId) {
    _cache.delete(userId);
    _syncing.delete(userId);
    _syncInProgress.delete(userId);
    _noActiveSub.delete(userId); // allow fresh sync after forced invalidation
  }
  _listeners.forEach((fn) => fn());
}

/**
 * Mark a user as syncing. Call right before redirecting to Stripe Checkout
 * so the badge shows ··· while the webhook is in flight.
 * Also persisted across the page reload via ?upgrade=success URL param handling above.
 */
export function markSyncing(userId) {
  if (userId) _syncing.add(userId);
  _listeners.forEach((fn) => fn());
}
