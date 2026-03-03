/**
 * WelcomeModal — First-visit marketing modal.
 *
 * Opens when mx_welcome_seen_v1 is absent in localStorage, or when ?welcome=1
 * is present in the URL. Closing by any means sets the flag so it won't
 * re-appear on future visits.
 *
 * Accessibility:
 *   - role="dialog" aria-modal="true"
 *   - Focus is moved to close button on open; restored on close.
 *   - Escape key closes the modal.
 *   - Backdrop click closes the modal.
 *   - Body scroll is locked while open.
 */
import { useEffect, useRef, useCallback } from 'react';
import styles from './WelcomeModal.module.css';

const BULLETS = [
  'Pin your teams to build a personalized dashboard',
  'Track ATS leaders, odds movement, and upset alerts fast',
  'Get AI briefings that cut through the noise',
  'Follow scores, headlines, and top videos in one place',
];

export default function WelcomeModal({ open, onClose, onPrimary, onSecondary }) {
  const closeBtnRef  = useRef(null);
  const prevFocusRef = useRef(null);

  // Focus management: move focus in on open, restore on close
  useEffect(() => {
    if (open) {
      prevFocusRef.current = document.activeElement;
      closeBtnRef.current?.focus();
    } else if (prevFocusRef.current) {
      prevFocusRef.current.focus();
      prevFocusRef.current = null;
    }
  }, [open]);

  // Scroll lock + Escape handler
  const handleKeyDown = useCallback(
    (e) => { if (e.key === 'Escape') onClose?.(); },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [open, handleKeyDown]);

  // Lazy-mount: don't render video (or anything) until modal is open
  if (!open) return null;

  return (
    <div
      className={styles.backdrop}
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to Maximus Sports"
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div className={styles.panel}>
        {/* Floating close button overlays the video */}
        <button
          ref={closeBtnRef}
          type="button"
          className={styles.closeBtn}
          aria-label="Close welcome modal"
          onClick={onClose}
        >
          <svg width="15" height="15" viewBox="0 0 20 20" fill="none" aria-hidden>
            <path d="M4 4L16 16M16 4L4 16" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        </button>

        {/* Dunk video — rendered only when modal is open */}
        <div className={styles.videoWrap}>
          <video
            className={styles.video}
            src="/videos/maximus-dunk.mp4"
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
          />
        </div>

        {/* Copy + CTAs */}
        <div className={styles.body}>
          <h2 className={styles.title}>Welcome to Maximus Sports</h2>
          <p className={styles.subtitle}>
            Your one-stop shop for actionable college hoops news, odds, betting intel, and AI-powered analysis.
          </p>

          <ul className={styles.bullets} aria-label="Key features">
            {BULLETS.map((b) => (
              <li key={b} className={styles.bullet}>
                <span className={styles.bulletCheck} aria-hidden>✓</span>
                {b}
              </li>
            ))}
          </ul>

          <p className={styles.footerNote}>Customize your experience in under 30 seconds.</p>

          <div className={styles.ctaGroup}>
            <button type="button" className={styles.ctaPrimary} onClick={onPrimary}>
              Create account and pin your first team
            </button>
            <button type="button" className={styles.ctaSecondary} onClick={onSecondary}>
              Continue without signing in
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
