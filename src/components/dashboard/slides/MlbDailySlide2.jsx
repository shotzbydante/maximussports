/**
 * MlbDailySlide2 — Editorial Briefing (Slide 2 of MLB Daily Briefing carousel)
 *
 * Purpose: The story — editorial narrative from MLB home intelligence briefing
 * Content: HOT OFF THE PRESS (full-width) + PENNANT RACE + MARKET SIGNAL (half-width)
 *
 * Now on its own slide, text can be larger and more readable than when
 * squeezed alongside the model board on a single slide.
 *
 * 1080×1350 · IG 4:5 portrait
 */

import { buildDailyContent } from './mlbDailyHelpers';
import styles from './MlbDailySlide2.module.css';

/** Inline SVG icons for editorial sections */
function BoltIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" className={styles.editorialIcon}>
      <path d="M8.5 1L3 9h4.5l-1 6L13 7H8.5l1-6z" stroke="rgba(255,255,255,0.65)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function PennantIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" className={styles.editorialIcon}>
      <path d="M3 2v12M3 3l9 2.5L3 8" stroke="rgba(255,255,255,0.65)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function PulseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" className={styles.editorialIcon}>
      <polyline points="1,8 4,8 6,3 8,12 10,6 12,8 15,8" stroke="rgba(255,255,255,0.65)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
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

      {/* Header */}
      <div className={styles.header}>
        <div className={styles.badgeRow}>
          <img src="/mlb-logo.png" alt="" className={styles.mlbCrest} crossOrigin="anonymous" onError={e => { e.currentTarget.style.display = 'none'; }} />
          <span className={styles.badge}>TODAY'S INTEL BRIEFING</span>
        </div>
        <span className={styles.dateLine}>{today}</span>
      </div>

      {/* Hero headline */}
      <div className={styles.heroZone}>
        <h2 className={styles.headline}>{content.headline}</h2>
        {content.subheadline && <p className={styles.subhead}>{content.subheadline}</p>}
      </div>

      {/* Editorial cards */}
      <div className={styles.editorialSection}>
        {/* Full-width: HOT OFF THE PRESS */}
        {blocks[0] && (() => {
          const IconComponent = EDITORIAL_ICONS[blocks[0].title];
          return (
            <div className={styles.editorialCardFull}>
              <div className={styles.editorialCardHeader}>
                {IconComponent && <IconComponent />}
                <span className={styles.editorialCardLabel}>{blocks[0].title}</span>
              </div>
              <div className={styles.editorialCardBody}>{blocks[0].body}</div>
            </div>
          );
        })()}

        {/* Half-width row */}
        {blocks.length >= 2 && (
          <div className={styles.editorialRow}>
            {blocks.slice(1, 3).map((block, i) => {
              const IconComponent = EDITORIAL_ICONS[block.title];
              return (
                <div key={i} className={styles.editorialCardHalf}>
                  <div className={styles.editorialCardHeader}>
                    {IconComponent && <IconComponent />}
                    <span className={styles.editorialCardLabel}>{block.title}</span>
                  </div>
                  <div className={styles.editorialCardBody}>{block.body}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Swipe hint */}
      <div className={styles.swipeHint}>
        <span className={styles.swipeText}>Swipe for World Series Outlook →</span>
      </div>

      {/* Footer */}
      <footer className={styles.footer}>
        <span className={styles.footerUrl}>maximussports.ai</span>
        <span className={styles.footerDisclaimer}>For entertainment only. Please bet responsibly. 21+</span>
      </footer>
    </div>
  );
}
