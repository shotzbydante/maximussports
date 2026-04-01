/**
 * MlbDailySlide1 — Hero Cover (Slide 1 of MLB Daily Briefing carousel)
 *
 * Purpose: Scroll-stopping IG cover hook
 * Composition: Brand (top) → Mascot (top-third) → Hero title (center) → Badge (bottom)
 *
 * 1080×1350 · IG 4:5 portrait
 */

import styles from './MlbSlides.module.css';

export default function MlbDailySlide1({ data, asOf, ...rest }) {
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    timeZone: 'America/Los_Angeles',
  });

  return (
    <div className={styles.artboard} {...rest}>
      <div className={styles.bgBase} />
      <div className={styles.bgGlow} />
      <div className={styles.bgRay} />
      <div className={styles.bgNoise} />

      {/* Top brand bar */}
      <div className={styles.s1TopBar}>
        <img src="/logo.png" alt="" className={styles.s1BrandLogo} crossOrigin="anonymous" />
        <span className={styles.s1BrandName}>MAXIMUS SPORTS</span>
        <img src="/mlb-logo.png" alt="" className={styles.s1MlbMark} crossOrigin="anonymous" onError={e => { e.currentTarget.style.display = 'none'; }} />
      </div>

      {/* Mascot — top-third zone, slight rotation */}
      <div className={styles.s1MascotZone}>
        <img
          src="/mascot-mlb.png"
          alt="Maximus"
          className={styles.s1Mascot}
          crossOrigin="anonymous"
          onError={e => { e.currentTarget.style.display = 'none'; }}
        />
      </div>

      {/* Hero title — centered on canvas */}
      <div className={styles.s1TitleZone}>
        <h1 className={styles.s1Headline}>MLB IS BACK.<br />THE EDGE IS LIVE.</h1>
        <div className={styles.s1SubHeadline}>2026 SEASON STARTS NOW</div>
      </div>

      {/* Bottom info */}
      <div className={styles.s1BottomBlock}>
        <div className={styles.s1BadgeRow}>
          <span className={styles.s1Badge}>DAILY MLB BRIEFING</span>
        </div>
        <div className={styles.s1DateLine}>{today}</div>
        <div className={styles.s1Tagline}>AI-powered intel for the modern fan</div>
      </div>

      <footer className={styles.footer}>
        <span className={styles.footerUrl}>maximussports.ai</span>
      </footer>
    </div>
  );
}
