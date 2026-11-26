/**
 * AuthCallback — handles magic-link return for new + returning users.
 *
 * Flow:
 *   1. Supabase's JS client auto-processes the token in the URL hash/query.
 *   2. We wait for session establishment (onAuthStateChange listener in AuthContext).
 *   3. Once a session exists, we check the user's profile state:
 *        - No profile row or no username  → new user: straight to the page they came for
 *          (the NFL picks when the link did not say). Setup (teams, emails, avatar)
 *          waits in Settings; nothing blocks the first visit.
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
import { DEFAULT_AFTER_SIGNUP } from '../features/account/signupFlow';
import { clearGuestPass } from '../features/account/guestPass';
import { trackOnboardingDeferred } from '../analytics/onboarding';

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

      if (cancelled) return;
      // Signed in: the guest pass has done its job.
      clearGuestPass();

      if (!hasUsername) {
        // New account: the page they signed up to see comes first. Setup is
        // still offered, in Settings and from the nudge on the NFL pages.
        const destination = next || DEFAULT_AFTER_SIGNUP;
        try {
          if (sessionStorage.getItem('mx_welcome_requested') !== '1') {
            sessionStorage.setItem('mx_welcome_requested', '1');
            trackOnboardingDeferred({ method: user.app_metadata?.provider || 'email', destination: destination.split('?')[0] });
            const { data: { session } } = await sb.auth.getSession();
            if (session?.access_token) {
              fetch('/api/auth/send-welcome', { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` } }).catch(() => {});
            }
          }
        } catch { /* best effort */ }
        if (cancelled) return;
        navigate(destination, { replace: true });
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
