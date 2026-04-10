import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { getSupabase } from '../lib/supabaseClient';
import { trackAuthAccountCreated } from '../lib/analytics/posthog';

const AuthContext = createContext(null);

/** Debug flag — mirrors usePlan's ?debugPlan=1 check. */
const _debug =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).has('debugPlan');

function dbg(...args) {
  if (_debug) console.log('[AuthContext]', ...args);
}

const DEFAULT_EMAIL_PREFS = {
  // Global
  global_briefing:     true,
  // MLB
  mlb_briefing:        true,
  mlb_team_digest:     false,
  mlb_picks:           false,
  // NCAAM (default off during MLB season / offseason)
  ncaam_briefing:      false,
  ncaam_team_digest:   false,
  ncaam_picks:         false,
};

function extractDisplayName(user) {
  const meta = user.user_metadata || {};
  return (
    meta.full_name ||
    meta.name ||
    meta.display_name ||
    (user.email ? user.email.split('@')[0] : null)
  );
}

/**
 * Attempt client-side profile shell upsert.
 * Returns true on success, false on failure (RLS block or network error).
 *
 * Writes columns confirmed to exist in profiles:
 *   id, plan_tier, subscription_status, preferences, updated_at, display_name
 * Do NOT include 'email' — that column does not exist in the profiles table.
 */
async function upsertProfileClient(sb, user) {
  try {
    const row = {
      id:                  user.id,
      plan_tier:           'free',
      subscription_status: 'inactive',
      preferences:         { ...DEFAULT_EMAIL_PREFS },
      updated_at:          new Date().toISOString(),
    };
    const derivedName = extractDisplayName(user);
    if (derivedName) row.display_name = derivedName;

    const { error } = await sb.from('profiles').insert(
      row,
      { onConflict: 'id', ignoreDuplicates: true }
    );
    if (error) {
      dbg('client upsert error:', error.message, '(code:', error.code + ')');
      return false;
    }
    dbg('client upsert ok for', user.id);
    return true;
  } catch (err) {
    dbg('client upsert exception:', err?.message);
    return false;
  }
}

/**
 * Server-side fallback: call /api/profile/ensure with the user's access token.
 * This uses the service role key and bypasses RLS completely.
 * Returns { ok, isNew } — the server endpoint distinguishes created vs existed.
 */
