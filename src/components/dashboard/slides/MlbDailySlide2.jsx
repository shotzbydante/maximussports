/**
 * MlbDailySlide2 — Intel Briefing (Slide 2 of MLB Daily Briefing carousel)
 *
 * Purpose: The story — scannable editorial intel
 * Content: Headline + HOT OFF THE PRESS (feature card) + PENNANT RACE + MARKET SIGNAL (split)
 *
 * 1080×1350 · IG 4:5 portrait
 */

import { buildDailyContent } from './mlbDailyHelpers';
import styles from './MlbSlides.module.css';

/** Inline SVG icons */
function BoltIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className={styles.s2CardIcon}>
      <path d="M8.5 1L3 9h4.5l-1 6L13 7H8.5l1-6z" stroke="rgba(255,255,255,0.70)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function PennantIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className={styles.s2CardIcon}>
      <path d="M3 2v12M3 3l9 2.5L3 8" stroke="rgba(255,255,255,0.70)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function PulseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className={styles.s2CardIcon}>
      <polyline points="1,8 4,8 6,3 8,12 10,6 12,8 15,8" stroke="rgba(255,255,255,0.70)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const EDITORIAL_ICONS = {
  'HOT OFF THE PRESS': BoltIcon,
  'PENNANT RACE INSIGHTS': PennantIcon,
  'MARKET SIGNAL': PulseIcon,
};

export default function MlbDailySlide2({ data, asOf, ...rest }) {
  const content = buildDailyContent(data);
  const blocks = content.editorialBlocks || [];

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    timeZone: 'America/Los_Angeles',
  });

  return (
    <div className={styles.artboard} {...rest}>
      <div className={styles.bgBase} />
      <div className={styles.bgGlow} />
      <div className={styles.bgNoise} />

      {/* Header */}
      <div className={styles.s2Header}>
        <div className={styles.s2BadgeRow}>
          <img src="/mlb-logo.png" alt="" className={styles.s2MlbCrest} crossOrigin="anonymous" onError={e => { e.currentTarget.style.display = 'none'; }} />
          <span className={styles.s2Badge}>TODAY'S INTEL BRIEFING</span>
        </div>
        <span className={styles.s2DateLine}>{today}</span>
      </div>

      {/* Hero headline */}
      <div className={styles.s2HeroZone}>
        <h2 className={styles.s2Headline}>{content.headline}</h2>
        {content.subheadline && <p className={styles.s2Subhead}>{content.subheadline}</p>}
      </div>

      {/* Editorial section */}
      <div className={styles.s2EditorialSection}>
        {/* Feature card: HOT OFF THE PRESS */}
        {blocks[0] && (() => {
          const IconComp = EDITORIAL_ICONS[blocks[0].title];
          return (
            <div className={styles.s2FeatureCard}>
              <div className={styles.s2CardHeader}>
                {IconComp && <IconComp />}
                <span className={styles.s2CardLabel}>{blocks[0].title}</span>
              </div>
              <div className={styles.s2FeatureBody}>{blocks[0].body}</div>
            </div>
          );
        })()}

        {/* Split grid: PENNANT RACE + MARKET SIGNAL */}
        {blocks.length >= 2 && (
          <div className={styles.s2SplitRow}>
            {blocks.slice(1, 3).map((block, i) => {
              const IconComp = EDITORIAL_ICONS[block.title];
              return (
                <div key={i} className={styles.s2SplitCard}>
                  <div className={styles.s2CardHeader}>
                    {IconComp && <IconComp />}
                    <span className={styles.s2CardLabel}>{block.title}</span>
                  </div>
                  <div className={styles.s2SplitCardBody}>{block.body}</div>
                </div>
              );
            })}
          </div>
        )}
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
