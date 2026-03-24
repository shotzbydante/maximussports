/**
 * WelcomeModal — 4-step product-led onboarding for first-time visitors.
 * v2: conversion-optimized copy, real product screenshots, stronger CTAs.
 *
 * Step 1: Hero — "Own the Board" + product positioning
 * Step 2: Team Intel + Picks showcase (product screenshots)
 * Step 3: Bracketology showcase (product screenshot)
 * Step 4: Personalization + conversion CTA
 *
 * Image strategy:
 *   - Each slide references a product screenshot in /onboarding/
 *   - Falls back to preview components or placeholders if images not yet placed
 *   - Easy to swap: just drop new PNGs into public/onboarding/
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
import RobotAvatar, { JERSEY_COLORS, ROBOT_COLORS, DEFAULT_ROBOT_CONFIG } from '../profile/RobotAvatar';
import styles from './WelcomeModal.module.css';

const TOTAL_STEPS = 4;
const SWIPE_THRESHOLD = 50;

/* ── Product screenshot paths (easy to swap) ───────────────────────── */
const HERO_TEAM_INTEL = '/onboarding/team-intel.png';
const HERO_PICKS = '/onboarding/picks.png';
const HERO_BRACKET = '/onboarding/bracketology.png';

/* ── Icons ─────────────────────────────────────────────────────────── */

function TargetIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 3v18h18" /><path d="M7 16l4-8 4 4 5-9" />
    </svg>
  );
}

function BracketIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 4v4h4" /><path d="M4 8l4 4" /><path d="M4 20v-4h4" /><path d="M4 16l4-4" /><path d="M12 12h4" /><path d="M20 4v16" />
    </svg>
  );
}

function PersonIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="4" width="20" height="16" rx="2" /><path d="M22 7l-10 7L2 7" />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
    </svg>
  );
}

/* ── ProductImage: shows screenshot or falls back to children ─────── */

