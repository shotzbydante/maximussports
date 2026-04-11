/**
 * GatedContent — premium progressive content gate for unauthenticated users.
 *
 * Shows the top portion of real content, then fades into a polished
 * signup CTA overlay. Authenticated users see everything normally.
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

  const copy = SPORT_COPY[sport] || SPORT_COPY.mlb;
  const heading = title || copy.title;
  const sub = subtitle || copy.sub;

  // Calculate preview height based on actual rendered content.
  // Mobile gets a higher minimum so users see more real content before the gate.
  useEffect(() => {
    if (user || !wrapperRef.current) return;
    const isMobile = window.innerWidth <= 480;
    const minPx = isMobile ? 520 : 400;
    const pct = isMobile ? Math.max(previewPercent, 35) : previewPercent;
    const observer = new ResizeObserver(() => {
      const h = wrapperRef.current?.scrollHeight || 2000;
      setPreviewPx(Math.max(minPx, Math.round(h * pct / 100)));
    });
    observer.observe(wrapperRef.current);
    return () => observer.disconnect();
  }, [user, previewPercent]);

  // Authenticated users see everything
  if (user) return <>{children}</>;

  return (
    <div className={styles.gatedWrapper} ref={wrapperRef}>
      {/* Real content — clipped to preview height */}
      <div className={styles.contentClip} style={{ maxHeight: `${previewPx}px` }}>
        {children}
      </div>

      {/* Fade + CTA overlay */}
      <div className={styles.fadeOverlay}>
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
