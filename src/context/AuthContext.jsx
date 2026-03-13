import { createContext, useContext, useEffect, useState } from 'react';
import { getSupabase } from '../lib/supabaseClient';

const AuthContext = createContext(null);

/** Debug flag — mirrors usePlan's ?debugPlan=1 check. */
const _debug =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).has('debugPlan');

function dbg(...args) {
  if (_debug) console.log('[AuthContext]', ...args);
}

const DEFAULT_EMAIL_PREFS = {
  briefing:        true,
  teamAlerts:      true,
  oddsIntel:       false,
  newsDigest:      true,
  teamDigest:      false,
  teamDigestTeams: [],
};

/**
 * Attempt client-side profile shell upsert.
 * Returns true on success, false on failure (RLS block or network error).
 *
 * IMPORTANT: only writes columns confirmed to exist in profiles:
 *   id, plan_tier, subscription_status, preferences, updated_at
 * Do NOT include 'email' — that column does not exist in the profiles table.
 */
async function upsertProfileClient(sb, user) {
  try {
    const { error } = await sb.from('profiles').insert(
      {
        id:                  user.id,
        plan_tier:           'free',
        subscription_status: 'inactive',
        preferences:         { ...DEFAULT_EMAIL_PREFS },
        updated_at:          new Date().toISOString(),
      },
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
 */
async function upsertProfileServer(sb, user) {
  try {
    const { data: { session } } = await sb.auth.getSession();
    const token = session?.access_token;
    if (!token) {
      dbg('server fallback: no access token available');
      return false;
    }
    const res = await fetch('/api/profile/ensure', {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json().catch(() => ({}));
    dbg('server fallback result:', res.status, json);
    return res.ok && json.ok;
  } catch (err) {
    dbg('server fallback exception:', err?.message);
    return false;
  }
}

/**
 * Ensure a minimal profiles row exists for the signed-in user.
 * Tries the client-side upsert first (fast, no round-trip).
 * Falls back to the service-role server endpoint if RLS blocks it.
 * Safe to call on every sign-in — no-op when row already exists.
 */
async function ensureProfileShell(sb, user) {
  if (!user?.id) return;
  dbg('ensureProfileShell for', user.id, 'email:', user.email);

  const clientOk = await upsertProfileClient(sb, user);
  if (clientOk) {
    console.log(`[auth] Profile shell ensured for user=${user.id} via client upsert`);
    return;
  }

  dbg('client upsert failed — trying server fallback');
  const serverOk = await upsertProfileServer(sb, user);
  if (serverOk) {
    console.log(`[auth] Profile shell ensured for user=${user.id} via server fallback`);
  } else {
    console.warn(`[auth] ensureProfileShell: both client and server paths failed for user=${user.id} — digest enrollment may be delayed until onboarding completes`);
  }
}

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const sb = getSupabase();

    if (!sb) {
      setLoading(false);
      return;
    }

    sb.auth.getSession().then(({ data: { session: sess } }) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      setLoading(false);
      if (sess?.user) ensureProfileShell(sb, sess.user);
    });

    const { data: { subscription } } = sb.auth.onAuthStateChange((event, sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && sess?.user) {
        ensureProfileShell(sb, sess.user);
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
    <AuthContext.Provider value={{ user, session, signOut, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
