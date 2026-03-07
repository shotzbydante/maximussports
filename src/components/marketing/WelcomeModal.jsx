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
import { useEffect, useRef, useCallback, useState } from 'react';
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
  const [videoReady, setVideoReady] = useState(false);

  // Focus management: rAF ensures DOM is painted before we grab focus
  useEffect(() => {
    if (open) {
      prevFocusRef.current = document.activeElement;
      const id = requestAnimationFrame(() => closeBtnRef.current?.focus());
      return () => cancelAnimationFrame(id);
    } else if (prevFocusRef.current) {
      prevFocusRef.current.focus();
      prevFocusRef.current = null;
    }
  }, [open]);

  // Scroll lock + Escape — iOS-safe: position:fixed preserves scroll position
  const handleKeyDown = useCallback(
    (e) => { if (e.key === 'Escape') onClose?.(); },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener('keydown', handleKeyDown);

    const scrollY = window.scrollY;
    const body = document.body;
    body.style.overflow  = 'hidden';
    body.style.position  = 'fixed';
    body.style.top       = `-${scrollY}px`;
    body.style.width     = '100%';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      body.style.overflow  = '';
      body.style.position  = '';
      body.style.top       = '';
      body.style.width     = '';
      window.scrollTo(0, scrollY);
    };
  }, [open, handleKeyDown]);

  // Reset video-ready flag each time modal opens so fade plays fresh
  useEffect(() => {
    if (open) setVideoReady(false);
  }, [open]);

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

        {/*
          Close button is absolutely positioned on the panel (which is
          overflow: hidden). This is rock-solid — no sticky / zero-height
          tricks that can break in Safari.
        */}
        <button
          ref={closeBtnRef}
          type="button"
          className={styles.closeBtn}
          aria-label="Close welcome modal"
          onClick={onClose}
        >
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden>
            <path d="M4 4L16 16M16 4L4 16" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
        </button>

        {/*
          Separate scroll container so the close button above stays fixed
          inside the panel regardless of scroll position.
        */}
        <div className={styles.scroller}>

          {/* Dunk video — fades in once first frame is ready */}
          <div className={`${styles.videoWrap}${videoReady ? ` ${styles.videoLoaded}` : ''}`}>
            <video
              className={styles.video}
              src="/videos/maximus-dunk.mp4"
              autoPlay
              muted
              loop
              playsInline
              preload="auto"
              onCanPlay={() => setVideoReady(true)}
            />
          </div>

          {/* Copy + CTAs */}
          <div className={styles.body}>
            <div>
              <p className={styles.eyebrow}>Welcome to</p>
              <h2 className={styles.title}>Maximus Sports</h2>
            </div>

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

            <div className={styles.ctaGroup}>
              <button type="button" className={styles.ctaPrimary} onClick={onPrimary}>
                Create account and pin your first team
              </button>
              <button type="button" className={styles.ctaSecondary} onClick={onSecondary}>
                Continue without signing in
              </button>
            </div>

            <p className={styles.footerNote}>Customize your experience in under 30 seconds.</p>
          </div>

        </div>
      </div>
    </div>
  );
}
