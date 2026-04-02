/**
 * MlbDailySlide1 — Hero Cover (Slide 1 of MLB Daily Briefing carousel)
 *
 * Cinematic stadium-lit composition matching reference:
 * Brand plaque → Huge headline → Hero mascot w/ neon halo → Premium briefing card
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
    <div className={styles.slide1} {...rest}>
      <div className={styles.slide1BgBase} />
      <div className={styles.slide1BgLights} />
      <div className={styles.slide1BgArena} />
      <div className={styles.slide1BgParticles} />
      <div className={styles.slide1Noise} />

      {/* Top badge */}
      <header className={styles.slide1Top}>
        <div className={styles.slide1TopPill}>
          <img src="/mlb-logo.png" alt="" className={styles.slide1TopLogo} crossOrigin="anonymous" onError={e => { e.currentTarget.style.display = 'none'; }} />
          <span className={styles.slide1TopLabel}>MAXIMUS SPORTS</span>
        </div>
      </header>

      {/* Headline */}
      <section className={styles.slide1HeadlineBlock}>
        <h1 className={styles.slide1Headline}>
          <span>MLB IS BACK.</span>
          <span>THE EDGE IS LIVE.</span>
        </h1>
        <div className={styles.slide1Subhead}>2026 SEASON STARTS NOW</div>
      </section>

      {/* Hero mascot */}
      <section className={styles.slide1Hero}>
        <div className={styles.slide1HeroHalo} />
        <img
          src="/mascot-mlb.png"
          alt="Maximus"
          className={styles.slide1Mascot}
          crossOrigin="anonymous"
          onError={e => { e.currentTarget.style.display = 'none'; }}
        />
        <div className={styles.slide1HeroShadow} />
      </section>

      {/* Bottom briefing card */}
      <section className={styles.slide1BriefingCardWrap}>
        <div className={styles.slide1BriefingGlow} />
        <div className={styles.slide1BriefingCard}>
          <div className={styles.slide1BriefingTitle}>DAILY MLB BRIEFING</div>
          <div className={styles.slide1BriefingDate}>{today}</div>
        </div>
      </section>

      <footer className={styles.slide1Footer}>
        <div className={styles.slide1Site}>maximussports.ai</div>
      </footer>
    </div>
  );
}
