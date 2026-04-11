/**
 * GatedContent — premium progressive content gate for unauthenticated users.
 *
 * Shows the top portion of real content, then fades into a polished
 * signup CTA overlay that fills the remaining viewport. No dead white space.
 *
 * Props:
 *   previewPercent  — how much of the page to show (default 25)
 *   sport           — 'mlb' | 'ncaam' | 'nba' (for sport-specific copy)
 *   title           — override CTA title
 *   subtitle        — override CTA subtitle
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

  // Calculate preview height + remaining viewport fill height
  useEffect(() => {
    if (user) return;

    function measure() {
      const isMobile = window.innerWidth <= 480;
      const minPx = isMobile ? 520 : 400;
      const pct = isMobile ? Math.max(previewPercent, 35) : previewPercent;
      const contentH = wrapperRef.current?.scrollHeight || 2000;
      const preview = Math.max(minPx, Math.round(contentH * pct / 100));
      setPreviewPx(preview);

      // Calculate how much viewport remains after the preview
      // so the fade+CTA region fills the rest with no white space
      const vh = window.innerHeight;
      const topOffset = wrapperRef.current?.getBoundingClientRect()?.top || 0;
      const remainingVh = vh - topOffset - preview + 120; // +120 for overlap
      setFillHeight(Math.max(360, remainingVh));
    }

    measure();

    // Re-measure on resize and after content loads
    const onResize = () => measure();
    window.addEventListener('resize', onResize);

    let observer;
    if (wrapperRef.current) {
      observer = new ResizeObserver(measure);
      observer.observe(wrapperRef.current);
    }

    return () => {
      window.removeEventListener('resize', onResize);
      observer?.disconnect();
    };
  }, [user, previewPercent]);

  // Authenticated users see everything
  if (user) return <>{children}</>;

  return (
    <div className={styles.gatedWrapper} ref={wrapperRef}>
      {/* Real content — clipped to preview height */}
      <div className={styles.contentClip} style={{ maxHeight: `${previewPx}px` }}>
        {children}
      </div>

      {/* Fade + CTA overlay — fills remaining viewport */}
      <div className={styles.fadeOverlay} style={{ minHeight: `${fillHeight}px` }}>
        <div className={styles.ctaRegion}>
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
    </div>
  );
}
