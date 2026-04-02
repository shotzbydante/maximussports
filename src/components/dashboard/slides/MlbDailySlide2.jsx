/**
 * MlbDailySlide2 — Intel Briefing (Slide 2 of MLB Daily Briefing carousel)
 *
 * The editorial heart of the carousel. Feels like a Sports Illustrated /
 * ESPN premium social editorial card — rich, immersive, readable.
 *
 * Composition: Brand pill → Headline → Feature briefing card → Support grid
 *
 * 1080×1350 · IG 4:5 portrait
 */

import { buildDailyContent, stripEmojis } from './mlbDailyHelpers';
import { parseBriefingToIntel } from '../../../features/mlb/contentStudio/normalizeMlbImagePayload';
import styles from './MlbSlides.module.css';

/** Build richer editorial content for Slide 2's dedicated real estate */
function buildSlide2Blocks(data) {
  const intel = parseBriefingToIntel(data?.mlbBriefing);
  if (!intel?.rawParagraphs?.length) return null;

  const extract = (paraIdx, maxSentences) => {
    const para = intel.rawParagraphs[paraIdx];
    if (!para) return '';
    const cleaned = stripEmojis(para);
    if (!cleaned || cleaned.length < 30) return '';
    const labelMatch = cleaned.match(/^([A-Z][A-Z\s&+\-:]*[A-Z])\s*[:—–-]\s*/);
    const bodyText = labelMatch ? cleaned.slice(labelMatch[0].length) : cleaned;
    const sentences = bodyText.match(/[^.!?]*[.!?]+/g) || [bodyText];
    return sentences.slice(0, maxSentences).join(' ').trim();
  };

  // P1 = Around the League (HOT OFF THE PRESS) — get 4-5 sentences for feature card
  const feature = extract(0, 5);
  // P3 = Pennant Race — 3 sentences
  const pennant = extract(2, 3);
  // P2 = World Series Odds Pulse (MARKET SIGNAL) — 3 sentences
  const market = extract(1, 3);

  return { feature, pennant, market };
}

/** Inline SVG icons */
function BoltIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className={styles.s2CardIcon}>
      <path d="M8.5 1L3 9h4.5l-1 6L13 7H8.5l1-6z" stroke="rgba(255,255,255,0.75)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function PennantIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className={styles.s2CardIcon}>
      <path d="M3 2v12M3 3l9 2.5L3 8" stroke="rgba(255,255,255,0.75)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function PulseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className={styles.s2CardIcon}>
      <polyline points="1,8 4,8 6,3 8,12 10,6 12,8 15,8" stroke="rgba(255,255,255,0.75)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function MlbDailySlide2({ data, asOf, ...rest }) {
  const content = buildDailyContent(data);
  const richBlocks = buildSlide2Blocks(data);

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    timeZone: 'America/Los_Angeles',
  });

  // Use rich content if available, fall back to standard blocks
  const featureBody = richBlocks?.feature || content.editorialBlocks?.[0]?.body || '';
  const pennantBody = richBlocks?.pennant || content.editorialBlocks?.[1]?.body || '';
  const marketBody = richBlocks?.market || content.editorialBlocks?.[2]?.body || '';

  return (
    <div className={styles.artboard} {...rest}>
      <div className={styles.bgBase} />
      <div className={styles.bgGlow} />
      <div className={styles.bgRay} />
      <div className={styles.s2BgStadium} />
      <div className={styles.bgNoise} />

      {/* Brand pill — matching slide 1 */}
      <div className={styles.s2TopBar}>
        <div className={styles.s2BrandPill}>
          <img src="/mlb-logo.png" alt="" className={styles.s2MlbCrest} crossOrigin="anonymous" onError={e => { e.currentTarget.style.display = 'none'; }} />
          <span className={styles.s2BrandText}>TODAY'S INTEL BRIEFING</span>
        </div>
        <span className={styles.s2DateLine}>{today}</span>
      </div>

      {/* Headline zone */}
      <div className={styles.s2HeadlineZone}>
        <h2 className={styles.s2Headline}>{content.headline}</h2>
        {content.subheadline && <p className={styles.s2Subhead}>{content.subheadline}</p>}
      </div>

      {/* Feature briefing card — HOT OFF THE PRESS */}
      <div className={styles.s2ContentZone}>
        <div className={styles.s2FeatureCard}>
          <div className={styles.s2FeatureTopLine} />
          <div className={styles.s2CardHeader}>
            <BoltIcon />
            <span className={styles.s2CardLabel}>HOT OFF THE PRESS</span>
          </div>
          <div className={styles.s2FeatureBody}>{featureBody}</div>
        </div>

        {/* Support grid — PENNANT RACE + MARKET SIGNAL */}
        <div className={styles.s2SplitRow}>
          {/* Pennant Race card */}
          <div className={styles.s2SplitCard}>
            <div className={styles.s2CardHeader}>
              <PennantIcon />
              <span className={styles.s2CardLabel}>PENNANT RACE</span>
            </div>
            <div className={styles.s2SplitBody}>{pennantBody}</div>
          </div>

          {/* Market Signal card */}
          <div className={styles.s2SplitCard}>
            <div className={styles.s2CardHeader}>
              <PulseIcon />
              <span className={styles.s2CardLabel}>MARKET SIGNAL</span>
            </div>
            <div className={styles.s2SplitBody}>{marketBody}</div>
          </div>
        </div>
      </div>

      {/* Swipe hint */}
      <div className={styles.s2SwipeHint}>
        <span className={styles.s2SwipeText}>Swipe for World Series Outlook →</span>
      </div>

      <footer className={styles.footer}>
        <span className={styles.footerUrl}>maximussports.ai</span>
        <span className={styles.footerDisclaimer}>For entertainment only. Please bet responsibly. 21+</span>
      </footer>
    </div>
  );
}
