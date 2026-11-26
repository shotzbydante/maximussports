/**
 * GatedContent — shared preview+fade+CTA treatment for guest users.
 *
 * Usage:
 *   <GatedContent sport="mlb" next="/mlb/games">{children}</GatedContent>
 *
 * Renders children clipped to ~25% of their full height, with a gradient
 * fade and a centered create-account CTA below. Shared across MLB and NBA
 * (and any future preview-gated surfaces).
 *
 * A page can say where its free part ends by rendering an element with
 * `data-gate-start` (see GateStart below). The preview then runs to that
 * element instead of to a share of the page, and the wall can take its
 * heading from it, so the ask names what is behind the wall.
 */

import { useRef, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import styles from './GatedContent.module.css';
import { trackSignupWallViewed, trackSignupCtaClicked } from '../../analytics/onboarding';

/** How much of the gated part shows, faded, below the free part. */
const PEEK_PX = 96;

/** Marks where a page's free part ends. Renders nothing a reader can see. */
export function GateStart({ title, sub, freePicks }) {
  return <div data-gate-start="" data-gate-title={title || undefined} data-gate-sub={sub || undefined} data-gate-free={freePicks ?? undefined} aria-hidden="true" />;
}

const SPORT_COPY = {
  mlb: {
    title: 'Unlock full MLB intelligence',
    sub: 'Create your free account to access every matchup, pick, odds insight, and team intel brief.',
  },
  nba: {
    title: 'Unlock full NBA intelligence',
    sub: 'Create your free account to access every game tonight, the picks, team intel, and the daily brief.',
  },
  nfl: {
    title: 'Unlock full NFL intelligence',
    sub: 'Create your free account to access every game on the board, the picks, team intel, and season projections.',
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
  const innerRef = useRef(null);
  const wallRef = useRef(null);
  const [previewPx, setPreviewPx] = useState(420);
  const [mark, setMark] = useState(null);
  const copy = { ...(SPORT_COPY[sport] || SPORT_COPY.mlb), ...(mark?.title ? { title: mark.title } : {}), ...(mark?.sub ? { sub: mark.sub } : {}) };
  const ctaHref = next
    ? `/settings?next=${encodeURIComponent(next)}`
    : '/settings';

  useEffect(() => {
    function measure() {
      const el = clipRef.current;
      if (!el) return;
      const start = el.querySelector('[data-gate-start]');
      if (start) {
        const top = start.getBoundingClientRect().top - el.getBoundingClientRect().top;
        setPreviewPx(Math.round(top) + PEEK_PX);
        const d = start.dataset;
        setMark((m) => (m && m.title === d.gateTitle && m.sub === d.gateSub && m.free === d.gateFree
          ? m : { title: d.gateTitle, sub: d.gateSub, free: d.gateFree }));
        return;
      }
      setMark(null);
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
    // The clip's own box stops growing once it is capped; the content inside is what changes as data loads.
    if (innerRef.current) ro.observe(innerRef.current);
    window.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
  }, [previewPercent]);

  // One signup_wall_viewed per mount, the first time the wall is on screen.
  const freePicks = mark?.free;
  useEffect(() => {
    const el = wallRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    // Half the wall, on screen for a full second: a page that is still loading can flash it past.
    let timer = null;
    const io = new IntersectionObserver((entries) => {
      const on = entries[entries.length - 1]?.isIntersecting;
      clearTimeout(timer);
      if (!on) return;
      timer = setTimeout(() => {
        io.disconnect();
        trackSignupWallViewed({ placement: 'gate_wall', sport, freePicks: freePicks === undefined ? undefined : Number(freePicks) });
      }, 1000);
    }, { threshold: 0.5 });
    io.observe(el);
    return () => { clearTimeout(timer); io.disconnect(); };
  }, [sport, freePicks]);

  return (
    <div className={styles.root}>
      {/* Preview: real content, clipped */}
      <div className={styles.contentClip} ref={clipRef} style={{ maxHeight: `${previewPx}px` }}>
        <div className={styles.contentInner} ref={innerRef}>{children}</div>
        <div className={`${styles.fadeBand} ${styles[`fade_${sport}`] || ''}`} style={mark ? { height: `${PEEK_PX}px` } : undefined} aria-hidden />
      </div>

      {/* CTA card */}
      <div className={`${styles.ctaFill} ${styles[`fill_${sport}`] || ''}`}>
        <div className={styles.ctaCard} ref={wallRef}>
          <div className={styles.lockIcon} aria-hidden>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0110 0v4" />
            </svg>
          </div>
          <h3 className={styles.ctaTitle}>{copy.title}</h3>
          <p className={styles.ctaSub}>{copy.sub}</p>
          <Link
            to={ctaHref}
            className={`${styles.ctaPrimary} ${styles[`btn_${sport}`] || ''}`}
            onClick={() => trackSignupCtaClicked({ placement: 'gate_wall', sport })}
          >
            Create Free Account &rarr;
          </Link>
          <p className={styles.ctaFoot}>Free forever. No credit card required.</p>
        </div>
      </div>
    </div>
  );
}
