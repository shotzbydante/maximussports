/**
 * WelcomeModal — 4-step product-led onboarding for first-time visitors.
 *
 * Step 1: Hero — "Own the Board" + product positioning
 * Step 2: Team Intel + Picks showcase
 * Step 3: Bracketology showcase
 * Step 4: Personalization + conversion CTA
 *
 * Preserves:
 *   - Portal rendering (bypasses ancestor stacking contexts)
 *   - Focus management with restore-on-close
 *   - Escape key close
 *   - ARIA dialog attributes
 *   - Reduced motion handling
 *   - iOS-safe scroll locking
 *   - Mobile bottom-sheet layout
 *   - Swipe gestures + arrow key nav
 */
import { useEffect, useRef, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  trackWelcomeModalViewed,
  trackWelcomeModalStepAdvanced,
  trackWelcomeModalSkipped,
  trackWelcomeModalSignupClicked,
  trackWelcomeModalExploreClicked,
  trackWelcomeModalClosed,
} from '../../lib/analytics/posthog';
import TeamIntelPreview from '../onboarding/previews/TeamIntelPreview';
import AIPicksPreview from '../onboarding/previews/AIPicksPreview';
import styles from './WelcomeModal.module.css';

const TOTAL_STEPS = 4;
const SWIPE_THRESHOLD = 50;

/* ── Icons ─────────────────────────────────────────────────────────────── */

function TargetIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 3v18h18" /><path d="M7 16l4-8 4 4 5-9" />
    </svg>
  );
}

function BracketIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 4v4h4" /><path d="M4 8l4 4" /><path d="M4 20v-4h4" /><path d="M4 16l4-4" /><path d="M12 12h4" /><path d="M20 4v16" />
    </svg>
  );
}

function PersonIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="4" width="20" height="16" rx="2" /><path d="M22 7l-10 7L2 7" />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
    </svg>
  );
}

/* ── Component ─────────────────────────────────────────────────────────── */

