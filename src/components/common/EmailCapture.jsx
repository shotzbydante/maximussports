/**
 * EmailCapture — the one-field ask for a signed-out reader.
 *
 * Giving an email opens the preview page on this device at once (a guest
 * pass, see features/account/guestPass.js) and sends the confirmation
 * email. Used by the wall at the foot of a preview page and, on the NFL
 * picks page, directly under the first pick.
 *
 * Inside an in-app browser (Instagram, Facebook) Google sign-in cannot
 * work, so the second line offers sign-in only and does not mention Google.
 */
import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  trackSignupCtaClicked, trackEmailCaptureSubmitted, trackSignupEmailSent, trackSignupEmailFailed, trackSignupEmailInvalid,
} from '../../analytics/onboarding';
import { trackSignupStarted } from '../../lib/analytics/posthog';
import { requestSignupEmail } from '../../features/account/signupFlow';
import { grantGuestPass, isEmail } from '../../features/account/guestPass';
import { isEmbeddedBrowser } from '../../utils/embeddedBrowser';
import styles from './EmailCapture.module.css';

export default function EmailCapture({ sport, next, placement = 'gate_wall', label, buttonClassName = '', note }) {
  const id = useId();
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const signInHref = `/settings?next=${encodeURIComponent(next || '/')}`;

  async function onSubmit(e) {
    e.preventDefault();
    if (sending) return;
    const value = email.trim();
    if (!isEmail(value)) { setError('That does not look like an email address.'); trackSignupEmailInvalid(); return; }
    setError('');
    setSending(true);
    trackEmailCaptureSubmitted({ placement, sport });
    trackSignupStarted({ method: 'email' });
    const result = await requestSignupEmail({ email: value, next });
    setSending(false);
    if (!result.ok) {
      trackSignupEmailFailed({ reason: result.reason });
      setError(result.reason === 'network' ? 'Could not reach the server. Check your connection and try again.' : 'That did not go through. Try again in a moment.');
      return;
    }
    trackSignupEmailSent();
    grantGuestPass(value);
  }

  return (
    <div className={styles.wrap}>
      <form className={styles.form} onSubmit={onSubmit} noValidate>
        <label className={styles.srOnly} htmlFor={id}>Email address</label>
        <input
          id={id}
          className={styles.input}
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="you@example.com"
          value={email}
          onChange={(e) => { setEmail(e.target.value); if (error) setError(''); }}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          data-email-capture={placement}
        />
        <button type="submit" className={`${styles.button} ${buttonClassName}`} disabled={sending}>
          {sending ? 'Opening…' : (label || (sport === 'nfl' ? 'Email me every pick' : 'Continue with email'))}
        </button>
        {error && <p id={`${id}-error`} className={styles.error} role="alert">{error}</p>}
      </form>
      <p className={styles.foot}>
        {note || 'Free. No password, no card. The page opens right away and we email a link to confirm.'}{' '}
        <Link to={signInHref} className={styles.alt} onClick={() => trackSignupCtaClicked({ placement, sport })}>
          {isEmbeddedBrowser() ? 'Already have an account? Sign in' : 'Use Google or sign in'}
        </Link>
      </p>
    </div>
  );
}
