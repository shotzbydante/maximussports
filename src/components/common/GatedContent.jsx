/**
 * GatedContent — premium progressive content gate for unauthenticated users.
 *
 * Architecture:
 *   1. contentClip — real page content, clipped to previewPx
 *   2. fadeBand    — positioned over the bottom of contentClip, creates a
 *                    long gradual fade from transparent → dark navy
 *   3. ctaFill     — solid dark region below with CTA card, fills viewport
 *
 * This 3-layer approach gives a premium cinematic fade over real content
 * while ensuring no dead white space below.
 */

import { useRef, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import styles from './GatedContent.module.css';

const SPORT_COPY = {
  mlb:   { title: 'Unlock full MLB intelligence',   sub: 'Create your free account to access every matchup, team signal, and edge.' },
  ncaam: { title: 'Unlock full NCAAM intelligence',  sub: 'Create your free account to access picks, team intel, and bracket edges.' },
  nba:   { title: 'Unlock full NBA intelligence',    sub: 'Create your free account to access every matchup, team signal, and edge.' },
};

// Height of the gradient fade band that overlays the bottom of the content
const FADE_BAND_PX = 280;
const FADE_BAND_MOBILE = 200;

export default function GatedContent({
  children,
  previewPercent = 25,
  sport = 'mlb',
  title,
  subtitle,
  ctaLabel = 'Create Free Account',
  ctaRoute = '/settings',
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const wrapperRef = useRef(null);
  const [previewPx, setPreviewPx] = useState(600);
  const [fillHeight, setFillHeight] = useState(500);

  const copy = SPORT_COPY[sport] || SPORT_COPY.mlb;
  const heading = title || copy.title;
  const sub = subtitle || copy.sub;

  useEffect(() => {
    if (user) return;

    function measure() {
      const isMobile = window.innerWidth <= 480;
      const minPx = isMobile ? 520 : 400;
      const pct = isMobile ? Math.max(previewPercent, 35) : previewPercent;
      const contentH = wrapperRef.current?.scrollHeight || 2000;
      const preview = Math.max(minPx, Math.round(contentH * pct / 100));
      setPreviewPx(preview);

      const vh = window.innerHeight;
      const topOffset = wrapperRef.current?.getBoundingClientRect()?.top || 0;
      const remaining = vh - topOffset - preview;
      setFillHeight(Math.max(380, remaining + 60));
    }

    measure();
    window.addEventListener('resize', measure);
    let observer;
    if (wrapperRef.current) {
      observer = new ResizeObserver(measure);
      observer.observe(wrapperRef.current);
    }
    return () => {
      window.removeEventListener('resize', measure);
      observer?.disconnect();
    };
  }, [user, previewPercent]);

  if (user) return <>{children}</>;

  return (
    <div className={styles.gatedWrapper} ref={wrapperRef}>
      {/* Layer 1: Real content, clipped */}
      <div className={styles.contentClip} style={{ maxHeight: `${previewPx}px` }}>
        {children}
        {/* Layer 2: Gradient fade band — sits over the bottom of clipped content */}
        <div className={styles.fadeBand} />
      </div>

      {/* Layer 3: Solid fill + CTA — covers remaining viewport */}
      <div className={styles.ctaFill} style={{ minHeight: `${fillHeight}px` }}>
        <div className={styles.ctaCard}>
          <div className={styles.lockBadge}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </div>
          <h3 className={styles.ctaTitle}>{heading}</h3>
          <p className={styles.ctaSub}>{sub}</p>
          <button className={styles.ctaBtn} onClick={() => navigate(ctaRoute)}>
            {ctaLabel}
          </button>
          <p className={styles.ctaNote}>Free forever. No credit card required.</p>
        </div>
      </div>
    </div>
  );
}
