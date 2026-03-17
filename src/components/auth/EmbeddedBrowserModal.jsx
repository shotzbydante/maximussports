/**
 * EmbeddedBrowserModal — Premium intercept for in-app browsers.
 *
 * Shown BEFORE Google OAuth redirect when the user is inside an
 * embedded WebView (LinkedIn, Instagram, Facebook, etc.) that Google
 * will reject with 403 disallowed_useragent.
 *
 * Provides:
 *  1. Platform-smart "Open in Safari/Chrome" CTA
 *  2. "Use email instead" fallback (works everywhere)
 *  3. Manual fallback instructions if window.open is blocked
 */

import { useState, useEffect, useCallback } from 'react';
import {
  getPreferredBrowserLabel,
  getFallbackInstructions,
  openInExternalBrowser,
  getEmbeddedSource,
  getPlatform,
} from '../../utils/embeddedBrowser';
import { track } from '../../analytics/index';
import styles from './EmbeddedBrowserModal.module.css';

export default function EmbeddedBrowserModal({ onClose, onEmailFallback }) {
  const [showFallback, setShowFallback] = useState(false);
  const browserLabel = getPreferredBrowserLabel();
  const platform = getPlatform();

  useEffect(() => {
    track('oauth_prompt_shown', {
      embedded_source: getEmbeddedSource(),
      platform,
    });
  }, [platform]);

  const handleOpenBrowser = useCallback(() => {
    track('oauth_open_browser_clicked', {
      embedded_source: getEmbeddedSource(),
      platform,
    });
    const opened = openInExternalBrowser();
    if (!opened) {
      setShowFallback(true);
    }
  }, [platform]);

  const handleEmailFallback = useCallback(() => {
    track('oauth_email_fallback_selected', {
      embedded_source: getEmbeddedSource(),
      platform,
    });
    onEmailFallback?.();
  }, [onEmailFallback, platform]);

  const handleCancel = useCallback(() => {
    track('oauth_prompt_dismissed', {
      embedded_source: getEmbeddedSource(),
      platform,
    });
    onClose?.();
  }, [onClose, platform]);

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') handleCancel(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [handleCancel]);

  return (
    <div className={styles.overlay} onClick={handleCancel} role="dialog" aria-modal="true" aria-label="Continue in your browser">
      <div className={styles.sheet} onClick={(e) => e.stopPropagation()}>
        <div className={styles.handle} />

        <div className={styles.iconWrap}>
          <BrowserIcon />
        </div>

        <h2 className={styles.title}>Continue in your browser</h2>

        <p className={styles.body}>
          Google sign-in requires a secure browser.
          Open Maximus Sports in your device browser to continue.
        </p>

        <div className={styles.actions}>
          <button type="button" className={styles.btnPrimary} onClick={handleOpenBrowser}>
            <ExternalLinkIcon />
            {browserLabel}
          </button>

          <button type="button" className={styles.btnSecondary} onClick={handleEmailFallback}>
            <EmailIcon />
            Use email instead
          </button>
        </div>

        {showFallback && (
          <p className={styles.fallbackHint}>
            {getFallbackInstructions()}
          </p>
        )}

        <button type="button" className={styles.cancel} onClick={handleCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/* ─── Inline SVG Icons (match existing codebase patterns) ────────────────── */

function BrowserIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary, #3C79B4)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M3 9h18" />
      <circle cx="7" cy="6" r="0.5" fill="currentColor" />
      <circle cx="10" cy="6" r="0.5" fill="currentColor" />
    </svg>
  );
}

function ExternalLinkIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3H3.5A1.5 1.5 0 002 4.5v8A1.5 1.5 0 003.5 14h8a1.5 1.5 0 001.5-1.5V10" />
      <path d="M10 2h4v4" />
      <path d="M14 2L7 9" />
    </svg>
  );
}

function EmailIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3.5" width="12" height="9" rx="1.5" />
      <path d="M2 5l6 4 6-4" />
    </svg>
  );
}
