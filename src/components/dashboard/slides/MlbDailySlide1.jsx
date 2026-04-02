/**
 * MlbDailySlide1 — Hero Cover (Slide 1 of MLB Daily Briefing carousel)
 *
 * Composition: Brand pill → Headline → Mascot hero (white neon halo) → Glass card
 * 1080×1350 · IG 4:5 portrait
 */

import styles from './MlbSlides.module.css';

export default function MlbDailySlide1({ data, asOf, ...rest }) {
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    timeZone: 'America/Los_Angeles',
  });

  return (
    <div className={`${styles.artboard} ${styles.liveMotion}`} {...rest}>
      <div className={styles.bgBase} />
      <div className={styles.bgGlow} />
      <div className={styles.bgRay} />
      <div className={styles.bgStadium} />
      <div className={styles.bgStreaks} />
      <div className={styles.bgNoise} />

      {/* Brand pill */}
      <div className={styles.s1TopBar}>
        <div className={styles.s1Pill}>
          <img src="/mlb-logo.png" alt="" className={styles.s1PillLogo} crossOrigin="anonymous" onError={e => { e.currentTarget.style.display = 'none'; }} />
          <span>MAXIMUS SPORTS</span>
        </div>
      </div>

      {/* Headline */}
      <div className={styles.s1HeadlineZone}>
        <h1 className={styles.s1Headline}>MLB IS BACK.<br />THE EDGE IS LIVE.</h1>
        <div className={styles.s1Sub}>2026 SEASON STARTS NOW</div>
      </div>

      {/* Mascot with white neon halo */}
      <div className={styles.s1MascotZone}>
        <div className={styles.s1MascotHalo} />
        <img
          src="/mascot-mlb.png"
          alt="Maximus"
          className={styles.s1Mascot}
          crossOrigin="anonymous"
          onError={e => { e.currentTarget.style.display = 'none'; }}
        />
      </div>

      {/* Bottom glass card — simplified */}
      <div className={styles.s1CardZone}>
        <div className={styles.s1CardHalo} />
        <div className={styles.s1Card}>
          <div className={styles.cardHighlight} />
          <div className={styles.s1CardTitle}>DAILY MLB BRIEFING</div>
          <div className={styles.s1CardDate}>{today}</div>
        </div>
      </div>

      <footer className={styles.footer}>
        <span className={styles.footerUrl}>maximussports.ai</span>
      </footer>
    </div>
  );
}
