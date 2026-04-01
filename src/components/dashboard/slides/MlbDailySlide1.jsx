/**
 * MlbDailySlide1 — Hero Cover Slide (Slide 1 of MLB Daily Briefing carousel)
 *
 * Purpose: Scroll-stopping hook + brand + context
 * Content: Mascot hero · "DAILY MLB BRIEFING" · Date · MLB logo · Branding
 *
 * 1080×1350 · IG 4:5 portrait
 */

import styles from './MlbDailySlide1.module.css';

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

      {/* Top brand bar */}
      <div className={styles.topBar}>
        <img src="/logo.png" alt="" className={styles.brandLogo} crossOrigin="anonymous" />
        <span className={styles.brandName}>MAXIMUS SPORTS</span>
      </div>

      {/* Center hero composition */}
      <div className={styles.heroZone}>
        <img
          src="/mascot-mlb.png"
          alt="Maximus"
          className={styles.mascot}
          crossOrigin="anonymous"
          onError={e => { e.currentTarget.style.display = 'none'; }}
        />
      </div>

      {/* Title block */}
      <div className={styles.titleZone}>
        <div className={styles.badgeRow}>
          <img src="/mlb-logo.png" alt="" className={styles.mlbCrest} crossOrigin="anonymous" onError={e => { e.currentTarget.style.display = 'none'; }} />
        </div>
        <h1 className={styles.headline}>DAILY MLB<br />BRIEFING</h1>
        <div className={styles.dateLine}>{today}</div>
        <div className={styles.tagline}>AI-powered intelligence for the modern fan</div>
      </div>

      {/* Footer */}
      <footer className={styles.footer}>
        <span className={styles.footerUrl}>maximussports.ai</span>
      </footer>
    </div>
  );
}
