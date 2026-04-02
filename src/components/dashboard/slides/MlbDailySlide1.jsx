/**
 * MlbDailySlide1 — Hero Cover (Slide 1 of MLB Daily Briefing carousel)
 *
 * Top: Briefing plaque (title + date)
 * Middle: Headline + Mascot hero
 * Bottom: One-sentence daily synopsis beneath mascot
 *
 * 1080×1350 · IG 4:5 portrait
 */

import { stripEmojis } from './mlbDailyHelpers';
import { parseBriefingToIntel } from '../../../features/mlb/contentStudio/normalizeMlbImagePayload';
import styles from './MlbSlides.module.css';

/** Build a punchy 2-line hero headline from the day's briefing */
function buildHeroHeadline(data) {
  const intel = parseBriefingToIntel(data?.mlbBriefing);
  const paras = intel?.rawParagraphs || [];
  const p1 = stripEmojis(paras[0] || '');

  const names = [];
  const namePatterns = [
    /([A-Z][a-z]+ (?:Fernandez|Ohtani|Painter|Judge|Soto|Acuna|Betts|Trout|deGrom|Cole|Verlander|Stanton|Adames))/g,
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
  return { line1: 'DEBUTS LAND.', line2: 'CONTENDERS ANSWER.' };
}

/** Build a 1-sentence synopsis from the briefing */
function buildSynopsis(data) {
  const intel = parseBriefingToIntel(data?.mlbBriefing);
  const paras = intel?.rawParagraphs || [];
  const p1 = stripEmojis(paras[0] || '');
  const sents = (p1.match(/[^.!?]*[.!?]+/g) || []).map(s => s.trim());
  if (sents[0] && sents[0].length > 20) {
    const s = sents[0].length > 90 ? sents[0].slice(0, 88).replace(/\s+\S*$/, '') + '.' : sents[0];
    return s;
  }
  return 'Stars and contenders are making early statements across the league.';
}

export default function MlbDailySlide1({ data, asOf, ...rest }) {
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    timeZone: 'America/Los_Angeles',
  });

  const hero = buildHeroHeadline(data);
  const synopsis = buildSynopsis(data);

  return (
    <div className={styles.slide1} {...rest}>
      <div className={styles.slide1BgBase} />
      <div className={styles.slide1BgLights} />
      <div className={styles.slide1BgArena} />
      <div className={styles.slide1BgParticles} />
      <div className={styles.slide1Noise} />

      {/* Top briefing plaque */}
      <header className={styles.slide1Top}>
        <div className={styles.slide1TopPill}>
          <img src="/mlb-logo.png" alt="" className={styles.slide1TopLogo} crossOrigin="anonymous" onError={e => { e.currentTarget.style.display = 'none'; }} />
          <span className={styles.slide1TopLabel}>MAXIMUS SPORTS</span>
        </div>
      </header>

      {/* Briefing card — now above headline as top plaque */}
      <section className={styles.slide1BriefingPlaque}>
        <div className={styles.slide1PlaqueTitle}>DAILY MLB BRIEFING</div>
        <div className={styles.slide1PlaqueDate}>{today}</div>
      </section>

      {/* Headline */}
      <section className={styles.slide1HeadlineBlock}>
        <h1 className={styles.slide1Headline}>
          <span>{hero.line1}</span>
          <span>{hero.line2}</span>
        </h1>
      </section>

      {/* Hero mascot */}
      <section className={styles.slide1Hero}>
        <div className={styles.slide1HeroHalo} />
        <img src="/mascot-mlb.png" alt="Maximus" className={styles.slide1Mascot} crossOrigin="anonymous" onError={e => { e.currentTarget.style.display = 'none'; }} />
        <div className={styles.slide1HeroShadow} />
      </section>

      {/* Synopsis card beneath mascot */}
      <section className={styles.slide1SynopsisWrap}>
        <div className={styles.slide1SynopsisGlow} />
        <div className={styles.slide1SynopsisCard}>
          <div className={styles.slide1SynopsisText}>{synopsis}</div>
        </div>
      </section>

      <footer className={styles.slide1Footer}>
        <div className={styles.slide1Site}>maximussports.ai</div>
      </footer>
    </div>
  );
}
