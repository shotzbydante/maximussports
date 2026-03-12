/**
 * SignupBanner — persistent but dismissible banner encouraging anonymous
 * visitors to create a free account.
 *
 * Visibility rules:
 *   1. Welcome modal must have been dismissed (mx_welcome_seen_v1 is set)
 *   2. User must NOT be authenticated
 *   3. Banner must not have been dismissed in this session
 *
 * Renders via portal into document.body (fixed positioning).
 */
import { useState, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getSupabase } from '../../lib/supabaseClient';
import { getFlag } from '../../utils/localFlags';
import { track } from '../../analytics/index';
import styles from './SignupBanner.module.css';

export default function SignupBanner() {
  const { user, loading } = useAuth();
  const [dismissed, setDismissed] = useState(false);

  const welcomeSeen = getFlag('mx_welcome_seen_v1');
  const visible = !loading && !user && welcomeSeen && !dismissed;

  const handleSignup = useCallback(() => {
    track('signup_banner_clicked', {});
    const sb = getSupabase();
    if (sb) {
      sb.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/settings` },
      });
    }
  }, []);

  const handleDismiss = useCallback(() => {
    track('signup_banner_dismissed', {});
    setDismissed(true);
  }, []);

  if (!visible) return null;

  return (
    <div className={styles.banner} role="banner">
      <p className={styles.text}>
        Create a free account to pin teams and personalize your dashboard.
      </p>
      <div className={styles.actions}>
        <button type="button" className={styles.signupBtn} onClick={handleSignup}>
          Sign up free
        </button>
        <button
          type="button"
          className={styles.dismissBtn}
          onClick={handleDismiss}
          aria-label="Dismiss signup banner"
        >
          <svg width="12" height="12" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M4 4L16 16M16 4L4 16" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