async function upsertProfileServer(sb, user) {
  try {
    const { data: { session } } = await sb.auth.getSession();
    const token = session?.access_token;
    if (!token) {
      dbg('server fallback: no access token available');
      return { ok: false, isNew: false, posthogTracked: false };
    }
    const res = await fetch('/api/profile/ensure', {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json().catch(() => ({}));
    dbg('server result:', res.status, json);
    return {
      ok: res.ok && json.ok,
      isNew: !!json.created,
      posthogTracked: !!json.posthog_tracked,
    };
  } catch (err) {
    dbg('server exception:', err?.message);
    return { ok: false, isNew: false, posthogTracked: false };
  }
}

/**
 * Backfill display_name from auth metadata if the profile row exists but has
 * no display_name set. Runs client-side (RLS allows users to read/write own row).
 */
async function backfillDisplayName(sb, user) {
  try {
    const derivedName = extractDisplayName(user);
    if (!derivedName) return;

    const { data: profile } = await sb
      .from('profiles')
      .select('display_name')
      .eq('id', user.id)
      .maybeSingle();

    if (profile && !profile.display_name) {
      await sb
        .from('profiles')
        .update({ display_name: derivedName, updated_at: new Date().toISOString() })
        .eq('id', user.id);
      dbg('backfilled display_name for', user.id, '→', derivedName);
    }
  } catch (err) {
    dbg('backfill display_name warning:', err?.message);
  }
}

/**
 * Ensure a minimal profiles row exists for the signed-in user.
 *
 * Returns { isNew, posthogTracked } so the caller can fire
 * auth_account_created exactly once for brand-new users and avoid
 * double-firing account_created when the server already handled it.
 *
 * Server-first: new profiles go through /api/profile/ensure which fires
 * the canonical server-side PostHog account_created event. Client-side
 * insert is the fallback if the server is unreachable.
 *
 * Safe to call on every sign-in — no-op when the row already exists.
 */
async function ensureProfileShell(sb, user) {
  if (!user?.id) return { isNew: false, posthogTracked: false };
  dbg('ensureProfileShell for', user.id, 'email:', user.email);

  // Fast check: does a profile row already exist?
  try {
    const { data: existing } = await sb
      .from('profiles')
      .select('id')
      .eq('id', user.id)
      .maybeSingle();
    if (existing) {
      dbg('profile exists for', user.id, '— skipping insert');
      await backfillDisplayName(sb, user);
      return { isNew: false, posthogTracked: false };
    }
  } catch (err) {
    dbg('profile existence check failed:', err?.message, '— proceeding with insert');
  }

  // Server-first: /api/profile/ensure fires PostHog account_created
  const serverResult = await upsertProfileServer(sb, user);
  if (serverResult.ok) {
    console.log(`[auth] Profile shell created for user=${user.id} via server (posthog=${serverResult.posthogTracked})`);
    await backfillDisplayName(sb, user);
    return { isNew: serverResult.isNew, posthogTracked: serverResult.posthogTracked };
  }

  // Client fallback if server is unreachable
  dbg('server path failed — trying client-side insert');
  const clientOk = await upsertProfileClient(sb, user);
  if (clientOk) {
    console.log(`[auth] Profile shell created for user=${user.id} via client upsert (posthog not tracked server-side)`);
    await backfillDisplayName(sb, user);
    return { isNew: true, posthogTracked: false };
  }

  console.warn(`[auth] ensureProfileShell: both server and client paths failed for user=${user.id} — digest enrollment may be delayed until onboarding completes`);
  await backfillDisplayName(sb, user);
  return { isNew: false, posthogTracked: false };
}

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isNewAccount, setIsNewAccount] = useState(false);
  const newAccountTrackedRef = useRef(false);

  useEffect(() => {
    // Restore tracking guard from session (protects against React remounts)
    try {
      if (sessionStorage.getItem('mx_auth_account_created') === '1') {
        newAccountTrackedRef.current = true;
      }
    } catch { /* ignore */ }

    const sb = getSupabase();

    if (!sb) {
      setLoading(false);
      return;
    }

    /**
     * Fire auth_account_created exactly once for a truly new account.
     * Triple-guarded: ref (same render), sessionStorage (same tab),
     * localStorage (same device). The DB profile-existence check in
     * ensureProfileShell prevents cross-device re-fires.
     *
     * If posthogTracked is true, the server already fired the canonical
     * account_created event — the client only fires auth_account_created
     * (supplementary, carries UTM/referrer context).
     */
    function handleNewAccount(authUser, { posthogTracked = false } = {}) {
      if (newAccountTrackedRef.current) return;
      try {
        if (localStorage.getItem(`mx_acct_${authUser.id}`) === '1') {
          newAccountTrackedRef.current = true;
          return;
        }
      } catch { /* ignore */ }
      newAccountTrackedRef.current = true;
      setIsNewAccount(true);
      try { sessionStorage.setItem('mx_auth_account_created', '1'); } catch { /* ignore */ }
      try { localStorage.setItem(`mx_acct_${authUser.id}`, '1'); } catch { /* ignore */ }
      const method = authUser.app_metadata?.provider || 'email';
      trackAuthAccountCreated(authUser, { method, posthogTracked });
      console.log(`[auth] auth_account_created tracked for user=${authUser.id} method=${method} serverTracked=${posthogTracked}`);
    }

    sb.auth.getSession().then(({ data: { session: sess } }) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      setLoading(false);
      if (sess?.user) {
        ensureProfileShell(sb, sess.user).then(({ isNew, posthogTracked }) => {
          if (isNew) handleNewAccount(sess.user, { posthogTracked });
        });
      }
    });

    const { data: { subscription } } = sb.auth.onAuthStateChange((event, sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && sess?.user) {
        ensureProfileShell(sb, sess.user).then(({ isNew, posthogTracked }) => {
          if (isNew && event === 'SIGNED_IN') handleNewAccount(sess.user, { posthogTracked });
        });
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function signOut() {
    const sb = getSupabase();
    if (!sb) return;
    await sb.auth.signOut();
  }

  return (
    <AuthContext.Provider value={{ user, session, signOut, loading, isNewAccount }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
