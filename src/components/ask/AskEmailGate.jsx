/**
 * AskEmailGate — the one-field email ask, inside the chat.
 *
 * The same door as the picks page's wall: an email opens the rest on this
 * device straight away (a guest pass) and sends the confirmation link and
 * code. Here it also lifts the guest's daily question cap.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { requestSignupEmail } from '../../features/account/signupFlow';
import { grantGuestPass, isEmail } from '../../features/account/guestPass';
import { trackEmailCaptureSubmitted, trackSignupEmailSent, trackSignupEmailFailed, trackSignupEmailInvalid, trackSignupCtaClicked } from '../../analytics/onboarding';
import { trackSignupStarted } from '../../lib/analytics/posthog';
import a from './ask.module.css';

export default function AskEmailGate({ placement, cta = 'Open every call', next = '/nfl/ask' }) {
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const id = `ask-email-${placement}`;

  async function onSubmit(e) {
    e.preventDefault();
    if (sending) return;
    const value = email.trim();
    if (!isEmail(value)) { setError('That does not look like an email address.'); trackSignupEmailInvalid(); return; }
    setError('');
    setSending(true);
    trackEmailCaptureSubmitted({ placement, sport: 'nfl' });
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
    <form className={a.gate} onSubmit={onSubmit} noValidate>
      <label className={a.srOnly} htmlFor={id}>Email address</label>
      <input
        id={id}
        className={a.gateInput}
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
      />
      <button type="submit" className={a.gateBtn} disabled={sending}>{sending ? 'Opening…' : cta}</button>
      {error && <p id={`${id}-error`} className={a.gateError} role="alert">{error}</p>}
      <p className={a.gateFoot}>
        Free. No password, no card.{' '}
        <Link to={`/settings?next=${encodeURIComponent(next)}`} onClick={() => trackSignupCtaClicked({ placement, sport: 'nfl' })}>Use Google or sign in</Link>
      </p>
    </form>
  );
}