function ProductImage({ src, alt, children }) {
  const [failed, setFailed] = useState(false);
  if (failed && children) return children;
  return (
    <img
      src={src}
      alt={alt}
      className={styles.productImg}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

/* ── Step 4: Identity customization ─────────────────────────────────── */

function Step4Identity({ onSignup, onExplore }) {
  const [mascotType, setMascotType] = useState('basketball');
  const [jerseyColor, setJerseyColor] = useState(DEFAULT_ROBOT_CONFIG.jerseyColor);
  const [robotColor, setRobotColor] = useState(DEFAULT_ROBOT_CONFIG.robotColor);
  const [jerseyNumber, setJerseyNumber] = useState('');

  return (
    <div className={styles.stepContent} aria-label="Step 4 of 4">
      <div className={styles.identityBody}>
        <h2 className={styles.identityHeadline}>Create Your Identity</h2>
        <p className={styles.identitySubtitle}>Choose your mascot and make it yours.</p>

        {/* Live preview */}
        <div className={styles.identityPreview}>
          <RobotAvatar
            mascotType={mascotType}
            jerseyNumber={jerseyNumber}
            jerseyColor={jerseyColor}
            robotColor={robotColor}
            size={100}
            glow
          />
        </div>

        {/* Mascot type toggle */}
        <div className={styles.identityToggle}>
          <button type="button"
            className={`${styles.identityToggleBtn} ${mascotType === 'basketball' ? styles.identityToggleBtnActive : ''}`}
            onClick={() => setMascotType('basketball')}>
            🏀 Basketball
          </button>
          <button type="button"
            className={`${styles.identityToggleBtn} ${mascotType === 'baseball' ? styles.identityToggleBtnActive : ''}`}
            onClick={() => setMascotType('baseball')}>
            ⚾ Baseball
          </button>
        </div>

        {/* Jersey number */}
        <div className={styles.identityField}>
          <label className={styles.identityLabel}>Jersey Number</label>
          <input
            type="text"
            inputMode="numeric"
            placeholder="23"
            className={styles.identityInput}
            value={jerseyNumber}
            onChange={(e) => setJerseyNumber(e.target.value.replace(/\D/g, '').slice(0, 2))}
          />
        </div>

        {/* Color pickers */}
        <div className={styles.identityColors}>
          <div className={styles.identityColorGroup}>
            <span className={styles.identityLabel}>Jersey Color</span>
            <div className={styles.identitySwatches}>
              {JERSEY_COLORS.map(c => (
                <button key={c.id} type="button" title={c.label}
                  className={`${styles.identitySwatch} ${jerseyColor === c.hex ? styles.identitySwatchActive : ''}`}
                  style={{ background: c.hex }}
                  onClick={() => setJerseyColor(c.hex)} />
              ))}
            </div>
          </div>
          <div className={styles.identityColorGroup}>
            <span className={styles.identityLabel}>Robot Color</span>
            <div className={styles.identitySwatches}>
              {ROBOT_COLORS.map(c => (
                <button key={c.id} type="button" title={c.label}
                  className={`${styles.identitySwatch} ${robotColor === c.hex ? styles.identitySwatchActive : ''}`}
                  style={{ background: c.hex }}
                  onClick={() => setRobotColor(c.hex)} />
              ))}
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className={styles.ctaGroup}>
          <button type="button" className={styles.ctaPrimary} onClick={onSignup}>
            Create Free Account
          </button>
          <button type="button" className={styles.ctaSecondary} onClick={onExplore}>
            Skip for now
          </button>
        </div>
        <p className={styles.footerNote}>Your board. Your signals. Your edge.</p>
      </div>
    </div>
  );
}

/* ── Main component ────────────────────────────────────────────────── */

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

  useEffect(() => {
    if (!open) return;
    if (trackedStepsRef.current.has(step)) return;
    trackedStepsRef.current.add(step);
    trackWelcomeModalViewed({ step });
  }, [open, step]);

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

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Escape') { trackWelcomeModalClosed({ step, method: 'escape' }); onClose?.(); }
      if (e.key === 'ArrowRight' && step < TOTAL_STEPS) goTo(step + 1, step);
      if (e.key === 'ArrowLeft' && step > 1) goTo(step - 1, step);
    },
    [onClose, step, goTo],
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener('keydown', handleKeyDown);
    const scrollY = window.scrollY;
    const { body } = document;
    body.style.overflow = 'hidden'; body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`; body.style.width = '100%';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      body.style.overflow = ''; body.style.position = '';
      body.style.top = ''; body.style.width = '';
      window.scrollTo(0, scrollY);
    };
  }, [open, handleKeyDown]);

  useEffect(() => {
    if (open) {
      const id = requestAnimationFrame(() => {
        setStep(1);
        trackedStepsRef.current = new Set();
      });
      return () => cancelAnimationFrame(id);
    }
  }, [open]);

  const handleTouchStart = useCallback((e) => { touchXRef.current = e.targetTouches[0].clientX; touchEndXRef.current = null; }, []);
  const handleTouchMove = useCallback((e) => { touchEndXRef.current = e.targetTouches[0].clientX; }, []);
  const handleTouchEnd = useCallback(() => {
    if (touchXRef.current == null || touchEndXRef.current == null) return;
    const diff = touchXRef.current - touchEndXRef.current;
    if (diff > SWIPE_THRESHOLD && step < TOTAL_STEPS) goTo(step + 1, step);
    else if (diff < -SWIPE_THRESHOLD && step > 1) goTo(step - 1, step);
    touchXRef.current = null; touchEndXRef.current = null;
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
      <div className={styles.panel} onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
        <button ref={closeBtnRef} type="button" className={styles.closeBtn} aria-label="Close" onClick={handleCloseBtn}>
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M4 4L16 16M16 4L4 16" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
        </button>

        <div className={styles.scroller}>

          {/* ════ Step 1: Hero — multi-sport positioning ════ */}
          {step === 1 && (
            <div className={styles.stepContent} aria-label="Step 1 of 4">
              <div className={styles.heroVisual}>
                <div className={styles.heroDualMascot}>
                  <img src="/mascot.png" alt="Basketball Maximus" className={styles.heroMascotLeft} loading="eager" />
                  <img src="/maximus-logo.png" alt="Maximus Sports" className={styles.heroLogoCenter}
                    onError={(e) => { e.target.style.display = 'none'; }} />
                  <img src="/mascot-mlb.png" alt="Baseball Maximus" className={styles.heroMascotRight} loading="eager" />
                </div>
              </div>
              <div className={styles.body}>
                <h2 className={styles.headline}>Your new favorite sports intelligence app</h2>
                <p className={styles.subtitle}>
                  Real-time team intel, model-driven picks, and market edges — all in one place.
                </p>
                <p className={styles.subtitleSmall}>
                  Track your teams. Spot value early. Stay ahead of the game.
                </p>
              </div>
            </div>
          )}

          {/* ════ Step 2: Team Intel + Picks ════ */}
          {step === 2 && (
            <div className={styles.stepContent} aria-label="Step 2 of 4">
              <div className={styles.featureBody}>
                <div className={styles.featureHeader}>
                  <h2 className={styles.featureHeadline}>See the Game Before It Happens</h2>
                  <p className={styles.featureSubtitle}>
                    Predict outcomes with model-backed signals, matchup intel, and real-time data.
                  </p>
                  <p className={styles.featureSupport}>
                    Know who&#8217;s trending, who&#8217;s overvalued, and where the edge is before tip-off.
                  </p>
                </div>

                <div className={styles.featurePreviews}>
                  <div className={styles.previewCard}>
                    <div className={styles.previewFrame}>
                      <ProductImage src={HERO_TEAM_INTEL} alt="Team Intel Hub">
                        <TeamIntelPreview />
                      </ProductImage>
                    </div>
                    <span className={styles.previewLabel}>Team Intel Hub</span>
                  </div>
                  <div className={styles.previewCard}>
                    <div className={styles.previewFrame}>
                      <ProductImage src={HERO_PICKS} alt="Maximus's Picks">
                        <AIPicksPreview />
                      </ProductImage>
                    </div>
                    <span className={styles.previewLabel}>Maximus&#8217;s Picks</span>
                  </div>
                </div>

                <ul className={styles.bulletList}>
                  <li className={styles.bullet}><TargetIcon /><span>Matchup breakdowns and edge signals</span></li>
                  <li className={styles.bullet}><ChartIcon /><span>Pick Em, ATS, and totals in one view</span></li>
                </ul>
              </div>
            </div>
          )}

          {/* ════ Step 3: Bracketology + MLB Season Intelligence ════ */}
          {step === 3 && (
            <div className={styles.stepContent} aria-label="Step 3 of 4">
              <div className={styles.featureBody}>
                <div className={styles.featureHeader}>
                  <h2 className={styles.featureHeadline}>Stay Ahead of the Curve</h2>
                  <p className={styles.featureSubtitle}>
                    Deep intelligence layers across college basketball and MLB.
                  </p>
                </div>

                <div className={styles.dualFeatureCards}>
                  <div className={styles.dualCard}>
                    <div className={styles.dualCardIcon}><BracketIcon /></div>
                    <h3 className={styles.dualCardTitle}>Bracketology</h3>
                    <p className={styles.dualCardDesc}>
                      Simulate the tournament, compare picks vs Maximus, and find edges before tip-off.
                    </p>
                  </div>
                  <div className={styles.dualCard}>
                    <div className={styles.dualCardIcon}><ChartIcon /></div>
                    <h3 className={styles.dualCardTitle}>MLB Season Intelligence</h3>
                    <p className={styles.dualCardDesc}>
                      Projected wins, team outlooks, and betting edges across all 30 teams.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ════ Step 4: Identity + CTA ════ */}
          {step === 4 && (
            <Step4Identity
              onSignup={handleSignup}
              onExplore={handleExplore}
            />
          )}

        </div>

        {/* ── Navigation footer ── */}
        <div className={styles.navFooter}>
          <div className={styles.dotsWrap}>
            <div className={styles.dots} role="tablist" aria-label="Onboarding steps">
              {[1, 2, 3, 4].map((n) => (
                <button key={n} type="button" role="tab" className={`${styles.dot} ${step === n ? styles.dotActive : ''}`}
                  onClick={() => goTo(n, step)} aria-label={`Step ${n}`} aria-selected={step === n} />
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
