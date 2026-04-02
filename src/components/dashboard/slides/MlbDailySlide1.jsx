/**
 * MlbDailySlide1 — Hero Cover (Slide 1 of MLB Daily Briefing carousel)
 *
 * Composition: Brand pill (top) → Headline (upper) → Mascot hero (center) → Glass card (bottom)
 * Mascot head overlaps into headline zone for integrated feel.
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
      <div className={styles.s1BgStadium} />
      <div className={styles.s1BgStreaks} />
      <div className={styles.bgNoise} />

      {/* Brand pill — top center */}
      <div className={styles.s1TopBar}>
        <div className={styles.s1BrandPill}>
          <img src="/mlb-logo.png" alt="" className={styles.s1MlbMark} crossOrigin="anonymous" onError={e => { e.currentTarget.style.display = 'none'; }} />
          <span className={styles.s1BrandName}>MAXIMUS SPORTS</span>
        </div>
      </div>

      {/* Headline — upper zone */}
      <div className={styles.s1HeadlineZone}>
        <h1 className={styles.s1Headline}>MLB IS BACK.<br />THE EDGE IS LIVE.</h1>
        <div className={styles.s1SubHeadline}>2026 SEASON STARTS NOW</div>
      </div>

      {/* Mascot hero — center, overlaps headline + card */}
      <div className={styles.s1MascotZone}>
        <div className={styles.s1MascotGlow} />
        <img
          src="/mascot-mlb.png"
          alt="Maximus"
          className={styles.s1Mascot}
          crossOrigin="anonymous"
          onError={e => { e.currentTarget.style.display = 'none'; }}
        />
      </div>

      {/* Bottom glass card */}
      <div className={styles.s1CardZone}>
        <div className={styles.s1GlassCard}>
          <div className={styles.s1CardTopLine} />
          <div className={styles.s1CardLabel}>DAILY MLB BRIEFING</div>
          <div className={styles.s1CardDate}>{today}</div>
          <div className={styles.s1CardDivider} />
          <div className={styles.s1CardTitle}>DAILY MLB BRIEFING</div>
          <div className={styles.s1CardTagline}>AI-POWERED INTEL FOR THE MODERN FAN</div>
        </div>
      </div>

      <footer className={styles.footer}>
        <span className={styles.footerUrl}>maximussports.ai</span>
      </footer>
    </div>
  );
}
