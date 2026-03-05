import { createContext, useContext, useEffect, useState } from 'react';
import { getSupabase } from '../lib/supabaseClient';

const AuthContext = createContext(null);

/**
 * Upsert a minimal profiles shell so that a row always exists for signed-in users.
 * This is safe to call on every sign-in — the upsert is a no-op when the row exists.
 * We only set defaults on INSERT; existing fields (plan_tier, stripe fields, etc.) are
 * left untouched via onConflict:'id' with ignoreDuplicates:false but only inserting
 * bare minimum columns that won't overwrite subscription data.
 */
async function ensureProfileShell(sb, user) {
  if (!user?.id) return;
  try {
    // Use insert with onConflict:'id' + ignoreDuplicates:true so we never
    // overwrite an existing profile row — only create one if missing.
    await sb.from('profiles').insert(
      {
        id:                  user.id,
        email:               user.email ?? null,
        plan_tier:           'free',
        subscription_status: 'inactive',
        updated_at:          new Date().toISOString(),
      },
      { onConflict: 'id', ignoreDuplicates: true }
    );
  } catch {
    // Non-fatal: if RLS prevents insert or row already exists, silently ignore.
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
      // Ensure profile exists for users already signed in on page load.
      if (sess?.user) ensureProfileShell(sb, sess.user);
    });

    const { data: { subscription } } = sb.auth.onAuthStateChange((event, sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      // On fresh sign-in, guarantee the profile row exists immediately.
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
