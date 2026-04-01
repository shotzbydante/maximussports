/**
 * MlbDailySlide3 — Model Board + CTA (Slide 3 of MLB Daily Briefing carousel)
 *
 * Purpose: Data showcase + conversion
 * Content: World Series Outlook (6 team cards) + CTA block
 *
 * With a full slide dedicated to the board, cards can be larger
 * and more readable than in the single-slide version.
 *
 * 1080×1350 · IG 4:5 portrait
 */

import { getMlbEspnLogoUrl } from '../../../utils/espnMlbLogos';
import { buildDailyContent, buildCardRationale, fmtOdds } from './mlbDailyHelpers';
import styles from './MlbDailySlide3.module.css';

function TeamLogo({ slug, size = 28 }) {
  const url = getMlbEspnLogoUrl(slug);
  if (!url) return null;
  return <img src={url} alt="" width={size} height={size} className={styles.teamLogo} crossOrigin="anonymous" onError={e => { e.currentTarget.style.display = 'none'; }} />;
}

/** Inline SVG trophy icon */
function TrophyIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={styles.trophyIcon}>
      <path d="M4 2h8v1.5c0 2.5-1.5 4.5-4 5.5-2.5-1-4-3-4-5.5V2z" stroke="rgba(255,215,0,0.70)" strokeWidth="1.0" fill="rgba(255,215,0,0.08)" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 3.5H2.5c0 1.5 0.8 2.5 1.5 3M12 3.5h1.5c0 1.5-0.8 2.5-1.5 3" stroke="rgba(255,215,0,0.50)" strokeWidth="0.8" strokeLinecap="round" />
      <path d="M6.5 9.5v1.5h3V9.5M5.5 11h5v1H5.5z" stroke="rgba(255,215,0,0.50)" strokeWidth="0.8" fill="rgba(255,215,0,0.05)" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function getCardLabel(t) {
  if (t.rank === 1) return `${t.league} LEADER`;
  return `${t.league} ${t.rank}`;
}

function TeamCard({ t }) {
  const isLeader = t.rank === 1;
  const rationale = buildCardRationale(t);
  return (
    <div className={`${styles.teamCard} ${isLeader ? styles.teamCardLeader : ''}`}>
      {/* Top: label + logo + name LEFT, trophy + odds RIGHT */}
      <div className={styles.tcTopRow}>
        <div className={styles.tcTopLeft}>
          <span className={styles.tcLabel}>{getCardLabel(t)}</span>
          <div className={styles.tcIdentity}>
            <TeamLogo slug={t.slug} size={isLeader ? 48 : 40} />
            <span className={styles.tcName}>{t.abbrev}</span>
          </div>
        </div>
        <div className={styles.tcOddsBlock}>
          <TrophyIcon size={isLeader ? 22 : 18} />
          <span className={styles.tcOddsValue}>{fmtOdds(t.odds)}</span>
        </div>
      </div>
      {/* Hero: unified projected wins */}
      <div className={styles.tcHero}>
        <span className={styles.tcHeroWins}>{t.projectedWins}</span>
        <span className={styles.tcHeroLabel}>PROJECTED WINS</span>
        {t.signals?.[0] && <span className={styles.tcSignal}>{t.signals[0]}</span>}
      </div>
      {/* Rationale */}
      <div className={styles.tcRationale}>{rationale}</div>
    </div>
  );
}

export default function MlbDailySlide3({ data, asOf, ...rest }) {
  const content = buildDailyContent(data);
  const seasonIntel = content.seasonIntel;

  return (
    <div className={styles.artboard} {...rest}>
      <div className={styles.bgBase} />
      <div className={styles.bgGlow} />

      {/* Header */}
      <div className={styles.header}>
        <img src="/mlb-logo.png" alt="" className={styles.mlbCrest} crossOrigin="anonymous" onError={e => { e.currentTarget.style.display = 'none'; }} />
        <h2 className={styles.outlookTitle}>WORLD SERIES OUTLOOK</h2>
      </div>

      {/* 6-card grid */}
      {seasonIntel && (
        <div className={styles.outlookGrid}>
          {seasonIntel.map((t, i) => (
            <TeamCard key={i} t={t} />
          ))}
        </div>
      )}

      {/* CTA block */}
      <div className={styles.ctaSection}>
        <div className={styles.ctaCard}>
          <h3 className={styles.ctaHeadline}>Get the full edge</h3>
          <p className={styles.ctaSubtext}>Daily AI-powered picks, projections, and insights</p>
          <div className={styles.ctaButton}>
            <span className={styles.ctaButtonText}>View today's picks →</span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className={styles.footer}>
        <span className={styles.footerUrl}>maximussports.ai</span>
        <span className={styles.footerDisclaimer}>For entertainment only. Please bet responsibly. 21+</span>
      </footer>
    </div>
  );
}
