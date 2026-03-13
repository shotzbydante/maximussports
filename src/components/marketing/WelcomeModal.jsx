/**
 * WelcomeModal — 3-step onboarding carousel for first-time visitors.
 *
 * Step 1: Product hook — mascot video + positioning headline
 * Step 2: Product showcase — feature cards with screenshots
 * Step 3: Conversion — value props + CTAs
 *
 * Preserves:
 *   - Portal rendering (bypasses ancestor stacking contexts)
 *   - Focus management with restore-on-close
 *   - Escape key close
 *   - ARIA dialog attributes
 *   - Reduced motion handling
 *   - iOS-safe scroll locking
 *   - Mobile bottom-sheet layout
 *
 * Navigation:
 *   - Dot indicators (clickable)
 *   - Arrow keys (← →) advance/retreat steps
 *   - Swipe gestures on touch devices
 *   - "Skip intro" on steps 1–2, full CTAs on step 3
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
import styles from './WelcomeModal.module.css';

const TOTAL_STEPS = 3;
const SWIPE_THRESHOLD = 50;
const VIDEO_READY_TIMEOUT_MS = 2000;

const FEATURE_CARDS = [
  {
    id: 'team-intel',
    label: 'Team Intel Hub',
    sublabel: 'Bubble watch tiers, ATS profiles, and deep conference intel.',
    image: '/images/onboarding/team-intel.svg',
    overlay: 'ATS leaders + upcoming matchup edge',
  },
  {
    id: 'odds-insights',
    label: 'Odds Insights',
    sublabel: 'Market movers, spread signals, and underdog watch.',
    image: '/images/onboarding/odds-insights.svg',
    overlay: 'Live odds movement + value plays',
  },
  {
    id: 'ai-picks',
    label: 'AI-Powered Picks',
    sublabel: 'Model-driven signals with confidence levels.',
    image: '/images/onboarding/ai-picks.svg',
    overlay: "Pick'Em \u00b7 ATS \u00b7 Value \u00b7 Totals",
  },
];

const VALUE_PROPS = [
  {
    id: 'pin',
    title: 'Pin your teams',
    desc: 'Build a personalized dashboard around the teams you follow.',
  },
  {
    id: 'intel',
    title: 'Get daily intel',
    desc: 'AI briefings, ATS trends, and odds movement delivered to you.',
  },
  {
    id: 'pro',
    title: 'Unlock more with Pro',
    desc: 'Unlimited teams, full odds access, and deeper intelligence.',
  },
];

function PinIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2v8m-4-4h8m-4 4v10" />
      <circle cx="12" cy="6" r="4" />
    </svg>
  );
}

function IntelIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 20h20M5 20V10l4-6h6l4 6v10" />
      <path d="M9 20v-4h6v4" />
    </svg>
  );
}

function ProIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
    </svg>
  );
}

const ICONS = { pin: PinIcon, intel: IntelIcon, pro: ProIcon };

export default function WelcomeModal({ open, onClose, onSignup, onExplore }) {
  const closeBtnRef  = useRef(null);
  const prevFocusRef = useRef(null);
  const videoRef     = useRef(null);
  const touchXRef    = useRef(null);
  const touchEndXRef = useRef(null);
  const trackedStepsRef = useRef(new Set());
  const videoTimerRef = useRef(null);

  const [step, setStep]             = useState(1);
  const [videoReady, setVideoReady] = useState(false);
  const [imgErrors, setImgErrors]   = useState({});

  const markVideoReady = useCallback(() => {
    setVideoReady(true);
    if (videoTimerRef.current) clearTimeout(videoTimerRef.current);
  }, []);

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

  // Reset state on open + force video play on mobile
  useEffect(() => {
    if (open) {
      setStep(1);
      setVideoReady(false);
      setImgErrors({});
      trackedStepsRef.current = new Set();

      videoTimerRef.current = setTimeout(() => setVideoReady(true), VIDEO_READY_TIMEOUT_MS);

      requestAnimationFrame(() => {
        const vid = videoRef.current;
        if (vid) {
          vid.play().catch(() => {});
        }
      });
    }
    return () => {
      if (videoTimerRef.current) clearTimeout(videoTimerRef.current);
    };
  }, [open]);

  // Preload Step 2 images during Step 1
  useEffect(() => {
    if (!open || step !== 1) return;
    FEATURE_CARDS.forEach(({ image }) => {
      const link = document.createElement('link');
      link.rel  = 'preload';
      link.as   = 'image';
      link.href = image;
      document.head.appendChild(link);
    });
  }, [open, step]);

  // Touch / swipe handlers
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

  const handleImgError = useCallback((cardId) => {
    setImgErrors((prev) => ({ ...prev, [cardId]: true }));
  }, []);

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

          {/* ── Step 1: Product Hook ── */}
          {step === 1 && (
            <div className={styles.stepContent} aria-label="Step 1 of 3: Product introduction">
              <div className={`${styles.videoWrap}${videoReady ? ` ${styles.videoLoaded}` : ''}`}>
                <img
                  src="/mascot.png"
                  alt=""
                  className={styles.videoPoster}
                  aria-hidden="true"
                />
                <video
                  ref={videoRef}
                  className={styles.video}
                  src="/videos/maximus-dunk.mp4"
                  autoPlay
                  muted
                  loop
                  playsInline
                  preload="auto"
                  onCanPlay={markVideoReady}
                  onLoadedData={markVideoReady}
                  onPlaying={markVideoReady}
                />
              </div>
              <div className={styles.body}>
                <h2 className={styles.headline}>
                  See the College Basketball Board Like&nbsp;a&nbsp;Pro
                </h2>
                <p className={styles.subtitle}>
                  Turn the college basketball board into actionable intelligence
                  — from team intel and ATS trends to odds insights and model-driven picks.
                </p>
              </div>
            </div>
          )}

          {/* ── Step 2: Product Showcase ── */}
          {step === 2 && (
            <div className={styles.stepContent} aria-label="Step 2 of 3: Feature showcase">
              <div className={styles.showcaseBody}>
                <div className={styles.showcaseHeader}>
                  <p className={styles.showcaseEyebrow}>See What&#8217;s Inside</p>
                  <p className={styles.showcaseSubtitle}>
                    Three surfaces. One command center.
                  </p>
                </div>
                <div className={styles.featureCards}>
                  {FEATURE_CARDS.map((card) => (
                    <div key={card.id} className={styles.featureCard}>
                      <div className={styles.featureImageWrap}>
                        {imgErrors[card.id] ? (
                          <div className={styles.featureImageFallback} />
                        ) : (
                          <img
                            src={card.image}
                            alt={card.label}
                            className={styles.featureImage}
                            loading="eager"
                            onError={() => handleImgError(card.id)}
                          />
                        )}
                        <span className={styles.featureOverlay}>{card.overlay}</span>
                      </div>
                      <h3 className={styles.featureLabel}>{card.label}</h3>
                      <p className={styles.featureSublabel}>{card.sublabel}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Step 3: Conversion ── */}
          {step === 3 && (
            <div className={styles.stepContent} aria-label="Step 3 of 3: Get started">
              <div className={styles.conversionBody}>
                <h2 className={styles.conversionHeadline}>Your Edge Starts Here</h2>
                <div className={styles.valueProps}>
                  {VALUE_PROPS.map((vp) => {
                    const Icon = ICONS[vp.id];
                    return (
                      <div key={vp.id} className={styles.valueProp}>
                        <span className={`${styles.valuePropIcon} ${vp.id === 'pro' ? styles.valuePropIconPro : ''}`}>
                          <Icon />
                        </span>
                        <div>
                          <h3 className={styles.valuePropTitle}>{vp.title}</h3>
                          <p className={styles.valuePropDesc}>{vp.desc}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className={styles.ctaGroup}>
                  <button type="button" className={styles.ctaPrimary} onClick={handleSignup}>
                    Create free account
                  </button>
                  <button type="button" className={styles.ctaSecondary} onClick={handleExplore}>
                    Continue as guest
                  </button>
                </div>
                <p className={styles.footerNote}>Free to use. Pro available when you&#8217;re ready.</p>
              </div>
            </div>
          )}

        </div>

        {/* ── Navigation footer ── */}
        <div className={styles.navFooter}>
          <div className={styles.dotsWrap}>
            <div className={styles.dots} role="tablist" aria-label="Onboarding steps">
              {[1, 2, 3].map((n) => (
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