export default function WelcomeModal({ open, onClose, onSignup, onExplore }) {
  const closeBtnRef  = useRef(null);
  const prevFocusRef = useRef(null);
  const touchXRef    = useRef(null);
  const touchEndXRef = useRef(null);
  const trackedStepsRef = useRef(new Set());

  const [step, setStep] = useState(1);

  const goTo = useCallback((target, from) => {
    if (target < 1 || target > TOTAL_STEPS || target === from) return;
    trackWelcomeModalStepAdvanced({ from_step: from, to_step: target });
    setStep(target);
  }, []);

  const handleNext = useCallback(() => goTo(step + 1, step), [goTo, step]);

  const handleSkip = useCallback(() => {
    trackWelcomeModalSkipped({ step });
    onClose?.();
  }, [step, onClose]);

  const handleSignup = useCallback(() => {
    trackWelcomeModalSignupClicked({ step });
    onSignup?.();
  }, [step, onSignup]);

  const handleExplore = useCallback(() => {
    trackWelcomeModalExploreClicked({ step });
    onExplore?.();
  }, [step, onExplore]);

  const handleCloseBtn = useCallback(() => {
    trackWelcomeModalClosed({ step, method: 'x_button' });
    onClose?.();
  }, [step, onClose]);

  const handleBackdropClose = useCallback(() => {
    trackWelcomeModalClosed({ step, method: 'backdrop' });
    onClose?.();
  }, [step, onClose]);

  // Track step views (fire once per step per modal open)
  useEffect(() => {
    if (!open) return;
    if (trackedStepsRef.current.has(step)) return;
    trackedStepsRef.current.add(step);
    trackWelcomeModalViewed({ step });
  }, [open, step]);

  // Focus management
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

  // Keyboard: Escape + Arrow keys
  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Escape') {
        trackWelcomeModalClosed({ step, method: 'escape' });
        onClose?.();
      }
      if (e.key === 'ArrowRight' && step < TOTAL_STEPS) goTo(step + 1, step);
      if (e.key === 'ArrowLeft' && step > 1) goTo(step - 1, step);
    },
    [onClose, step, goTo],
  );

  // Scroll lock + keyboard listener
  useEffect(() => {
    if (!open) return;
    document.addEventListener('keydown', handleKeyDown);
    const scrollY = window.scrollY;
    const { body } = document;
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

  // Reset state on open — use requestAnimationFrame to avoid sync setState in effect body
  useEffect(() => {
    if (open) {
      const id = requestAnimationFrame(() => {
        setStep(1);
        trackedStepsRef.current = new Set();
      });
      return () => cancelAnimationFrame(id);
    }
  }, [open]);

  // Touch / swipe
  const handleTouchStart = useCallback((e) => {
    touchXRef.current    = e.targetTouches[0].clientX;
    touchEndXRef.current = null;
  }, []);
  const handleTouchMove = useCallback((e) => {
    touchEndXRef.current = e.targetTouches[0].clientX;
  }, []);
  const handleTouchEnd = useCallback(() => {
    if (touchXRef.current == null || touchEndXRef.current == null) return;
    const diff = touchXRef.current - touchEndXRef.current;
    if (diff > SWIPE_THRESHOLD && step < TOTAL_STEPS) goTo(step + 1, step);
    else if (diff < -SWIPE_THRESHOLD && step > 1) goTo(step - 1, step);
    touchXRef.current    = null;
    touchEndXRef.current = null;
  }, [step, goTo]);

  if (!open) return null;

  return createPortal(
    <div
      className={styles.backdrop}
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to Maximus Sports"
      onClick={(e) => { if (e.target === e.currentTarget) handleBackdropClose(); }}
    >
      <div
        className={styles.panel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <button
          ref={closeBtnRef}
          type="button"
          className={styles.closeBtn}
          aria-label="Close welcome modal"
          onClick={handleCloseBtn}
        >
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M4 4L16 16M16 4L4 16" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
        </button>

        <div className={styles.scroller}>

          {/* ── Step 1: Hero ── */}
          {step === 1 && (
            <div className={styles.stepContent} aria-label="Step 1 of 4: Product introduction">
              <div className={styles.heroVisual}>
                <img
                  src="/mascot.png"
                  alt="Maximus Sports mascot"
                  className={styles.heroMascot}
                  loading="eager"
                />
              </div>
              <div className={styles.body}>
                <h2 className={styles.headline}>Own the Board</h2>
                <p className={styles.subtitle}>
                  Real-time college basketball intelligence — picks, team trends, and matchup edges, all in one place.
                </p>
                <p className={styles.subtitleSmall}>
                  Built for fans who want more than scores.
                </p>
              </div>
            </div>
          )}

          {/* ── Step 2: Team Intel + Picks ── */}
          {step === 2 && (
            <div className={styles.stepContent} aria-label="Step 2 of 4: Team Intel and Picks">
              <div className={styles.featureBody}>
                <div className={styles.featureHeader}>
                  <h2 className={styles.featureHeadline}>See the Game Before It Happens</h2>
                  <p className={styles.featureSubtitle}>
                    Track every matchup with Team Intel, ATS trends, and Maximus&#8217;s AI-powered picks.
                  </p>
                </div>

                <div className={styles.featurePreviews}>
                  <div className={styles.previewCard}>
                    <div className={styles.previewFrame}>
                      <TeamIntelPreview />
                    </div>
                    <span className={styles.previewLabel}>Team Intel Hub</span>
                  </div>
                  <div className={styles.previewCard}>
                    <div className={styles.previewFrame}>
                      <AIPicksPreview />
                    </div>
                    <span className={styles.previewLabel}>AI-Powered Picks</span>
                  </div>
                </div>

                <ul className={styles.bulletList}>
                  <li className={styles.bullet}><TargetIcon /><span>Matchup breakdowns and edge signals</span></li>
                  <li className={styles.bullet}><ChartIcon /><span>Pick Em, ATS, and totals — all in one view</span></li>
                </ul>
              </div>
            </div>
          )}

          {/* ── Step 3: Bracketology ── */}
          {step === 3 && (
            <div className={styles.stepContent} aria-label="Step 3 of 4: Bracketology">
              <div className={styles.featureBody}>
                <div className={styles.featureHeader}>
                  <h2 className={styles.featureHeadline}>Build Smarter Brackets</h2>
                  <p className={styles.featureSubtitle}>
                    Use Maximus projections to build, compare, and stress-test your bracket.
                  </p>
                </div>

                <div className={styles.bracketVisual}>
                  <div className={styles.bracketPlaceholder}>
                    <BracketIcon />
                    <span>Bracketology</span>
                  </div>
                </div>

                <ul className={styles.bulletList}>
                  <li className={styles.bullet}><TargetIcon /><span>Model-driven picks for every round</span></li>
                  <li className={styles.bullet}><ChartIcon /><span>Compare your bracket vs Maximus</span></li>
                  <li className={styles.bullet}><BracketIcon /><span>Spot upset opportunities early</span></li>
                </ul>
              </div>
            </div>
          )}

          {/* ── Step 4: Personalization + CTA ── */}
          {step === 4 && (
            <div className={styles.stepContent} aria-label="Step 4 of 4: Get started">
              <div className={styles.ctaBody}>
                <h2 className={styles.ctaHeadline}>Make It Yours</h2>
                <p className={styles.ctaSubtitle}>
                  Follow your teams, get custom intel, and stay ahead all season long.
                </p>

                <div className={styles.valueProps}>
                  <div className={styles.valueProp}>
                    <span className={styles.valuePropIcon}><PersonIcon /></span>
                    <div>
                      <h3 className={styles.valuePropTitle}>Personalized feeds and alerts</h3>
                      <p className={styles.valuePropDesc}>Pin your teams and build a custom command center.</p>
                    </div>
                  </div>
                  <div className={styles.valueProp}>
                    <span className={styles.valuePropIcon}><MailIcon /></span>
                    <div>
                      <h3 className={styles.valuePropTitle}>Custom email digests</h3>
                      <p className={styles.valuePropDesc}>AI briefings, ATS trends, and odds movement hit your inbox.</p>
                    </div>
                  </div>
                  <div className={styles.valueProp}>
                    <span className={`${styles.valuePropIcon} ${styles.valuePropIconPro}`}><StarIcon /></span>
                    <div>
                      <h3 className={styles.valuePropTitle}>Go deeper with Pro</h3>
                      <p className={styles.valuePropDesc}>Upgrade anytime for deeper coverage and unlimited tracking.</p>
                    </div>
                  </div>
                </div>

                <div className={styles.ctaGroup}>
                  <button type="button" className={styles.ctaPrimary} onClick={handleSignup}>
                    Create Free Account
                  </button>
                  <button type="button" className={styles.ctaSecondary} onClick={handleExplore}>
                    Skip for now
                  </button>
                </div>
                <p className={styles.footerNote}>Free to start. Takes less than 30 seconds.</p>
              </div>
            </div>
          )}

        </div>

        {/* ── Navigation footer ── */}
        <div className={styles.navFooter}>
          <div className={styles.dotsWrap}>
            <div className={styles.dots} role="tablist" aria-label="Onboarding steps">
              {[1, 2, 3, 4].map((n) => (
                <button
                  key={n}
                  type="button"
                  role="tab"
                  className={`${styles.dot} ${step === n ? styles.dotActive : ''}`}
                  onClick={() => goTo(n, step)}
                  aria-label={`Step ${n}`}
                  aria-selected={step === n}
                />
              ))}
            </div>
            <span className={styles.stepCounter}>{step}/{TOTAL_STEPS}</span>
          </div>
          {step < TOTAL_STEPS && (
            <div className={styles.navActions}>
              <button type="button" className={styles.navNext} onClick={handleNext}>
                {step === 1 ? 'Get Started' : 'Next'}
                <span aria-hidden="true">{' \u2192'}</span>
              </button>
              <button type="button" className={styles.navSkip} onClick={handleSkip}>
                Skip intro
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
