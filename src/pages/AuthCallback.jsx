/**
 * AuthCallback — handles magic-link return for new + returning users.
 *
 * Flow:
 *   1. Supabase's JS client auto-processes the token in the URL hash/query.
 *   2. We wait for session establishment (onAuthStateChange listener in AuthContext).
 *   3. Once a session exists, we check the user's profile state:
 *        - No profile row or no username  → new user, route to /settings?step=password&next=...
 *        - Profile complete + next param  → route to the original destination
 *        - Profile complete, no next      → route to /settings
 *   4. Token errors or timeout → fallback to /settings with a soft error.
 *
 * This gives deterministic behavior for the password-first onboarding path
 * while preserving intended destination for gated route returns.
 */

import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getSupabase } from '../lib/supabaseClient';

// Safe next-path check — prevents open-redirect to external hosts.
function sanitizeNext(raw) {
  if (!raw) return null;
  try {
    const decoded = decodeURIComponent(raw);
    // Must be a relative path; reject external URLs and protocol-relative.
    if (!decoded.startsWith('/')) return null;
    if (decoded.startsWith('//')) return null;
    // Reject any `javascript:` or `data:` attempts (after decoding)
    if (/^[a-z]+:/i.test(decoded)) return null;
    return decoded;
  } catch {
    return null;
  }
}

export default function AuthCallback() {
  const navigate = useNavigate();
  const location = useLocation();
  const [message, setMessage] = useState('Completing sign-in\u2026');

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) {
      navigate('/settings', { replace: true });
      return;
    }

    // Pull `next` from either query or hash (Supabase sometimes puts params in the hash)
    const params = new URLSearchParams(location.search);
    const hashParams = new URLSearchParams((location.hash || '').replace(/^#/, ''));
    const rawNext = params.get('next') || hashParams.get('next');
    const next = sanitizeNext(rawNext);

    let cancelled = false;
    let sawSession = false;

    async function resolveUser(user) {
      if (!user) return;
      sawSession = true;

      // Determine if onboarding has already been completed
      let hasUsername = false;
      try {
        const { data } = await sb
          .from('profiles')
          .select('username')
          .eq('id', user.id)
          .maybeSingle();
        hasUsername = Boolean(data?.username);
      } catch { /* treat as no username */ }

      const hasProvider = user.app_metadata?.provider && user.app_metadata.provider !== 'email';
      // Email users without a username → password-first onboarding
      // OAuth users always have a provider identity, skip password step
      const forcePassword = !hasUsername && !hasProvider;

      const qs = new URLSearchParams();
      if (forcePassword) qs.set('step', 'password');
      if (next) qs.set('next', next);
      const suffix = qs.toString() ? `?${qs.toString()}` : '';

      if (cancelled) return;

      if (!hasUsername) {
        // New user → send them into onboarding (password-first if email signup)
        navigate(`/settings${suffix}`, { replace: true });
      } else if (next) {
        // Returning user with an intended destination
        navigate(next, { replace: true });
      } else {
        navigate('/settings', { replace: true });
      }
    }

    // 1) Try to read an already-established session (handles fast returns)
    sb.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) resolveUser(session.user);
    });

    // 2) Listen for the SIGNED_IN event in case the token is still being processed
    const { data: { subscription } } = sb.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        resolveUser(session.user);
      }
    });

    // 3) Timeout fallback — if nothing happens in 10s, bail to /settings
    const timeoutId = setTimeout(() => {
      if (!sawSession && !cancelled) {
        setMessage('Sign-in took too long. Redirecting\u2026');
        navigate('/settings', { replace: true });
      }
    }, 10000);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      subscription?.unsubscribe?.();
    };
  }, [navigate, location]);

  return (
    <div style={{
      minHeight: '60vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '32px 24px',
      color: 'var(--color-text-secondary, #3d5a73)',
      fontSize: '0.9rem',
    }}>
      <span>{message}</span>
    </div>
  );
}
