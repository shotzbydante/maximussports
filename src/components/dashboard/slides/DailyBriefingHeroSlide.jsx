/**
 * DailyBriefingHeroSlide — Instagram Hero · Daily Briefing
 *
 * Premium, ESPN-level broadcast graphic for the daily briefing IG post.
 * Consumes the IGBriefingViewModel produced by the dailyIntelToIG transformation layer,
 * which reads from the Home Page Daily Intel (source of truth) without modifying it.
 *
 * Content hierarchy (SportsCenter-inspired):
 *   1. Broadcast header — Maximus branding + timestamp badge
 *   2. NCAA crest + date strip
 *   3. Dominant headline with cinematic dividers
 *   4. Subheadline / deck line
 *   5. Intel panel — structured bullets with section icons
 *   6. Title leaderboard — scoreboard-style ticker
 *   7. Last night results — editorial recap
 *   8. Broadcast footer
 */

import { transformDigestToIG } from '../../../utils/dailyIntelToIG';
import { getTeamSlug } from '../../../utils/teamSlug';
import styles from './DailyBriefingHeroSlide.module.css';

function NcaaLogo({ className }) {
  return (
    <img
      src="/logos/ncaa.png"
      alt="NCAA"
      className={className}
      crossOrigin="anonymous"
      data-fallback-text="NCAA"
      onError={e => {
        const span = document.createElement('span');
        span.textContent = 'NCAA';
        span.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;letter-spacing:0.12em;color:rgba(255,255,255,0.55);text-transform:uppercase;';
        span.setAttribute('aria-label', 'NCAA');
        e.currentTarget.replaceWith(span);
      }}
    />
  );
}

export default function DailyBriefingHeroSlide({ data, asOf, ...rest }) {
  const digest = data?.chatDigest ?? null;
  const vm = transformDigestToIG(digest);

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    timeZone: 'America/Los_Angeles',
  });

  return (
    <div className={styles.artboard} {...rest}>
      {/* Background layers — cinematic depth */}
      <div className={styles.bgBase} aria-hidden="true" />
      <div className={styles.bgGlow} aria-hidden="true" />
      <div className={styles.bgRay} aria-hidden="true" />
      <div className={styles.bgScanlines} aria-hidden="true" />
      <div className={styles.bgNoise} aria-hidden="true" />

      {/* Broadcast header */}
      <header className={styles.header}>
        <div className={styles.logoRow}>
          <img src="/logo.png" alt="Maximus Sports" className={styles.brandLogo} crossOrigin="anonymous" />
          <div className={styles.logoMeta}>
            <span className={styles.brandName}>MAXIMUS SPORTS</span>
            <span className={styles.intelChip}>DAILY BRIEFING</span>
          </div>
        </div>
        <div className={styles.headerRight}>
          {asOf && <div className={styles.asOf}>As of {asOf}</div>}
          <div className={styles.maxIntel}>MAXIMUM INTELLIGENCE</div>
        </div>
      </header>

      <div className={styles.programStrip} aria-hidden="true" />

      {/* NCAA crest + date */}
      <div className={styles.ncaaLogoZone}>
        <NcaaLogo className={styles.ncaaLogo} />
      </div>

      <div className={styles.dateZone}>
        <span className={styles.dateLabel}>{today}</span>
        <span className={styles.dateSub}>College Basketball Intelligence</span>
      </div>

      {/* Dominant headline */}
      <div className={styles.headlineZone}>
        <div className={styles.headlineDivider} />
        <h2 className={styles.headline}>
          {vm.headline.map((line, i) => (
            <span key={i} className={styles.headlineLine}>{line}</span>
          ))}
        </h2>
        <div className={styles.headlineDividerBottom} />
      </div>

      {vm.subheadline && (
        <div className={styles.quickIntel}>{vm.subheadline}</div>
      )}

      {/* Intel panel */}
      {vm.intelBullets.length > 0 && (
        <div className={styles.bulletModule}>
          <div className={styles.bulletModuleHeader}>
            <span className={styles.bulletHeaderDot} />
            TODAY&rsquo;S INTEL
          </div>
          <ul className={styles.bulletList}>
            {vm.intelBullets.map((b, i) => (
              <li key={i} className={styles.bulletItem}>
                <span className={styles.bulletIcon}>{b.icon}</span>
                <span className={styles.bulletText}>{b.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Title leaderboard */}
      {vm.titleBoard.length > 0 && (
        <div className={styles.titleRaceSection}>
          <div className={styles.titleRaceHeader}>
            <span className={styles.sectionHeaderDot} />
            LIVE TITLE BOARD
          </div>
          <div className={styles.titleRaceGrid}>
            {vm.titleBoard.map((t, i) => (
              <div
                key={i}
                className={`${styles.titleRaceChip} ${i === 0 ? styles.titleRaceChipTop : ''}`}
              >
                <span className={styles.titleRaceRank}>#{t.rank}</span>
                {t.slug && (
                  <img
                    src={`/logos/${t.slug}.png`}
                    alt=""
                    className={styles.titleRaceLogo}
                    crossOrigin="anonymous"
                    data-fallback-text={t.name?.slice(0, 2)?.toUpperCase() || ''}
                    onError={e => { e.currentTarget.style.display = 'none'; }}
                  />
                )}
                <div className={styles.titleRaceMeta}>
                  <span className={styles.titleRaceName}>{t.name}</span>
                </div>
                <span className={styles.titleRaceOdds}>{t.odds}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Last night results */}
      {vm.recentResults.length > 0 && (
        <div className={styles.recentResultsSection}>
          <div className={styles.recentResultsHeader}>
            <span className={styles.sectionHeaderDot} />
            LAST NIGHT
          </div>
          <div className={styles.recentResultsList}>
            {vm.recentResults.map((r, i) => (
              <div key={i} className={styles.recentResultItem}>
                {r.emoji && <span className={styles.resultEmoji}>{r.emoji}</span>}
                <span className={styles.resultText}>{r.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Broadcast footer */}
      <footer className={styles.footer}>
        <span className={styles.footerUrl}>maximussports.ai</span>
        <span className={styles.footerDisclaimer}>
          For entertainment only. Please bet responsibly. 21+
        </span>
      </footer>
    </div>
  );
}
