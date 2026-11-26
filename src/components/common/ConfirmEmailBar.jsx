/**
 * ConfirmEmailBar — sits above a preview page that a guest pass has opened.
 *
 * It says the page is open on this device, and lets the reader finish the
 * account without leaving: type the code from the email. The link in the
 * email does the same thing from whichever browser it opens in.
 */
import { useEffect, useState } from 'react';
import { getSupabase } from '../../lib/supabaseClient';
import {
  requestSignupEmail, verifySignupCode, codeErrorMessage, cleanCode, isCompleteCode, callbackPath, RESEND_COOLDOWN_SECONDS,
} from '../../features/account/signupFlow';
import { clearGuestPass, GUEST_PASS_DAYS } from '../../features/account/guestPass';
import {
  trackSignupCodeSubmitted, trackSignupCodeFailed, trackSignupCodeVerified, trackSignupEmailSent, trackGuestPassConfirmed,
} from '../../analytics/onboarding';
import styles from './ConfirmEmailBar.module.css';

export default function ConfirmEmailBar({ email, next }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [wait, setWait] = useState(RESEND_COOLDOWN_SECONDS);

  useEffect(() => {
    if (wait <= 0) return undefined;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  async function submit(e) {
    e.preventDefault();
    if (busy || !isCompleteCode(code)) return;
    setBusy(true);
    setError('');
    trackSignupCodeSubmitted({ embedded: false });
    const result = await verifySignupCode({ supabase: getSupabase(), email, code });
    if (!result.ok) {
      setBusy(false);
      trackSignupCodeFailed({ reason: result.reason });
      setError(codeErrorMessage(result.reason));
      return;
    }
    trackSignupCodeVerified({ embedded: false });
    trackGuestPassConfirmed();
    clearGuestPass();
    // The same door the emailed link uses: it finishes sign-in and returns here.
    window.location.assign(callbackPath(next));
  }

  async function resend() {
    if (wait > 0) return;
    setWait(RESEND_COOLDOWN_SECONDS);
    const result = await requestSignupEmail({ email, next });
    if (result.ok) trackSignupEmailSent({ resend: true });
  }

  return (
    <aside className={styles.bar} aria-label="Confirm your email">
      <p className={styles.text}>
        <b>Open on this device for {GUEST_PASS_DAYS} days.</b>{' '}
        To keep it and get the picks by email, tap the link we sent to <span className={styles.email}>{email}</span> or type its 6-digit code.
      </p>
      <form className={styles.form} onSubmit={submit}>
        <label className={styles.srOnly} htmlFor="guest-code">6-digit code</label>
        <input
          id="guest-code"
          className={styles.code}
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="123456"
          value={code}
          onChange={(e) => { setCode(cleanCode(e.target.value)); if (error) setError(''); }}
          aria-invalid={error ? 'true' : undefined}
        />
        <button type="submit" className={styles.go} disabled={busy || !isCompleteCode(code)}>{busy ? 'Checking…' : 'Confirm'}</button>
        <button type="button" className={styles.link} onClick={resend} disabled={wait > 0}>
          {wait > 0 ? `Resend in ${wait}s` : 'Resend email'}
        </button>
        <button type="button" className={styles.link} onClick={() => clearGuestPass()}>Wrong email</button>
      </form>
      {error && <p className={styles.error} role="alert">{error}</p>}
    </aside>
  );
}
