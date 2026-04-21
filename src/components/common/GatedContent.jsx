/**
 * GatedContent — shared preview+fade+CTA treatment for guest users.
 *
 * Usage:
 *   <GatedContent sport="mlb" next="/mlb/games">{children}</GatedContent>
 *
 * Renders children clipped to ~25% of their full height, with a gradient
 * fade and a centered create-account CTA below. Shared across MLB and NBA
 * (and any future preview-gated surfaces).
 */

import { useRef, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import styles from './GatedContent.module.css';

const SPORT_COPY = {
  mlb: {
    title: 'Unlock full MLB intelligence',
    sub: 'Create your free account to access every matchup, pick, odds insight, and team intel brief.',
  },
  nba: {
    title: 'Unlock full NBA intelligence',
    sub: 'Create your free account to access the full playoff bracket, picks board, team intel, and daily briefings.',
  },
  ncaam: {
    title: 'Unlock full NCAAM intelligence',
    sub: 'Create your free account to access bracketology, picks, ATS analytics, and team intel.',
  },
};

export default function GatedContent({
  sport = 'mlb',
  next,
  previewPercent = 25,
  children,
}) {
  const clipRef = useRef(null);
  const [previewPx, setPreviewPx] = useState(420);
  const copy = SPORT_COPY[sport] || SPORT_COPY.mlb;
  const ctaHref = next
    ? `/settings?next=${encodeURIComponent(next)}`
    : '/settings';

  useEffect(() => {
    function measure() {
      const el = clipRef.current;
      if (!el) return;
      const full = el.scrollHeight;
      const viewport = window.innerHeight || 800;
      const minDesktop = 400;
      const minMobile = 520;
      const mobile = window.innerWidth < 720;
      const target = Math.max(
        mobile ? minMobile : minDesktop,
        Math.floor(full * (previewPercent / 100))
      );
      setPreviewPx(Math.min(target, Math.floor(viewport * 0.9)));
    }
    measure();
    const ro = new ResizeObserver(measure);
    if (clipRef.current) ro.observe(clipRef.current);
    window.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
  }, [previewPercent]);

  return (
    <div className={styles.root}>
      {/* Preview: real content, clipped */}
      <div className={styles.contentClip} ref={clipRef} style={{ maxHeight: `${previewPx}px` }}>
        <div className={styles.contentInner}>{children}</div>
        <div className={`${styles.fadeBand} ${styles[`fade_${sport}`] || ''}`} aria-hidden />
      </div>

      {/* CTA card */}
      <div className={`${styles.ctaFill} ${styles[`fill_${sport}`] || ''}`}>
        <div className={styles.ctaCard}>
          <div className={styles.lockIcon} aria-hidden>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0110 0v4" />
            </svg>
          </div>
          <h3 className={styles.ctaTitle}>{copy.title}</h3>
          <p className={styles.ctaSub}>{copy.sub}</p>
          <Link to={ctaHref} className={`${styles.ctaPrimary} ${styles[`btn_${sport}`] || ''}`}>
            Create Free Account &rarr;
          </Link>
          <p className={styles.ctaFoot}>Free forever. No credit card required.</p>
        </div>
      </div>
    </div>
  );
}
