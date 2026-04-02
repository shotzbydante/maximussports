/**
 * MlbDailySlide2 — Intel Briefing (Slide 2 of MLB Daily Briefing carousel)
 *
 * Editorial heart of carousel. Premium social editorial card.
 * Composition: Brand pill → Headline → Feature card → Support grid
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

  return {
    feature: extract(0, 5),
    pennant: extract(2, 3),
    market: extract(1, 3),
  };
}

function BoltIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className={styles.cardIcon}>
      <path d="M8.5 1L3 9h4.5l-1 6L13 7H8.5l1-6z" stroke="rgba(255,255,255,0.75)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function PennantIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className={styles.cardIcon}>
      <path d="M3 2v12M3 3l9 2.5L3 8" stroke="rgba(255,255,255,0.75)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function PulseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className={styles.cardIcon}>
      <polyline points="1,8 4,8 6,3 8,12 10,6 12,8 15,8" stroke="rgba(255,255,255,0.75)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function MlbDailySlide2({ data, asOf, ...rest }) {
  const content = buildDailyContent(data);
  const rich = buildSlide2Blocks(data);
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    timeZone: 'America/Los_Angeles',
  });

  const featureBody = rich?.feature || content.editorialBlocks?.[0]?.body || '';
  const pennantBody = rich?.pennant || content.editorialBlocks?.[1]?.body || '';
  const marketBody = rich?.market || content.editorialBlocks?.[2]?.body || '';

  return (
    <div className={`${styles.artboard} ${styles.liveMotion}`} {...rest}>
      <div className={styles.bgBase} />
      <div className={styles.bgGlow} />
      <div className={styles.bgRay} />
      <div className={styles.bgStadium} />
      <div className={styles.bgNoise} />

      {/* Brand pill */}
      <div className={styles.s2TopBar}>
        <div className={styles.s2Pill}>
          <img src="/mlb-logo.png" alt="" className={styles.s2PillLogo} crossOrigin="anonymous" onError={e => { e.currentTarget.style.display = 'none'; }} />
          <span>TODAY'S INTEL BRIEFING</span>
        </div>
        <span className={styles.s2Date}>{today}</span>
      </div>

      {/* Headline */}
      <div className={styles.s2HeadZone}>
        <h2 className={styles.s2Headline}>{content.headline}</h2>
        {content.subheadline && <p className={styles.s2Subhead}>{content.subheadline}</p>}
      </div>

      {/* Content zone */}
      <div className={styles.s2Content}>
        {/* Feature card: HOT OFF THE PRESS */}
        <div className={styles.s2Feature}>
          <div className={styles.cardHighlight} />
          <div className={styles.cardLabel}>
            <BoltIcon />
            HOT OFF THE PRESS
          </div>
          <div className={styles.s2FeatureBody}>{featureBody}</div>
        </div>

        {/* Split: PENNANT RACE + MARKET SIGNAL */}
        <div className={styles.s2SplitRow}>
          <div className={styles.s2SplitCard}>
            <div className={styles.cardHighlight} />
            <div className={styles.cardLabel}>
              <PennantIcon />
              PENNANT RACE
            </div>
            <div className={styles.s2SplitBody}>{pennantBody}</div>
          </div>

          <div className={styles.s2SplitCard}>
            <div className={styles.cardHighlight} />
            <div className={styles.cardLabel}>
              <PulseIcon />
              MARKET SIGNAL
            </div>
            <div className={styles.s2SplitBody}>{marketBody}</div>
          </div>
        </div>
      </div>

      {/* Swipe hint */}
      <div className={styles.s2Swipe}>
        <span className={styles.s2SwipeText}>Swipe for World Series Outlook →</span>
      </div>

      <footer className={styles.footer}>
        <span className={styles.footerUrl}>maximussports.ai</span>
        <span className={styles.footerDisclaimer}>For entertainment only. Please bet responsibly. 21+</span>
      </footer>
    </div>
  );
}
