/**
 * MlbDailySlide1 — Hero Cover (Slide 1 of MLB Daily Briefing carousel)
 *
 * Hierarchy: Brand pill → Glass briefing plaque → Mascot hero → Day headline
 * 1080×1350 · IG 4:5 portrait
 *
 * Headlines are now driven by `buildMlbDailyHeadline()` which uses
 * live game results, briefing text, and season model data for
 * daily-changing, reactive hero titles.
 */

import { buildMlbDailyHeadline } from '../../../features/mlb/contentStudio/buildMlbDailyHeadline';
import styles from './MlbSlides.module.css';

export default function MlbDailySlide1({ data, asOf, ...rest }) {
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    timeZone: 'America/Los_Angeles',
  });

  const { heroTitle } = buildMlbDailyHeadline({
    liveGames: data?.mlbLiveGames || [],
    briefing: data?.mlbBriefing,
    seasonIntel: null,
  });

  return (
    <div className={styles.slide1} {...rest}>
      <div className={styles.slide1BgBase} />
      <div className={styles.slide1BgLights} />
      <div className={styles.slide1BgArena} />
      <div className={styles.slide1BgParticles} />
      <div className={styles.slide1Noise} />

      {/* Top brand pill */}
      <header className={styles.slide1TopBrand}>
        <div className={styles.slide1TopBrandPill}>
          <img src="/mlb-logo.png" alt="" className={styles.slide1TopBrandLogo} crossOrigin="anonymous" onError={e => { e.currentTarget.style.display = 'none'; }} />
          <span>MAXIMUS SPORTS</span>
        </div>
      </header>

      {/* Hero briefing plaque — glass box in upper quarter */}
      <section className={styles.slide1BriefingHero}>
        <div className={styles.slide1BriefingHeroGlow} />
        <div className={styles.slide1BriefingHeroCard}>
          <div className={styles.slide1BriefingHeroTitle}>DAILY MLB BRIEFING</div>
          <div className={styles.slide1BriefingHeroDate}>{today}</div>
        </div>
      </section>

      {/* Mascot — centered hero */}
      <section className={styles.slide1MascotZone}>
        <div className={styles.slide1MascotHalo} />
        <img src="/mascot-mlb.png" alt="Maximus" className={styles.slide1Mascot} crossOrigin="anonymous" onError={e => { e.currentTarget.style.display = 'none'; }} />
        <div className={styles.slide1MascotShadow} />
      </section>

      {/* Day-specific headline — below mascot */}
      <section className={styles.slide1HeadlineZone}>
        <h1 className={styles.slide1Headline}>{heroTitle}</h1>
      </section>

      <footer className={styles.slide1Footer}>
        <div className={styles.slide1Site}>maximussports.ai</div>
      </footer>
    </div>
  );
}
