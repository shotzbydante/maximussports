/**
 * MlbDailySlide1 — Hero Cover (Slide 1 of MLB Daily Briefing carousel)
 *
 * Day-specific headline pulled from the MLB briefing source.
 * 1080×1350 · IG 4:5 portrait
 */

import { buildDailyContent, stripEmojis } from './mlbDailyHelpers';
import { parseBriefingToIntel } from '../../../features/mlb/contentStudio/normalizeMlbImagePayload';
import styles from './MlbSlides.module.css';

/** Build a punchy 2-line hero headline from the day's briefing */
function buildHeroHeadline(data) {
  const intel = parseBriefingToIntel(data?.mlbBriefing);
  const paras = intel?.rawParagraphs || [];
  const p1 = stripEmojis(paras[0] || '');

  // Extract key names/teams/events from first paragraph
  const names = [];
  const namePatterns = [
    /([A-Z][a-z]+ (?:Fernandez|Ohtani|Painter|Judge|Soto|Acuna|Betts|Trout|deGrom|Cole|Verlander))/g,
    /(Dodgers|Yankees|Braves|Phillies|Astros|Mets|Blue Jays|D-backs|Diamondbacks)/gi,
  ];
  for (const pat of namePatterns) {
    const matches = p1.match(pat);
    if (matches) names.push(...matches.slice(0, 2));
  }

  if (names.length >= 2) {
    const n1 = names[0].split(' ').pop().toUpperCase();
    const n2 = names[1].split(' ').pop().toUpperCase();
    return { line1: `${n1} BREAKS THROUGH.`, line2: `${n2} SETS THE TONE.` };
  }
  if (names.length === 1) {
    const n1 = names[0].split(' ').pop().toUpperCase();
    return { line1: `${n1} DELIVERS.`, line2: 'THE BOARD TAKES SHAPE.' };
  }

  // Fallback: still day-relevant
  return { line1: 'DEBUTS LAND.', line2: 'CONTENDERS ANSWER.' };
}

export default function MlbDailySlide1({ data, asOf, ...rest }) {
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    timeZone: 'America/Los_Angeles',
  });

  const hero = buildHeroHeadline(data);

  return (
    <div className={styles.slide1} {...rest}>
      <div className={styles.slide1BgBase} />
      <div className={styles.slide1BgLights} />
      <div className={styles.slide1BgArena} />
      <div className={styles.slide1BgParticles} />
      <div className={styles.slide1Noise} />

      <header className={styles.slide1Top}>
        <div className={styles.slide1TopPill}>
          <img src="/mlb-logo.png" alt="" className={styles.slide1TopLogo} crossOrigin="anonymous" onError={e => { e.currentTarget.style.display = 'none'; }} />
          <span className={styles.slide1TopLabel}>MAXIMUS SPORTS</span>
        </div>
      </header>

      <section className={styles.slide1HeadlineBlock}>
        <h1 className={styles.slide1Headline}>
          <span>{hero.line1}</span>
          <span>{hero.line2}</span>
        </h1>
        <div className={styles.slide1Subhead}>2026 SEASON STARTS NOW</div>
      </section>

      <section className={styles.slide1Hero}>
        <div className={styles.slide1HeroHalo} />
        <img src="/mascot-mlb.png" alt="Maximus" className={styles.slide1Mascot} crossOrigin="anonymous" onError={e => { e.currentTarget.style.display = 'none'; }} />
        <div className={styles.slide1HeroShadow} />
      </section>

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
