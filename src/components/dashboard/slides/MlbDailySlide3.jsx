/**
 * MlbDailySlide3 — World Series Outlook + CTA (Slide 3 of MLB Daily Briefing carousel)
 *
 * Purpose: Data showcase + conversion
 * Content: 6 team cards (top 2 featured, bottom 4 standard) + CTA
 *
 * 1080×1350 · IG 4:5 portrait
 */

import { getMlbEspnLogoUrl } from '../../../utils/espnMlbLogos';
import { buildDailyContent, buildCardRationale, fmtOdds, fmtDelta } from './mlbDailyHelpers';
import styles from './MlbSlides.module.css';

function TeamLogo({ slug, size = 28 }) {
  const url = getMlbEspnLogoUrl(slug);
  if (!url) return null;
  return <img src={url} alt="" width={size} height={size} className={styles.s3TeamLogo} crossOrigin="anonymous" onError={e => { e.currentTarget.style.display = 'none'; }} />;
}

/** Inline SVG trophy */
function TrophyIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={styles.s3TrophyIcon}>
      <path d="M4 2h8v1.5c0 2.5-1.5 4.5-4 5.5-2.5-1-4-3-4-5.5V2z" stroke="rgba(255,215,0,0.75)" strokeWidth="1.0" fill="rgba(255,215,0,0.10)" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 3.5H2.5c0 1.5 0.8 2.5 1.5 3M12 3.5h1.5c0 1.5-0.8 2.5-1.5 3" stroke="rgba(255,215,0,0.55)" strokeWidth="0.8" strokeLinecap="round" />
      <path d="M6.5 9.5v1.5h3V9.5M5.5 11h5v1H5.5z" stroke="rgba(255,215,0,0.55)" strokeWidth="0.8" fill="rgba(255,215,0,0.06)" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function getCardLabel(t) {
  if (t.rank === 1) return `${t.league} LEADER`;
  return `${t.league} ${t.rank}`;
}

/** Build compact 1-line insight from model data */
function buildInsightLine(t) {
  const parts = [];
  if (t.marketDelta != null && t.marketDelta !== 0) {
    parts.push(`${fmtDelta(t.marketDelta)} vs market`);
  }
  if (t.signals?.[0]) parts.push(t.signals[0]);
  else if (t.strongestDriver) parts.push(t.strongestDriver);
  return parts.join(' \u00b7 ') || `${t.confidenceTier || 'Projected'} outlook`;
}

function TeamCard({ t, featured = false }) {
  const insight = buildInsightLine(t);
  const cardClass = featured ? styles.s3CardFeatured : styles.s3Card;
  return (
    <div className={cardClass}>
      <div className={styles.s3CardTop}>
        <div className={styles.s3CardTopLeft}>
          <span className={styles.s3CardRankLabel}>{getCardLabel(t)}</span>
          <div className={styles.s3CardIdentity}>
            <TeamLogo slug={t.slug} size={featured ? 44 : 36} />
            <span className={styles.s3TeamName}>{t.abbrev}</span>
          </div>
        </div>
        <div className={styles.s3OddsBadge}>
          <TrophyIcon size={featured ? 20 : 16} />
          <span className={styles.s3OddsValue}>{fmtOdds(t.odds)}</span>
        </div>
      </div>
      <div className={styles.s3WinsHero}>
        <span className={styles.s3WinsNumber}>{t.projectedWins}</span>
        <span className={styles.s3WinsLabel}>PROJECTED WINS</span>
        {t.signals?.[0] && <span className={styles.s3SignalBadge}>{t.signals[0]}</span>}
      </div>
      <div className={styles.s3Rationale}>{insight}</div>
    </div>
  );
}

export default function MlbDailySlide3({ data, asOf, ...rest }) {
  const content = buildDailyContent(data);
  const seasonIntel = content.seasonIntel || [];

  return (
    <div className={styles.artboard} {...rest}>
      <div className={styles.bgBase} />
      <div className={styles.bgGlow} />
      <div className={styles.bgNoise} />

      {/* Header */}
      <div className={styles.s3Header}>
        <img src="/mlb-logo.png" alt="" className={styles.s3MlbCrest} crossOrigin="anonymous" onError={e => { e.currentTarget.style.display = 'none'; }} />
        <h2 className={styles.s3Title}>WORLD SERIES OUTLOOK</h2>
        <span className={styles.s3Subtitle}>WHO HAS THE EDGE?</span>
      </div>

      {/* 6-card grid */}
      <div className={styles.s3Grid}>
        {seasonIntel.map((t, i) => (
          <TeamCard key={i} t={t} featured={t.rank === 1} />
        ))}
      </div>

      {/* CTA */}
      <div className={styles.s3CtaSection}>
        <div className={styles.s3CtaCard}>
          <h3 className={styles.s3CtaHeadline}>FIND TODAY'S EDGE</h3>
          <p className={styles.s3CtaSubtext}>Daily AI-powered picks, projections, and insights</p>
          <div className={styles.s3CtaButton}>
            <span className={styles.s3CtaButtonText}>VIEW PICKS →</span>
          </div>
        </div>
      </div>

      <footer className={styles.footer}>
        <span className={styles.footerUrl}>maximussports.ai</span>
        <span className={styles.footerDisclaimer}>For entertainment only. Please bet responsibly. 21+</span>
      </footer>
    </div>
  );
}
